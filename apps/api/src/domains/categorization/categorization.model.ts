import type { Knex } from 'knex';

import type { ApiResponse } from '../../core/types/api.types.js';
import { knexClient } from '../../db/knexClient.js';
import { toDate, toYMD } from '../../shared/utils/date.utils.js';
import { logger } from '../../shared/utils/logger.js';
import { getCompanyUUID } from '../../shared/utils/random.utils.js';
import {
  AppError,
  errorResponse,
  successResponse,
} from '../../shared/utils/response.utils.js';
import {
  type CategorizationTransaction,
  type GetCategorizationTransactionsParams,
  type GetCategorizationTransactionsResponse,
} from './categorization.types.js';
import { getBankTransactionsByIds } from '../bankTransactions/bankTransactions.model.js';
import { getCategorizationCandidatesWithLines } from './candidates/candidates.service.js';
import {
  getLedgerTransactionsWithEntries,
  updateOrCreateLedger,
} from '../ledgers/ledgers.model.js';
import type {
  LedgerEntryInput,
  LedgerTransactionWithEntriesFiltered,
  NewLedgerTransactionData,
} from '../ledgers/ledgers.types.js';
import type { BankTransactionWithFilteredFields } from '../bankTransactions/bankTransactions.types.js';
import type { ContactType } from '../contacts/index.js';
import {
  categorizationIntent,
  ledgerIntentSchema,
  type CategorizationIntent,
  type LedgerIntent,
  type LedgerIntentEntry,
} from '@accountable-books/contracts/schema';
import { mergeIntents } from './categorization.utils.js';

/**
 * Get categorization transactions for the categorization engine UI
 *
 * Fetches transactions from the categorization_engine_view which unifies:
 * - Uncategorized: Bank transactions without candidates or ledger entries
 * - Proposed: Transactions with candidates (not yet posted) - shows candidate lines (non-bank legs)
 * - Posted: Transactions posted to ledger - shows ledger entries (non-bank legs)
 *
 * @param params - Query parameters including optional date range
 * @returns Transactions with pagination info
 */
export async function getCategorizationTransactions(
  params: GetCategorizationTransactionsParams & { trx?: Knex.Transaction },
): Promise<ApiResponse<GetCategorizationTransactionsResponse>> {
  const {
    companyId,
    dateFrom,
    dateTo,
    status,
    bankTransactionIds,
    limit = 100,
    offset = 0,
    trx,
  } = params;

  const exec = async (txn: Knex.Transaction) => {
    // Calculate effective dateTo if dateFrom is provided but dateTo is not
    let effectiveDateTo: Date | undefined = dateTo;
    if (dateFrom && !dateTo) {
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Set to start of day for comparison

      const dateFromPlus365 = new Date(dateFrom);
      dateFromPlus365.setDate(dateFromPlus365.getDate() + 365);
      dateFromPlus365.setHours(0, 0, 0, 0);

      // Use whichever is earlier: today or dateFrom + 365 days
      effectiveDateTo = today < dateFromPlus365 ? today : dateFromPlus365;
    }

    // Validate date range if dateFrom is provided
    if (dateFrom && effectiveDateTo) {
      if (dateFrom > effectiveDateTo) {
        throw new Error('dateFrom must be <= dateTo');
      }

      // Enforce maximum range (365 days)
      const maxRangeDays = 365;
      const rangeDays = Math.ceil(
        (effectiveDateTo.getTime() - dateFrom.getTime()) /
          (1000 * 60 * 60 * 24),
      );
      if (rangeDays > maxRangeDays) {
        throw new Error(
          `Date range cannot exceed ${maxRangeDays} days. Requested: ${rangeDays} days`,
        );
      }
    }

    // Enforce maximum limit
    const maxLimit = 1000;
    const actualLimit = Math.min(limit, maxLimit);

    // Resolve company UUID
    const companyUUID = await getCompanyUUID(companyId, txn);
    if (!companyUUID) {
      throw new AppError(
        'Something went wrong',
        `company ${companyId} not found`,
        true,
      );
    }
    // Build query
    let query = txn('categorization_engine_view').where(
      'company_id',
      companyUUID,
    );

    // Apply date filters if dateFrom is provided
    if (dateFrom && effectiveDateTo) {
      // Convert dates to YYYY-MM-DD strings for PostgreSQL date comparison
      query = query
        .where('date', '>=', toYMD(dateFrom))
        .where('date', '<=', toYMD(effectiveDateTo));
    }

    // Apply status filter if provided
    if (status) {
      query = query.where('categorization_status', status);
    }

    // Apply bank transaction IDs filter if provided
    if (bankTransactionIds && bankTransactionIds.length > 0) {
      query = query.whereIn('id', bankTransactionIds);
    }

    // Get total count (before pagination)
    const countQuery = query.clone().count('* as total');
    const countResult = await countQuery.first();
    const total = Number(countResult?.total || 0);

    // Apply pagination and ordering
    const transactions = await query
      .orderBy('bank_display_name', 'asc') // Order by bank name first
      .orderBy('bank_account_id', 'asc') // Then by bank account
      .orderBy('date', 'desc')
      .orderByRaw('coa_name ASC NULLS LAST')
      .orderByRaw('contact_name ASC NULLS LAST')
      .orderByRaw('confidence DESC NULLS LAST')
      .orderBy('id') // Final tie-breaker
      .limit(actualLimit)
      .offset(offset);

    // Transform results to match TypeScript interface
    // Note: is_editable is computed directly in the VIEW using fiscal_calendar
    const transformedTransactions: CategorizationTransaction[] =
      transactions.map((tx) => {
        return {
          id: tx.id,
          date: new Date(tx.date),
          fs_date: new Date(tx.fs_date),
          bank_amount: Number(tx.bank_amount),
          description: tx.description,
          reference: tx.reference,
          contact_name: tx.contact_name,
          contact_id: tx.contact_id,
          contact_type: tx.contact_type,
          bank_account_id: tx.bank_account_id,
          bank_account_display_name: tx.bank_account_display_name,
          bank_currency_id: tx.bank_currency_id,
          bank_currency_code: tx.bank_currency_code,
          bank_id: tx.bank_id,
          bank_display_name: tx.bank_display_name,
          bank_logo: tx.bank_logo,
          coa_id: tx.coa_id,
          coa_name: tx.coa_name,
          coa_code: tx.coa_code,
          project_id: tx.project_id,
          project_name: tx.project_name,
          system_exchange_rate: Number(tx.system_exchange_rate),
          custom_exchange_rate: Number(tx.custom_exchange_rate),
          native_amount: Number(tx.native_amount),
          reporting_amount: Number(tx.reporting_amount),
          ledger_transaction_id: tx.ledger_transaction_id,
          ledger_entry_id: tx.ledger_entry_id ?? null,
          candidate_id: tx.candidate_id,
          candidate_line_id: tx.candidate_line_id ?? null,
          confidence: tx.confidence ? Number(tx.confidence) : null,
          explanation: tx.explanation,
          human_reviewed: tx.human_reviewed ?? null,
          categorization_candidate_id: tx.categorization_candidate_id ?? null,
          categorization_status: tx.categorization_status,
          company_id: tx.company_id,
          is_editable: Boolean(tx.is_editable), // Convert to boolean (VIEW returns boolean)
        };
      });

    return {
      transactions: transformedTransactions,
      total,
      limit: actualLimit,
      offset,
    };
  };

  try {
    if (trx) {
      const res = await exec(trx);
      return successResponse(
        'Categorization transactions fetched successfully',
        res,
      );
    } else {
      const res = await knexClient.transaction(exec);
      return successResponse(
        'Categorization transactions fetched successfully',
        res,
      );
    }
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        companyId,
        dateFrom,
        dateTo,
      },
      'Failed to fetch categorization transactions',
    );

    if (trx) {
      throw new Error(error instanceof Error ? error.message : 'Unknown error');
    }

    return errorResponse('Failed to fetch categorization transactions', error);
  }
}

export async function processCategorizationIntent({
  intents,
  companyId,
  userId,
  trx,
}: {
  intents: LedgerIntent[];
  companyId: string;
  userId: string;
  trx?: Knex.Transaction;
}): Promise<
  ApiResponse<{
    results: Array<{
      bank_transaction_id: string;
      operation: 'created' | 'updated_metadata' | 'superseded';
      ledger_transaction_id: string;
      old_ledger_transaction_id?: string;
      warnings?: Record<string, string>;
    }>;
    summary: {
      total_processed: number;
      created: number;
      updated: number;
      superseded: number;
      has_warnings: boolean;
    };
  }>
> {
  // Validate intents against ledgerIntentSchema
  const validation = ledgerIntentSchema.array().safeParse(intents);
  if (!validation.success) {
    return errorResponse('Invalid intents', {
      errors: validation.error.issues,
    });
  }

  const validatedIntents = validation.data;

  const exec = async (txn: Knex.Transaction) => {
    const companyUUID = await getCompanyUUID(companyId, txn);
    if (!companyUUID) {
      logger.error('Company not found');
      throw new Error('Something went wrong');
    }

    // Group intents by bank_transaction_id
    const intentsByBankTxn = new Map<string, LedgerIntent[]>();

    for (const intent of validatedIntents) {
      const existing = intentsByBankTxn.get(intent.bank_transaction_id);
      if (existing) {
        existing.push(intent);
      } else {
        intentsByBankTxn.set(intent.bank_transaction_id, [intent]);
      }
    }

    const bankTransactionIds = Array.from(intentsByBankTxn.keys());

    // Fetch all transactions in one go
    // Categorization view because it kind of helps to easily figure out current status
    const catEngineViewRes = await getCategorizationTransactions({
      companyId: companyUUID,
      bankTransactionIds,
      trx: txn,
    });
    const categorizationTxns = catEngineViewRes.data?.transactions || [];
    if (categorizationTxns.length === 0) {
      throw new Error('No transactions found');
    }

    // Fetch all bank transactions in one go, helps to build bank leg et al
    const bankTransactions = (await getBankTransactionsByIds({
      bankTransactionIds,
      excludeAutoGeneratedFields: true,
      trx: txn,
    })) as BankTransactionWithFilteredFields[];

    // Create a map for quick bank transaction lookup
    const bankTransactionMap = new Map<
      string,
      BankTransactionWithFilteredFields
    >();
    for (const bankTxn of bankTransactions) {
      bankTransactionMap.set(bankTxn.id, bankTxn);
    }

    // Group data by bank transaction ID
    const dataByBankTxnId = new Map<
      string,
      {
        intent: LedgerIntent;
        entries: CategorizationTransaction[];
        bankTransaction: BankTransactionWithFilteredFields;
      }
    >();

    // Track which transactions we're skipping due to missing bank data. Should be empty all the time, otherwise, something went wrong
    const skippedTransactionIds: string[] = [];

    for (const catTxn of categorizationTxns) {
      const bankTransactionId = catTxn.id;
      const bankTransaction = bankTransactionMap.get(bankTransactionId) ?? null;

      // Skip if bank transaction is not found
      if (!bankTransaction) {
        skippedTransactionIds.push(bankTransactionId);
        logger.error(
          `Skipping bank transaction ${bankTransactionId}: No bank transaction record found`,
        );
        continue;
      }

      const intents = intentsByBankTxn.get(bankTransactionId) ?? [];
      const intent = mergeIntents(intents);
      if (!intent) {
        continue;
      }

      const existingGroup = dataByBankTxnId.get(bankTransactionId);

      if (existingGroup) {
        existingGroup.entries.push(catTxn);
      } else {
        dataByBankTxnId.set(bankTransactionId, {
          intent,
          entries: [catTxn],
          bankTransaction,
        });
      }
    }

    // Collect all ledger inputs to process at the end
    // Track which bank transaction each ledger input corresponds to
    const allLedgerInputs: Partial<NewLedgerTransactionData>[] = [];
    const bankTxnIdToLedgerInputIndex: string[] = []; // Maps ledger input index -> bank transaction ID

    for (const [
      bankTxnId,
      { intent, entries, bankTransaction },
    ] of dataByBankTxnId) {
      const noOfEntries = entries.length; // categorization transactions keep non-bank legs, this will tell us if this transaction was already split
      const first = entries[0];

      if (noOfEntries > 1) {
        const allSameStatus = entries.every(
          (t) => t.categorization_status === first.categorization_status,
        );
        const allSameCandidateId = entries.every(
          (t) => t.candidate_id === first.candidate_id,
        );
        const allSameLedgerId = entries.every(
          (t) => t.ledger_transaction_id === first.ledger_transaction_id,
        );

        if (!allSameStatus || !allSameCandidateId || !allSameLedgerId) {
          // Not sure if we should throw here
          throw new Error(
            'Same bank transaction has inconsistent fields across entries',
          );
        }
      }

      const status = first.categorization_status;
      const candidateId = first.candidate_id;
      const ledgerTransactionId = first.ledger_transaction_id;

      // Still bank transaction: status is uncategorized, length is 1, candidate_id is null, ledger_transaction_id is null
      // Currently a candidate: status is proposed, candidate_id is not null, ledger_transaction_id is null
      // Already posted to ledger: status is posted or something else, ledger_transaction_id is not null, candidate_id might or might not be null

      let currentState: 'bank_transaction' | 'candidate' | 'ledger';
      if (
        noOfEntries === 1 &&
        status === 'uncategorized' &&
        candidateId === null &&
        ledgerTransactionId === null
      ) {
        currentState = 'bank_transaction';
      } else if (
        status === 'proposed' &&
        candidateId !== null &&
        ledgerTransactionId === null
      ) {
        currentState = 'candidate';
      } else if (ledgerTransactionId !== null) {
        currentState = 'ledger';
      } else {
        throw new Error('Something went wrong');
      }

      // Build bank leg from bank transaction
      const nonBankLegs: LedgerEntryInput[] = [];
      const intentEntries = intent.desired_state?.entries ?? [];

      // Now query the right table
      if (currentState === 'bank_transaction') {
        const bankLeg: LedgerEntryInput[] = [
          {
            // id - not needed
            is_bank_leg: true,
            fs_date: toYMD(bankTransaction.date),
            coa_id: bankTransaction.bank_account_coa_id,

            source_currency_id: bankTransaction.bank_account_currency_id,
            source_amount: bankTransaction.amount,

            custom_exchange_rate:
              intent.desired_state?.custom_exchange_rate ??
              bankTransaction.system_exchange_rate,

            contact_id: bankTransaction.contact_id,
            contact_type: bankTransaction.contact_type_snapshot,

            description: bankTransaction.description ?? null,
          },
        ];

        const ledgerTxn: Omit<NewLedgerTransactionData, 'transactions'> = {
          date: bankTransaction.date,
          transaction_source: 'bank_transaction',
          categorization_source: 'manual',

          description: bankTransaction.description ?? null,
          reference: bankTransaction.reference ?? null,

          note: bankTransaction.additional_notes ?? null,

          contact_id: bankTransaction.contact_id,
          contact_type: bankTransaction.contact_type_snapshot,

          source_transaction_id: bankTransaction.id,
          source_transaction_date: toDate(bankTransaction.date, 'start'),
          source_transaction_amount: bankTransaction.amount,
          source_transaction_currency_id:
            bankTransaction.bank_account_currency_id,

          // metadata: bankTransaction.raw_data,
        };
        // Skip if no intent entries (can't post without COA assignments)
        if (!intentEntries.length) {
          logger.warn({
            message: `No intent entries found for bank transaction ${bankTxnId}`,
            bankTransactionId: bankTxnId,
            intent,
          });
          
          // Maybe we should add warning to the response obj

          continue;
        }
        for (const e of intentEntries) {
          // Skip entries without COA (can't post without COA)
          if (!e.coa_id) {
            continue;
          }

          nonBankLegs.push({
            // id - no need for id, new ledger transaction will be created
            is_bank_leg: false,
            coa_id: e.coa_id,

            fs_date: e.fs_date || toYMD(bankTransaction.date),

            source_currency_id: bankTransaction.bank_account_currency_id,
            source_amount: e.source_amount || bankTransaction.amount, // updateOrCreate will handle verification of sum

            custom_exchange_rate:
              intent.desired_state?.custom_exchange_rate ??
              bankTransaction.system_exchange_rate,

            // If contact_id and contact id is null, then mark as null, if contact_id was not provided then use whatever we have from the bank transaction
            contact_id:
              e.contact_id === null
                ? null
                : (e.contact_id ?? bankTransaction.contact_id),

            contact_type:
              e.contact_type === null
                ? null
                : (e.contact_type ?? bankTransaction.contact_type_snapshot),

            description:
              e.description === null
                ? null
                : (bankTransaction.description ?? null),

            // ledger_transaction_id - new ledger transaction will be created

            project_id: e.project_id === null ? null : e.project_id,

            human_reviewed: true,
            review_notes: e.review_notes,

            ...(e.metadata ? { metadata: e.metadata } : {}),
          });
        }

        // Only add if we have non-bank legs (entries with COA assigned)
        if (nonBankLegs.length > 0) {
          allLedgerInputs.push({
            ...ledgerTxn,
            transactions: [...bankLeg, ...nonBankLegs],
          });
          bankTxnIdToLedgerInputIndex.push(bankTxnId);
        }
      } else if (currentState === 'candidate') {
        // Fetch candidate with lines
        const candidates = await getCategorizationCandidatesWithLines({
          bankTransactionIds: [bankTxnId],
          excludeAutoGeneratedFields: true,
          trx: txn,
        });

        if (candidates.length === 0) {
          throw new Error(
            `Candidate not found for bank transaction ${bankTxnId}`,
          );
        }

        if (candidates.length > 1) {
          logger.error({
            message: `Multiple candidates found for bank transaction ${bankTxnId}`,
            bankTransactionId: bankTxnId,
            candidates,
          });
        }

        const candidate = candidates[0];

        // Convert candidate lines to ledger entry inputs
        // Filter out bank leg (it's already in the candidate lines)
        const candidateNonBankLegs = candidate.lines.filter(
          (line) => !line.is_bank_leg,
        );
        const candidateBankLeg = candidate.lines.find(
          (line) => line.is_bank_leg,
        );

        if (!candidateBankLeg) {
          throw new Error(
            `Candidate missing bank leg for bank transaction ${bankTxnId}`,
          );
          // Or maybe we just log since we'll compute it anyway... or i guess we leave throw to catch any mistakes in the future
        }

        // Build ledger entry inputs from candidate lines, merging with intent
        const mergedNonBankLegs: LedgerEntryInput[] = [];

        if (intentEntries.length === 1) {
          // Single entry, use candidateLine as base, update fields provided in intent
          const intentEntry = intentEntries[0];
          const candidateLine =
            candidateNonBankLegs.length === 1 ? candidateNonBankLegs[0] : null;

          mergedNonBankLegs.push({
            is_bank_leg: false,
            coa_id: intentEntry.coa_id ?? candidateLine?.coa_id,
            fs_date:
              intentEntry.fs_date ??
              candidateLine?.fs_date ??
              toYMD(bankTransaction.date),
            source_currency_id: bankTransaction.bank_account_currency_id,
            source_amount: bankTransaction.amount,
            custom_exchange_rate:
              intent.desired_state?.custom_exchange_rate ??
              candidateBankLeg.custom_exchange_rate ??
              bankTransaction.system_exchange_rate,
            contact_id:
              intentEntry.contact_id === null
                ? null
                : (intentEntry.contact_id ??
                  candidateLine?.contact_id ??
                  bankTransaction.contact_id ??
                  null),
            contact_type:
              intentEntry.contact_type === null
                ? null
                : (intentEntry.contact_type ??
                  candidateLine?.contact_type ??
                  bankTransaction.contact_type_snapshot ??
                  null),
            description:
              intentEntry.description === null
                ? null
                : (intentEntry.description ??
                  candidateLine?.description ??
                  bankTransaction.description ??
                  null),

            project_id:
              intentEntry.project_id === null
                ? null
                : (intentEntry.project_id ?? candidateLine?.project_id ?? null),
            human_reviewed:
              intentEntry.human_reviewed ??
              (intentEntry.review_notes ? true : true),
            review_notes:
              intentEntry.review_notes === null
                ? null
                : (intentEntry.review_notes ?? null),
            ...(intentEntry.metadata ? { metadata: intentEntry.metadata } : {}),
          });
        } else {
          // MULTIPLE ENTRIES: Split/replace
          for (const intentEntry of intentEntries) {
            mergedNonBankLegs.push({
              is_bank_leg: false,
              coa_id: intentEntry.coa_id, // Required in intent
              fs_date:
                intentEntry.fs_date ??
                candidateBankLeg.fs_date ??
                toYMD(bankTransaction.date),
              source_currency_id: bankTransaction.bank_account_currency_id,
              source_amount: intentEntry.source_amount ?? 0,
              custom_exchange_rate:
                intent.desired_state?.custom_exchange_rate ??
                candidateBankLeg.custom_exchange_rate ??
                bankTransaction.system_exchange_rate,
              contact_id:
                intentEntry.contact_id === null
                  ? null
                  : (intentEntry.contact_id ??
                    candidateBankLeg.contact_id ??
                    bankTransaction.contact_id ??
                    null),
              contact_type:
                intentEntry.contact_type === null
                  ? null
                  : (intentEntry.contact_type ??
                    candidateBankLeg.contact_type ??
                    bankTransaction.contact_type_snapshot ??
                    null),
              description:
                intentEntry.description === null
                  ? null
                  : (intentEntry.description ??
                    candidateBankLeg.description ??
                    bankTransaction.description ??
                    null),
              project_id: intentEntry.project_id ?? null,
              human_reviewed:
                intentEntry.human_reviewed ??
                (intentEntry.review_notes ? true : true),

              review_notes:
                intentEntry.review_notes === null
                  ? null
                  : (intentEntry.review_notes ?? null),
              ...(intentEntry.metadata
                ? { metadata: intentEntry.metadata }
                : {}),
            });
          }
        }

        // Build bank leg from candidate
        const bankLeg: LedgerEntryInput = {
          is_bank_leg: true,
          fs_date: toYMD(bankTransaction.date),
          coa_id: bankTransaction.bank_account_coa_id,
          source_currency_id: bankTransaction.bank_account_currency_id,
          source_amount: bankTransaction.amount,
          custom_exchange_rate:
            intent.desired_state?.custom_exchange_rate ??
            candidateBankLeg.custom_exchange_rate ??
            bankTransaction.system_exchange_rate,
          contact_id: bankTransaction.contact_id ?? null,
          contact_type: bankTransaction.contact_type_snapshot ?? null,
          description: bankTransaction.description ?? null,
        };

        // Build ledger transaction data
        const ledgerTxn: Omit<NewLedgerTransactionData, 'transactions'> = {
          date: toDate(bankTransaction.date, 'start'),
          transaction_source: 'bank_transaction',
          categorization_source: candidate.source,
          description: candidate.description ?? null,
          reference: candidate.reference ?? null,
          contact_id: candidate.contact_id,
          contact_type: candidate.contact_type,
          source_transaction_id: candidate.bank_transaction_id,
          source_transaction_date: toDate(bankTransaction.date, 'start'),
          source_transaction_amount: bankTransaction.amount,
          source_transaction_currency_id:
            bankTransaction.bank_account_currency_id,
          categorization_candidate_id: candidate.id,
        };

        allLedgerInputs.push({
          ...ledgerTxn,
          transactions: [bankLeg, ...mergedNonBankLegs],
        });
        bankTxnIdToLedgerInputIndex.push(bankTxnId);
      } else if (currentState === 'ledger') {
        // Fetch ledger transaction with entries
        const ledgerTransactions = await getLedgerTransactionsWithEntries({
          sourceTransactionIds: [bankTxnId],
          excludeAutoGeneratedFields: true,
          trx: txn,
        });

        if (ledgerTransactions.length === 0) {
          throw new Error(
            `Ledger transaction not found for bank transaction ${bankTxnId}`,
          );
        }

        const ledgerTxn = ledgerTransactions[0];
        const mergedEntries: LedgerEntryInput[] = [];

        // Separate intent entries: those with entry_id (updates) vs without (new splits)
        const intentEntriesWithId = intentEntries.filter((e) => e.entry_id);
        const intentEntriesWithoutId = intentEntries.filter((e) => !e.entry_id);

        // Create maps for matching
        const intentEntriesById = new Map<string, LedgerIntentEntry>();
        for (const intentEntry of intentEntriesWithId) {
          intentEntriesById.set(intentEntry.entry_id!, intentEntry);
        }

        // Track which ledger entries and intent entries have been matched
        const matchedLedgerEntryIds = new Set<string>();
        const matchedIntentEntries = new Set<LedgerIntentEntry>();

        // Process ledger entries: only keep those referenced in intent (enables consolidation)
        for (const ledgerEntry of ledgerTxn.entries) {
          if (ledgerEntry.is_bank_leg) {
            // Always keep bank leg unchanged
            mergedEntries.push({
              is_bank_leg: true,
              coa_id: ledgerEntry.coa_id,
              fs_date: toYMD(ledgerEntry.fs_date),
              source_currency_id: ledgerEntry.source_currency_id,
              source_amount: ledgerEntry.source_amount,
              custom_exchange_rate: ledgerEntry.custom_exchange_rate,
              contact_id: ledgerEntry.contact_id,
              contact_type: ledgerEntry.contact_type,
              description: ledgerEntry.description,
              ...(ledgerEntry.metadata
                ? { metadata: ledgerEntry.metadata }
                : {}),
            });
            continue;
          }

          // For non-bank legs: match by entry_id first, then by amount as fallback
          let intentEntry: LedgerIntentEntry | undefined;

          // Priority 1: Match by entry_id
          intentEntry = intentEntriesById.get(ledgerEntry.id);
          if (intentEntry) {
            matchedIntentEntries.add(intentEntry);
            matchedLedgerEntryIds.add(ledgerEntry.id);
          } else {
            // Priority 2: Match by amount (for consolidation cases where entry_id might not be provided)
            // Try matching with intent entries that don't have entry_id but have matching amounts
            for (const candidateIntentEntry of intentEntriesWithoutId) {
              if (
                matchedIntentEntries.has(candidateIntentEntry) ||
                !candidateIntentEntry.source_amount
              ) {
                continue;
              }

              // Match if amounts are approximately equal (handle floating point precision)
              const amountDiff = Math.abs(
                candidateIntentEntry.source_amount - ledgerEntry.source_amount,
              );
              if (amountDiff < 0.01) {
                intentEntry = candidateIntentEntry;
                matchedIntentEntries.add(intentEntry);
                matchedLedgerEntryIds.add(ledgerEntry.id);
                break;
              }
            }
          }

          // Only include ledger entry if it was matched in intent (consolidation: drop unmatched entries)
          if (intentEntry) {
            mergedEntries.push({
              is_bank_leg: false,
              coa_id: intentEntry.coa_id ?? ledgerEntry.coa_id,
              fs_date: intentEntry.fs_date ?? toYMD(ledgerEntry.fs_date),
              source_currency_id: ledgerEntry.source_currency_id,
              source_amount:
                intentEntry.source_amount ?? ledgerEntry.source_amount,
              custom_exchange_rate:
                intent.desired_state?.custom_exchange_rate ??
                ledgerEntry.custom_exchange_rate,
              contact_id:
                intentEntry.contact_id === null
                  ? null
                  : (intentEntry.contact_id ?? ledgerEntry.contact_id),
              contact_type:
                intentEntry.contact_type === null
                  ? null
                  : (intentEntry.contact_type ?? ledgerEntry.contact_type),
              description:
                intentEntry.description === null
                  ? null
                  : (intentEntry.description ?? ledgerEntry.description),
              project_id:
                intentEntry.project_id === null
                  ? null
                  : (intentEntry.project_id ?? ledgerEntry.project_id),
              human_reviewed:
                intentEntry.human_reviewed !== undefined
                  ? intentEntry.human_reviewed
                  : intentEntry.review_notes
                    ? true
                    : ledgerEntry.human_reviewed,
              review_notes:
                intentEntry.review_notes ?? ledgerEntry.review_notes,
              ...(intentEntry.metadata
                ? { metadata: intentEntry.metadata }
                : ledgerEntry.metadata
                  ? { metadata: ledgerEntry.metadata }
                  : {}),
            });
          }
          // If not matched, entry is dropped (consolidation case)
        }

        // Add new entries (splits) - intent entries without entry_id that weren't matched by amount
        const templateEntry = ledgerTxn.entries.find((e) => !e.is_bank_leg);
        for (const intentEntry of intentEntriesWithoutId) {
          // Skip if this intent entry was already matched by amount
          if (matchedIntentEntries.has(intentEntry)) {
            continue;
          }
          mergedEntries.push({
            is_bank_leg: false,
            coa_id: intentEntry.coa_id,
            fs_date:
              intentEntry.fs_date ??
              (templateEntry
                ? toYMD(templateEntry.fs_date)
                : toYMD(ledgerTxn.date)),
            source_currency_id:
              templateEntry?.source_currency_id ??
              ledgerTxn.source_transaction_currency_id,
            source_amount: intentEntry.source_amount ?? 0,
            custom_exchange_rate:
              intent.desired_state?.custom_exchange_rate ??
              templateEntry?.custom_exchange_rate,
            contact_id:
              intentEntry.contact_id === null
                ? null
                : (intentEntry.contact_id ??
                  templateEntry?.contact_id ??
                  ledgerTxn.contact_id ??
                  null),
            contact_type:
              intentEntry.contact_type === null
                ? null
                : (intentEntry.contact_type ??
                  templateEntry?.contact_type ??
                  ledgerTxn.contact_type ??
                  null),
            description:
              intentEntry.description === null
                ? null
                : (intentEntry.description ??
                  templateEntry?.description ??
                  ledgerTxn.description ??
                  null),
            project_id: intentEntry.project_id ?? null,
            human_reviewed:
              intentEntry.human_reviewed !== undefined
                ? intentEntry.human_reviewed
                : intentEntry.review_notes
                  ? true
                  : true,
            review_notes: intentEntry.review_notes ?? null,
            ...(intentEntry.metadata ? { metadata: intentEntry.metadata } : {}),
          });
        }

        // Build partial ledger transaction data for update
        const ledgerUpdateData: Partial<NewLedgerTransactionData> = {
          description: ledgerTxn.description,
          reference: ledgerTxn.reference,
          note: ledgerTxn.note,
          source_transaction_id: bankTxnId,
          transactions: mergedEntries,
        };

        allLedgerInputs.push(ledgerUpdateData);
        bankTxnIdToLedgerInputIndex.push(bankTxnId);
      }
    }

    // Process all ledger inputs at once
    if (allLedgerInputs.length === 0) {
      // Very unlikely to happen but just in case, we'll throw an error
      throw new Error('No ledger inputs to process');
    }

    // Call updateOrCreateLedger to process all ledger inputs
    const ledgerResult = await updateOrCreateLedger({
      data: allLedgerInputs,
      companyId: companyUUID,
      userId,
      trx: txn,
    });

    if (!ledgerResult.success) {
      throw new Error(
        `Failed to process ledger transactions: ${ledgerResult.error}`,
      );
    }

    // Map ledger results back to bank transactions
    const ledgerResults = ledgerResult.data ?? [];
    const results: Array<{
      bank_transaction_id: string;
      operation: 'created' | 'updated_metadata' | 'superseded';
      ledger_transaction_id: string;
      old_ledger_transaction_id?: string;
      warnings?: Record<string, string>;
    }> = [];

    for (let i = 0; i < ledgerResults.length; i++) {
      const ledgerResultItem = ledgerResults[i];
      const bankTxnId = bankTxnIdToLedgerInputIndex[i];

      if (!bankTxnId) {
        logger.warn(
          {
            ledgerInputIndex: i,
            ledgerResultItem,
          },
          'No bank transaction ID mapped for ledger input index',
        );
        continue;
      }

      results.push({
        bank_transaction_id: bankTxnId,
        operation: ledgerResultItem.operation,
        ledger_transaction_id: ledgerResultItem.ledgerTransactionId,
        ...(ledgerResultItem.oldLedgerTransactionId
          ? {
              old_ledger_transaction_id:
                ledgerResultItem.oldLedgerTransactionId,
            }
          : {}),
        ...(ledgerResultItem.warnings
          ? { warnings: ledgerResultItem.warnings }
          : {}),
      });
    }

    // Build summary
    const summary = {
      total_processed: results.length,
      created: results.filter((r) => r.operation === 'created').length,
      updated: results.filter((r) => r.operation === 'updated_metadata').length,
      superseded: results.filter((r) => r.operation === 'superseded').length,
      has_warnings: results.some(
        (r) => r.warnings && Object.keys(r.warnings).length > 0,
      ),
    };

    return {
      results,
      summary,
    };
  };

  try {
    if (trx) {
      const res = await exec(trx);
      return successResponse(
        'Categorization intents processed successfully',
        res,
      );
    } else {
      const res = await knexClient.transaction(exec);
      return successResponse(
        'Categorization intents processed successfully',
        res,
      );
    }
  } catch (error) {
    logger.error(
      {
        intent_count: validatedIntents.length,
        companyId,
        error,
      },
      'Failed to process categorization intents',
    );
    return errorResponse('Failed to process intents', { error });
  }
}
