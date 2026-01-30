export * from './journals.command.js';
export * from './journals.query.js';

// export async function reverseJournalRecord({
//   journalBatchId,
//   userId,
//   reversalReason,
//   reversalDate,
//   trx,
// }: {
//   journalBatchId: string;
//   userId: string;
//   reversalReason?: string;
//   reversalDate?: Date;
//   trx?: Knex.Transaction;
// }): Promise<ApiResponse<{ reversalJournalId?: string }>> {
//   const startTime = Date.now();
//   const traceId = randomUUID();

//   const log = (phase: string, data?: Record<string, any>) => {
//     const duration_ms = Date.now() - startTime;
//     logger.info(
//       {
//         traceId,
//         phase,
//         duration_ms,
//         journalBatchId,
//         userId,
//         ...data,
//       },
//       `reverseJournalRecord:${phase}`,
//     );
//   };

//   log('starting');

//   const executeTransaction = async (
//     tx: Knex.Transaction,
//   ): Promise<ApiResponse<{ reversalJournalId?: string }>> => {
//     // Validate journal batch exists and is not already voided/reversed
//     const journalBatch = await tx('journal_batches')
//       .where('id', journalBatchId)
//       .where('is_deleted', false)
//       .first();

//     if (!journalBatch) {
//       throw new Error('Journal batch not found or already deleted');
//     }

//     if (journalBatch.status === 'voided') {
//       throw new Error('Journal batch is already voided');
//     }

//     if (journalBatch.reversed_at) {
//       throw new Error('Journal batch has already been reversed');
//     }

//     log('journal_batch_validated', {
//       currentStatus: journalBatch.status,
//       companyId: journalBatch.company_id,
//     });

//     const isDraft = journalBatch.status === 'draft';

//     if (isDraft) {
//       // DRAFT JOURNAL: Simple soft-delete (never hit the ledger)
//       log('handling_draft_journal');

//       // Update journal batch status to voided and mark as deleted
//       await tx('journal_batches').where('id', journalBatchId).update({
//         status: 'voided',
//         updated_by_id: userId,
//         is_deleted: true,
//         updated_at: new Date(),
//         deleted_at: new Date(),
//       });

//       // Mark all journal entries as deleted
//       await tx('journal_entries')
//         .where('journal_batch_id', journalBatchId)
//         .update({
//           is_deleted: true,
//           updated_at: new Date(),
//           deleted_at: new Date(),
//         });

//       log('draft_journal_voided');

//       // Create audit event
//       await tx('audit_events').insert({
//         entity_type: 'journal',
//         entity_id: journalBatchId,
//         action: 'void',
//         payload: {
//           previous_status: journalBatch.status,
//           voided_by: userId,
//           voided_at: new Date().toISOString(),
//         },
//         company_id: journalBatch.company_id,
//         user_id: userId,
//         notes: `Draft journal batch voided by user ${userId}`,
//       });

//       log('audit_event_created');

//       return successResponse('Draft journal batch voided successfully', {});
//     } else {
//       // POSTED JOURNAL: Create reversing entry (immutable audit trail)
//       log('handling_posted_journal');

//       if (!journalBatch.ledger_transaction_id) {
//         throw new Error('Posted journal must have a ledger transaction');
//       }

//       // Fetch original journal entries
//       const originalEntries = await tx('journal_entries')
//         .where('journal_batch_id', journalBatchId)
//         .where('is_deleted', false)
//         .select('coa_id', 'amount', 'side', 'description');

//       if (originalEntries.length === 0) {
//         throw new Error('No journal entries found for reversal');
//       }

//       // Create reversing transactions (flip debit/credit)
//       const reversingTransactions = originalEntries.map((entry) => ({
//         coaId: entry.coa_id,
//         amount: entry.amount,
//         side: entry.side === 'debit' ? ('credit' as const) : ('debit' as const),
//         description: `Reversal: ${entry.description || journalBatch.title}`,
//       }));

//       // Determine reversal date (default to original date or use provided)
//       const effectiveReversalDate = reversalDate || journalBatch.date;

//       // Create reversing journal
//       const reversalResult = await postJournalRecord({
//         data: {
//           date: effectiveReversalDate,
//           title: `Reversal of ${journalBatch.title}`,
//           description: reversalReason
//             ? `Reversal reason: ${reversalReason}`
//             : `Reversing journal ${journalBatch.code || journalBatchId}`,
//           status: 'posted',
//           note: journalBatch.note,
//           contactId: journalBatch.contact_id,
//           currencyId: journalBatch.currency_id,
//           exchangeRate: journalBatch.exchange_rate,
//           reversedJournalId: journalBatchId,
//           reversalReason: reversalReason || null,
//           transactions: reversingTransactions,
//         },
//         companyId: journalBatch.company_id,
//         userId,
//         trx: tx,
//       });

//       if (!reversalResult.success || !reversalResult.data) {
//         throw new Error('Failed to create reversing journal entry');
//       }

//       log('reversing_journal_created', {
//         reversalJournalId: reversalResult.data.journalBatchId,
//       });

//       // Update original journal with reversal info
//       await tx('journal_batches')
//         .where('id', journalBatchId)
//         .update({
//           reversed_by_id: userId,
//           reversed_at: new Date(),
//           reversal_reason: reversalReason || null,
//           updated_by_id: userId,
//           updated_at: new Date(),
//         });

//       log('original_journal_marked_reversed');

//       // It'll most likely be handled in the GL so we should let it be
//       // // Enqueue GL balance recalculation for affected COAs
//       // const affectedCoas = await tx('ledger_entries')
//       //   .where('ledger_transaction_id', journalBatch.ledger_transaction_id)
//       //   .where('is_deleted', false)
//       //   .select('coa_id', 'fs_date')
//       //   .distinct();

//       // for (const entry of affectedCoas) {
//       //   await enqueueGLBalance({
//       //     companyId: journalBatch.company_id,
//       //     coaId: entry.coa_id,
//       //     recalcFrom: entry.fs_date,
//       //     triggeredBy: 'manual',
//       //   });
//       // }

//       // log('gl_balance_recalc_enqueued', {
//       //   affectedCoasCount: affectedCoas.length,
//       // });

//       // Create audit event
//       await tx('audit_events').insert({
//         entity_type: 'journal',
//         entity_id: journalBatchId,
//         action: 'reverse',
//         payload: {
//           previous_status: journalBatch.status,
//           reversed_by: userId,
//           reversed_at: new Date().toISOString(),
//           reversal_journal_id: reversalResult.data.journalBatchId,
//           reversal_reason: reversalReason,
//           ledger_transaction_id: journalBatch.ledger_transaction_id,
//         },
//         company_id: journalBatch.company_id,
//         user_id: userId,
//         notes: `Posted journal batch reversed by user ${userId}${reversalReason ? `: ${reversalReason}` : ''}`,
//       });

//       log('audit_event_created');

//       return successResponse('Posted journal batch reversed successfully', {
//         reversalJournalId: reversalResult.data.journalBatchId,
//       });
//     }
//   };

//   try {
//     if (trx) {
//       return await executeTransaction(trx);
//     } else {
//       return await knexClient.transaction(executeTransaction);
//     }
//   } catch (error) {
//     log('error', {
//       error: error instanceof Error ? error.message : 'Unknown error',
//     });
//     return errorResponse('Failed to void journal batch', {
//       error: error instanceof Error ? error.message : 'Unknown error',
//       traceId,
//     });
//   }
// }
