import { knexClient } from '../../../db/knexClient.js';
import type { Knex } from 'knex';
import type {
  EnrichedTransaction,
  EnrichmentProcessingType,
  EnrichmentResult,
  EnrichmentStatsContext,
} from './enrichment.types.js';
import { getCompanyContext } from './company-context.service.js';
import { getContactStats } from '../stats/stats.service.js';
import {
  detectPatternSignals,
  computeTemporalFeatures,
} from './enrichment.utils.js';
import pino from 'pino';

const logger = pino({
  name: 'enrichment-service',
});
import {
  normalizeDescription,
  tokenizeDescription,
} from './utils/clean-desc.js';
import { resolveContactForEnrichment } from './resolve-contact.service.js';
import { generateChecksumSync, toYMD } from '../../../shared/index.js';
import type { CategorizationTaskSource } from '../tasks/tasks.types.js';

/**
 * Enrichment version identifier
 * Format: v{yymmdd}-{dto-version}-{major}.{minor}.{patch}
 * First part is the date of the release
 * Second part is EnrichedTransaction DTO version (we bump this up when we add/remove fields)
 * Third part is semantic version for logic changes
 * E.g v240601-01-1.0.0
 */
const ENRICHMENT_VERSION = 'v251102-01-1.0.0';

const BANK_TX_SELECT_FIELDS = [
  // Bank transaction
  'bt.id as bank_transaction_id',
  'bt.date as date',
  'bt.description as description',
  'bt.reference as reference',
  'bt.additional_notes as additional_notes',
  'bt.amount as amount_native',
  'bt.system_exchange_rate as system_exchange_rate',
  'bt.bank_transaction_batch_id as bank_transaction_batch_id',
  'bt.contact_id as contact_id',
  'bt.payee as payee',
  'bt.contact_type_snapshot as contact_type',
  'bt.raw_data as raw_data',
  'bt.source as source',

  // Bank account
  'ba.id as bank_account_id',
  'ba.company_id as company_id',
  'ba.coa_id as bank_account_coa_id',
  'ba.account_name as bank_account_name',
  'ba.display_name as bank_account_display_name',
  'ba.currency_id as transaction_currency_id',

  // Bank
  'b.id as bank_id',
  'b.currency_id as bank_currency_id',

  // Currency
  'cur.code as transaction_currency_code',
  'bank_currency.code as bank_currency_code',
];

/**
 * Enrich a single bank transaction
 * This is the core enrichment function that produces an EnrichedTransaction object
 */
export async function enrichTransaction({
  bankTransactionId,
  processingContext,
  taskSource,
  trx,
}: {
  bankTransactionId: string;
  processingContext?: EnrichmentProcessingType;
  taskSource?: CategorizationTaskSource;
  trx?: Knex.Transaction;
}): Promise<EnrichmentResult> {
  const startTime = Date.now();

  const exec = async (tx: Knex.Transaction) => {
    // Load base transaction with minimal joins
    const txn = await tx('bank_transactions as bt')
      .select(BANK_TX_SELECT_FIELDS)
      .leftJoin('bank_accounts as ba', 'bt.bank_account_id', 'ba.id')
      .leftJoin('currencies as cur', 'ba.currency_id', 'cur.id')
      .leftJoin('banks as b', 'ba.bank_id', 'b.id')
      .leftJoin(
        'currencies as bank_currency',
        'b.currency_id',
        'bank_currency.id',
      )
      .where('bt.id', bankTransactionId)
      .where('bt.is_deleted', false)
      .first();

    if (!txn) {
      throw new Error(`Bank transaction not found: ${bankTransactionId}`);
    }

    const companyUUID = txn.company_id;

    // Load company context (cached via Redis)
    const companyContext = await getCompanyContext(companyUUID);
    const {
      legal_name,
      display_name,
      year_end_day,
      year_end_month,
      ...enrichmentContext
    } = companyContext;

    // Normalize description
    const description = [txn.description, txn.reference, txn.additional_notes]
      .filter((part): part is string => Boolean(part))
      .join(' ')
      .trim();
    const normalizedDesc = normalizeDescription(description);
    const descriptionTokens = tokenizeDescription(normalizedDesc);
    const normalizedReference = normalizeDescription(txn.reference);
    const amountNative = Number(txn.amount_native);
    const systemExRate = Number(txn.system_exchange_rate) || 1;
    const amountReporting = amountNative * systemExRate;

    // Contact resolution
    const contactResolution = await resolveContactForEnrichment({
      company: {
        uuid: companyUUID,
        legalName: companyContext.legal_name || '',
        displayName: companyContext.display_name || '',
        countryCode: txn.bank_currency_code || companyContext.country_code,
      },
      bankAccount: {
        accountName: txn.bank_account_name,
        displayName: txn.bank_account_display_name,
      },
      contactId: txn.contact_id || null,
      contactTypeSnapshot: txn.contact_type || null,
      payee: txn.payee,
      description: normalizedDesc,
      transactionAmount: txn.amount_native
        ? Math.abs(Number(txn.amount_native))
        : null,
      trx: tx,
    });

    const contactStats = await getContactStats({
      companyUUID,
      contactFingerprint: contactResolution.contact_fingerprint,
      currencyCode: txn.transaction_currency_code,
      contactId: contactResolution.contact_id || null,
      trx: tx,
    });

    const snapshot = contactStats
      ? {
          ...contactStats,
          as_of_transaction_id: txn.bank_transaction_id,
          as_of_transaction_date: toYMD(txn.date),
        }
      : null;
    // let snapshot:
    //   | (typeof contactStats & {
    //       checksum: string;
    //       as_of_transaction_id: string;
    //       as_of_transaction_date: string;
    //     })
    //   | null = null;
    // if (contactStats) {
    //   snapshot = {
    //   };
    // }

    const signals = detectPatternSignals({
      description: normalizedDesc,
      amount: amountNative,
      transactionCurrencyCode: txn.transaction_currency_code,
      bankAccountCurrencyCode: txn.bank_currency_code,
    });

    const txnDateStr = toYMD(txn.date);
    const temporals = computeTemporalFeatures({
      txnDate: txnDateStr,
      yearEndDay: Number(companyContext.year_end_day),
      yearEndMonth: Number(companyContext.year_end_month),
    });

    const enrichedAt = new Date().toISOString();
    const latencyMs = Date.now() - startTime;

    const statsContext =
      snapshot && contactResolution.contact_fingerprint
        ? {
            contact_fingerprint: contactResolution.contact_fingerprint,
            stats_row_id: snapshot.stats_row_id || null,
            stats_replay_seq: snapshot.stats_replay_seq,
            stats_snapshot_checksum: snapshot.stats_snapshot_checksum || null,
            snapshot_captured_at: snapshot.snapshot_captured_at || null,
          }
        : null;

    const result: EnrichedTransaction = {
      version: ENRICHMENT_VERSION,
      ids: {
        bank_transaction_id: txn.bank_transaction_id,
        bank_transaction_batch_id: txn.bank_transaction_batch_id,
        company_uuid: companyUUID,
        bank_account_id: txn.bank_account_id,
        bank_account_coa_id: txn.bank_account_coa_id,
        contact_id: contactResolution.contact_id,
        enrichment_job_id: null,
      },
      raw: {
        date: txnDateStr,
        description: description,
        amount_native: amountNative,
        system_ex_rate: systemExRate,
        amount_reporting: amountReporting,
        currency_code: txn.transaction_currency_code,
        direction: amountNative > 0 ? 'inflow' : 'outflow',
        source: txn.source ?? 'ingestion',
        metadata: txn.raw_data,
      },

      normalized: {
        description: normalizedDesc,
        description_tokens: descriptionTokens,
        contact_name: contactResolution.contact_name,
        contact_fingerprint: contactResolution.contact_fingerprint,
        contact_match_confidence: contactResolution.contact_match_confidence,
        contact_type: contactResolution.contact_type,
        normalized_reference: normalizedReference,
        global_contact_name: contactResolution.global_contact_name,
        global_contact_category_hints:
          contactResolution.global_contact_category_hints,
      },

      context: {
        company_name: legal_name ?? display_name,
        ...enrichmentContext,
      },

      historical: {
        bank_contact_stats_snapshot: snapshot,
      },
      signals: signals,
      temporal: temporals,
      feedback_summary: undefined, // TODO: populate once feedback stats are connected to enrichment
      metadata: {
        source: taskSource ?? 'ingestion',
        enriched_at: enrichedAt,
        enrichment_latency_ms: latencyMs,
        enrichment_version: ENRICHMENT_VERSION,
        status: 'enriched',
        error_message: null,
        processing_context: processingContext ?? 'primary',
        stats_replay_seq: snapshot?.stats_replay_seq,
        stats_snapshot_checksum: snapshot?.stats_snapshot_checksum,
      },
    };

    const DTOChecksum = generateChecksumSync(result, {
      sortKeys: true,
    });

    logger.debug(
      { bankTransactionId, latencyMs },
      'Transaction enrichment completed',
    );

    return {
      success: true,
      bankTransactionId,
      enrichedTransaction: result,
      statsContext: statsContext ?? undefined,
      checksum: DTOChecksum,
      latencyMs,
    };
  };

  try {
    if (trx) {
      return await exec(trx);
    } else {
      return await knexClient.transaction(exec);
    }
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    logger.error(
      { error, bankTransactionId, latencyMs },
      'Transaction enrichment failed',
    );

    return {
      success: false,
      bankTransactionId,
      error: errorMessage,
      latencyMs,
      checksum: '',
    };
  }
  // try {
  //   // Step 1: Load base transaction with minimal joins
  //   const txn = await db('bank_transactions as bt')
  //     .select(BANK_TX_SELECT_FIELDS)
  //     .leftJoin('bank_accounts as ba', 'bt.bank_account_id', 'ba.id')
  //     .leftJoin('currencies as cur', 'ba.currency_id', 'cur.id')
  //     .where('bt.id', bankTransactionId)
  //     .where('bt.is_deleted', false)
  //     .first();

  //   if (!txn) {
  //     throw new Error(`Bank transaction not found: ${bankTransactionId}`);
  //   }

  //   const companyId = txn.company_id;

  //   // Load company context (cached via Redis)
  //   const companyContext = await getCompanyContext(companyId);

  //   // Normalize description
  //   const description = txn.description + txn.reference + txn.additional_notes;
  //   const normalizedDesc = normalizeDescription(txn.description);
  //   const descriptionTokens = tokenizeDescription(normalizedDesc);

  //   // // Step 3: Contact resolution
  //   // const contactResolution = await resolveContact({
  //   //   companyUUID: companyId,
  //   //   contactId: txn.contact_id || null,
  //   //   contactTypeSnapshot: txn.contact_type || null,
  //   //   payee: txn.payee,
  //   //   description: normalizedDesc,
  //   //   trx: db,
  //   // });

  //   // Step 4: Calculate amounts in reporting currency
  //   const amountNative = Number(txn.amount_native);
  //   const systemExRate = Number(txn.system_exchange_rate) || 1;
  //   const amountReporting = amountNative * systemExRate;

  //   // Determine transaction direction
  //   const direction: 'inflow' | 'outflow' =
  //     amountNative >= 0 ? 'inflow' : 'outflow';

  //   // Step 5: Fetch historical contact stats
  //   const contactStats = contactResolution.contactFingerprint
  //     ? await getContactStats({
  //         companyId,
  //         contactFingerprint: contactResolution.contactFingerprint,
  //         currencyCode: txn.transaction_currency_code,
  //         contactId: contactResolution.contactId,
  //         db,
  //       })
  //     : null;

  //   // Step 6: Compute temporal features
  //   const txnDate = new Date(txn.date);
  //   const temporalFeatures = computeTemporalFeatures({
  //     date: txnDate,
  //     fiscalYearEnd: companyContext.fiscalYearEnd,
  //     timezone: companyContext.defaultTimezone,
  //   });

  //   // Calculate fiscal period boundaries
  //   const fiscalPeriod = calculateFiscalPeriodBoundaries({
  //     date: txnDate,
  //     fiscalYearEnd: companyContext.fiscalYearEnd,
  //   });

  //   // Calculate days to period close
  //   const periodEndDate = new Date(fiscalPeriod.month_end);
  //   const daysToPeriodClose = calculateDaysToPeriodClose({
  //     startDate: txnDate,
  //     endDate: periodEndDate,
  //   });

  //   // Step 7: Detect pattern signals
  //   const signals = detectPatternSignals({
  //     description: normalizedDesc,
  //     amount: amountNative,
  //     currencyCode: txn.transaction_currency_code,
  //   });

  //   // Step 8: Determine typical frequency (if we have historical data)
  //   let typicalFrequency:
  //     | 'one_time'
  //     | 'weekly'
  //     | 'monthly'
  //     | 'quarterly'
  //     | 'annual'
  //     | 'irregular' = 'one_time';
  //   if (contactStats && contactStats.totalTransactions > 1) {
  //     // Fetch recent transaction dates for this contact
  //     const recentDates = await fetchRecentTransactionDates({
  //       db,
  //       companyId,
  //       contactFingerprint: contactResolution.contactFingerprint!,
  //       currencyCode: txn.transaction_currency_code,
  //     });
  //     typicalFrequency = determineTypicalFrequency(recentDates);
  //   }

  //   const snapshotInfo = buildContactStatsSnapshot({
  //     contactStats,
  //     contactFingerprint: contactResolution.contactFingerprint,
  //     asOfTransactionId: bankTransactionId,
  //     asOfTransactionDate: toYMD(txnDate),
  //   });
  //   const statsSnapshot = snapshotInfo.snapshot;
  //   const statsContext = snapshotInfo.context;

  //   // Step 9: Build EnrichedTransaction object
  //   const enrichedTransaction: EnrichedTransaction = {
  //     version: ENRICHMENT_VERSION,

  //     ids: {
  //       bank_transaction_id: txn.bank_transaction_id,
  //       bank_transaction_batch_id: txn.bank_transaction_batch_id || null,
  //       company_uuid: companyId,
  //       bank_account_id: txn.bank_account_id,
  //       bank_account_coa_id: txn.bank_account_coa_id,
  //       contact_id: contactResolution.contactId,
  //       enrichment_job_id: null, // Will be set by worker
  //     },

  //     raw: {
  //       date: txn.date,
  //       description: txn.description,
  //       amount_native: amountNative,
  //       system_ex_rate: systemExRate,
  //       amount_reporting: amountReporting,
  //       currency_code: txn.transaction_currency_code,
  //       direction,
  //       source: txn.raw_data?.source || 'csv',
  //       metadata: txn.raw_data || {},
  //     },

  //     normalized: {
  //       description: normalizedDesc,
  //       description_tokens: descriptionTokens,
  //       contact_name: contactResolution.contactName,
  //       contact_fingerprint: contactResolution.contactFingerprint,
  //       contact_match_confidence: contactResolution.matchConfidence,
  //       contact_type: contactResolution.contactType,
  //       normalized_reference: null,
  //       global_contact_id: contactResolution.globalContactId,
  //       global_contact_category_hints:
  //         contactResolution.globalContactCategoryHints,
  //     },

  //     context: {
  //       industry: companyContext.industry,
  //       company_name: companyContext.companyName,
  //       company_description: null,
  //       company_website: null,
  //       country_id: companyContext.countryId,
  //       country_code: companyContext.countryCode,
  //       accounting_basis: companyContext.accountingBasis,
  //       reporting_framework: companyContext.reportingFramework,
  //       reporting_currency_id: companyContext.reportingCurrencyId,
  //       reporting_currency_code: companyContext.reportingCurrencyCode,
  //       transaction_currency_id: txn.transaction_currency_id,
  //       transaction_currency_code: txn.transaction_currency_code,
  //       coa_snapshot_version: companyContext.coaSnapshotVersion,
  //       coa_snapshot_id: companyContext.coaSnapshotId,
  //     },

  //     // historical: {
  //     //   bank_contact_stats: contactStats
  //     //     ? {
  //     //         id: contactStats.companyId, // Placeholder - will be set by worker
  //     //         version: ENRICHMENT_VERSION,
  //     //       }
  //     //     : {
  //     //         id: companyId,
  //     //         version: ENRICHMENT_VERSION,
  //     //       },
  //     // },
  //     historical: {
  //       bank_contact_stats_snapshot: statsSnapshot,
  //     },

  //     signals,

  //     temporal: {
  //       ...temporalFeatures,
  //       days_to_period_close: daysToPeriodClose,
  //       fiscal_period: fiscalPeriod,
  //     },

  //     feedback_summary: undefined, // Not available during initial enrichment

  //     metadata: {
  //       source: 'ingestion',
  //       enriched_at: new Date().toISOString(),
  //       enrichment_latency_ms: Date.now() - startTime,
  //       enrichment_version: ENRICHMENT_VERSION,
  //       status: 'enriched',
  //       error_message: null,
  //       processing_context: 'primary',
  //       stats_replay_seq:
  //         statsContext.statsReplaySeq > 0
  //           ? statsContext.statsReplaySeq
  //           : undefined,
  //       stats_snapshot_checksum: statsContext.snapshotChecksum || undefined,
  //     },
  //   };

  //   const latencyMs = Date.now() - startTime;

  //   logger.debug(
  //     { bankTransactionId, latencyMs },
  //     'Transaction enrichment completed',
  //   );

  //   return {
  //     success: true,
  //     bankTransactionId,
  //     enrichedTransaction,
  //     latencyMs,
  //     statsContext,
  //   };
  // } catch (error) {
  //   const latencyMs = Date.now() - startTime;
  //   const errorMessage =
  //     error instanceof Error ? error.message : 'Unknown error';

  //   logger.error(
  //     { error, bankTransactionId, latencyMs },
  //     'Transaction enrichment failed',
  //   );

  //   return {
  //     success: false,
  //     bankTransactionId,
  //     error: errorMessage,
  //     latencyMs,
  //   };
  // }
}
// /**
//  * Resolve contact from transaction data.
//  */
// async function resolveContact({
//   companyUUID,
//   contactId,
//   contactTypeSnapshot,
//   payee,
//   description,
//   rawData,
//   trx,
// }: {
//   companyUUID: string;
//   contactId: string | null;
//   contactTypeSnapshot?: ContactType | null;
//   payee: string | null;
//   description: string;
//   rawData?: unknown;
//   trx?: Knex.Transaction;
// }): Promise<ContactResolutionResult> {
//   const db = trx || knexClient;
//   const confidenceRank: Record<
//     ContactResolutionResult['contact_match_confidence'],
//     number
//   > = {
//     high: 3,
//     medium: 2,
//     low: 1,
//     unmatched: 0,
//   };
//   const upgradeConfidence = (
//     next: ContactResolutionResult['contact_match_confidence'],
//   ) => {
//     if (
//       confidenceRank[next] > confidenceRank[contactObj.contact_match_confidence]
//     ) {
//       contactObj.contact_match_confidence = next;
//     }
//   };

//   const contactObj: ContactResolutionResult = {
//     contact_id: contactId,
//     contact_name: null,
//     contact_fingerprint: null,
//     contact_match_confidence: 'unmatched',
//     contact_type: contactTypeSnapshot ?? 'unknown',
//     global_contact_name: null,
//     global_contact_category_hints: null,
//     global_contact_mcc: null,
//   };

//   if (contactId) {
//     const existingContact = await loadLinkedContact({
//       db,
//       companyUUID,
//       contactId,
//     });

//     if (existingContact) {
//       contactObj.contact_name = existingContact.display_name;
//       upgradeConfidence('high');
//     } else {
//       // Contact was removed after the transaction was recorded
//       contactObj.contact_id = null;
//     }
//   }

//   const categoryHints = new Set<string>();

//   if (!contactObj.contact_name) {
//     const heuristicName = extractHeuristicContactName({ description, payee });
//     if (heuristicName) {
//       contactObj.contact_name = heuristicName;
//       upgradeConfidence('low');
//     }
//   }

//   const merchantMatch = matchGlobalMerchant(description);
//   if (merchantMatch) {
//     contactObj.global_contact_name = merchantMatch.merchant.name;
//     contactObj.global_contact_category_hints =
//       merchantMatch.merchant.category_hints;
//     merchantMatch.merchant.category_hints.forEach((hint) =>
//       categoryHints.add(hint),
//     );
//     if (!contactObj.contact_name) {
//       contactObj.contact_name = merchantMatch.merchant.name;
//     }
//     upgradeConfidence('medium');
//   }

//   const mccInfo = extractMccCode({
//     description,
//     rawData,
//   });
//   if (mccInfo) {
//     const reference = lookupMccReference(mccInfo.code);
//     if (reference) {
//       reference.category_hints.forEach((hint) => categoryHints.add(hint));
//       contactObj.global_contact_mcc = reference.mcc;
//       if (!contactObj.global_contact_name) {
//         contactObj.global_contact_name = reference.title;
//       }
//       upgradeConfidence('medium');
//     }
//   }

//   if (categoryHints.size > 0) {
//     const merged = Array.from(categoryHints);
//     contactObj.global_contact_category_hints = merged;
//   }

//   contactObj.contact_fingerprint = contactObj.contact_name
//     ? generateContactFingerprint(contactObj.contact_name)
//     : null;

//   return contactObj;
// }

// function compileMerchantPatterns(
//   patterns: MerchantPattern[],
// ): CompiledMerchantPattern[] {
//   const compiled: CompiledMerchantPattern[] = [];

//   for (const merchant of patterns) {
//     const regexes: RegExp[] = [];

//     for (const expression of merchant.patterns) {
//       try {
//         regexes.push(new RegExp(expression, 'i'));
//       } catch (error) {
//         logger.warn(
//           { expression, merchant: merchant.name, error },
//           'Failed to compile merchant pattern expression',
//         );
//       }
//     }

//     if (regexes.length === 0) {
//       logger.warn(
//         { merchant: merchant.name },
//         'Skipping merchant pattern without valid expressions',
//       );
//       continue;
//     }

//     compiled.push({ merchant, regexes });
//   }

//   return compiled;
// }

// async function loadLinkedContact({
//   db,
//   companyUUID,
//   contactId,
// }: {
//   db: Knex | Knex.Transaction;
//   companyUUID: string;
//   contactId: string;
// }): Promise<{ id: string; display_name: string } | null> {
//   const contact = await db('contacts')
//     .select('id', 'display_name')
//     .where({
//       id: contactId,
//       company_id: companyUUID,
//       is_deleted: false,
//     })
//     .first();

//   if (!contact) {
//     logger.warn(
//       { contactId, companyUUID },
//       'Linked contact missing during enrichment',
//     );
//   }

//   return contact ?? null;
// }

// function extractHeuristicContactName({
//   description,
//   payee,
// }: {
//   description: string;
//   payee: string | null;
// }): string | null {
//   const fromDescription = extractContactFromDescription(description);
//   if (fromDescription) {
//     return fromDescription;
//   }

//   return payee?.trim() || null;
// }

// function matchGlobalMerchant(
//   description: string,
// ): CompiledMerchantPattern | null {
//   if (!description) {
//     return null;
//   }

//   for (const pattern of compiledMerchantPatterns) {
//     for (const regex of pattern.regexes) {
//       if (regex.test(description)) {
//         return pattern;
//       }
//     }
//   }

//   return null;
// }

/**
 * Calculate fiscal period boundaries
 */
function calculateFiscalPeriodBoundaries({
  date,
  fiscalYearEnd,
}: {
  date: Date;
  fiscalYearEnd: string; // MM-DD format
}): {
  year_start: string;
  year_end: string;
  quarter_start: string;
  quarter_end: string;
  month_start: string;
  month_end: string;
} {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-11

  const [fyEndMonth, fyEndDay] = fiscalYearEnd.split('-').map(Number);

  // Calculate fiscal year boundaries
  let fyStartYear = year;
  let fyEndYear = year;

  if (
    month + 1 > fyEndMonth ||
    (month + 1 === fyEndMonth && date.getDate() > fyEndDay)
  ) {
    // We're past fiscal year end, so we're in next fiscal year
    fyStartYear = year;
    fyEndYear = year + 1;
  } else {
    // We're before fiscal year end, so we're in current fiscal year
    fyStartYear = year - 1;
    fyEndYear = year;
  }

  const fyStartMonth = fyEndMonth === 12 ? 1 : fyEndMonth + 1;
  const yearStart = `${fyStartYear}-${String(fyStartMonth).padStart(2, '0')}-01`;
  const yearEnd = `${fyEndYear}-${String(fyEndMonth).padStart(2, '0')}-${String(fyEndDay).padStart(2, '0')}`;

  // Calculate month boundaries
  const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
  const monthEnd = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDayOfMonth).padStart(2, '0')}`;

  // Calculate quarter boundaries (simplified - using calendar quarters for now)
  const quarter = Math.ceil((month + 1) / 3);
  const quarterStartMonth = (quarter - 1) * 3 + 1;
  const quarterEndMonth = quarter * 3;
  const quarterStart = `${year}-${String(quarterStartMonth).padStart(2, '0')}-01`;
  const lastDayOfQuarterEndMonth = new Date(year, quarterEndMonth, 0).getDate();
  const quarterEnd = `${year}-${String(quarterEndMonth).padStart(2, '0')}-${String(lastDayOfQuarterEndMonth).padStart(2, '0')}`;

  return {
    year_start: yearStart,
    year_end: yearEnd,
    quarter_start: quarterStart,
    quarter_end: quarterEnd,
    month_start: monthStart,
    month_end: monthEnd,
  };
}

/**
 * Fetch recent transaction dates for frequency analysis
 */
async function fetchRecentTransactionDates({
  db,
  companyId,
  contactFingerprint,
  currencyCode,
}: {
  db: Knex | Knex.Transaction;
  companyId: string;
  contactFingerprint: string;
  currencyCode: string;
}): Promise<Date[]> {
  // Query last 20 transactions for this contact
  const results = await db('categorization_tasks as ct')
    .join('bank_transactions as bt', 'ct.bank_transaction_id', 'bt.id')
    .join('bank_accounts as ba', 'bt.bank_account_id', 'ba.id')
    .join('currencies as cur', 'ba.currency_id', 'cur.id')
    .where('ct.company_id', companyId)
    .where('cur.code', currencyCode)
    .where('bt.is_deleted', false)
    .where('ct.is_deleted', false)
    .whereRaw(
      `ct.enriched_transaction->'normalized'->>'contact_fingerprint' = ?`,
      [contactFingerprint],
    )
    .orderBy('bt.date', 'desc')
    .limit(20)
    .select('bt.date');

  return results.map((r) => new Date(r.date));
}
