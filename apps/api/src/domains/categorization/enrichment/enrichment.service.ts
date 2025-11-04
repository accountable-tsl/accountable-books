import { knexClient } from '../../../db/knexClient.js';
import type { Knex } from 'knex';
import type {
  EnrichedTransaction,
  EnrichmentResult,
  ContactResolutionResult,
  MerchantPatternsFile,
  ContactStats,
  EnrichmentStatsContext,
} from './enrichment.types.js';
import { getCompanyContext } from './company-context.service.js';
import { getContactStats } from './contactStats.service.js';
import {
  normalizeDescription,
  extractContactFromDescription as extractContact,
  generateContactFingerprint,
  tokenizeDescription,
  detectPatternSignals,
  computeTemporalFeatures,
  calculateDaysToPeriodClose,
  determineTypicalFrequency,
  generateStatsSnapshotChecksum,
} from './enrichment.utils.js';
import { extractContactFromDescription } from './enrichment.utils.js';
import pino from 'pino';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { contactType, type ContactType } from '../../contacts/index.js';

const logger = pino();

// Load merchant patterns at module initialization
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const merchantPatternsPath = join(__dirname, '../data/merchant-patterns.json');
let merchantPatterns: MerchantPatternsFile | null = null;

try {
  const patternsData = readFileSync(merchantPatternsPath, 'utf-8');
  merchantPatterns = JSON.parse(patternsData) as MerchantPatternsFile;
  logger.info(
    { count: merchantPatterns.patterns.length },
    'Loaded merchant patterns',
  );
} catch (error) {
  logger.warn(
    { error },
    'Failed to load merchant patterns - continuing without',
  );
}

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
  'bt.amount as amount_native',
  'bt.system_exchange_rate as system_exchange_rate',
  'bt.bank_transaction_batch_id as bank_transaction_batch_id',
  'bt.contact_id as contact_id',
  'bt.payee as payee',
  'bt.contact_type_snapshot as contact_type',
  'bt.raw_data as raw_data',

  // Bank account
  'ba.id as bank_account_id',
  'ba.company_id as company_id',
  'ba.coa_id as bank_account_coa_id',

  // Transaction currency
  'cur.id as transaction_currency_id',
  'cur.code as transaction_currency_code',
];

/**
 * Enrich a single bank transaction
 * This is the core enrichment function that produces an EnrichedTransaction object
 */
export async function enrichTransaction(
  bankTransactionId: string,
  trx?: Knex.Transaction,
): Promise<EnrichmentResult> {
  const startTime = Date.now();
  const db = trx || knexClient;

  try {
    // Step 1: Load base transaction with minimal joins
    const txn = await db('bank_transactions as bt')
      .select(BANK_TX_SELECT_FIELDS)
      .leftJoin('bank_accounts as ba', 'bt.bank_account_id', 'ba.id')
      .leftJoin('currencies as cur', 'ba.currency_id', 'cur.id')
      .where('bt.id', bankTransactionId)
      .where('bt.is_deleted', false)
      .first();

    if (!txn) {
      throw new Error(`Bank transaction not found: ${bankTransactionId}`);
    }

    const companyId = txn.company_id;

    // Load company context (cached via Redis)
    const companyContext = await getCompanyContext(companyId);

    // Step 2: Normalize description
    const normalizedDesc = normalizeDescription(txn.description);
    const descriptionTokens = tokenizeDescription(normalizedDesc);

    // Step 3: Contact resolution
    const contactResolution = await resolveContact({
      db,
      companyId,
      contactId: txn.contact_id || null,
      contactTypeSnapshot: txn.contact_type || null,
      payee: txn.payee,
      description: normalizedDesc,
    });

    // Step 4: Calculate amounts in reporting currency
    const amountNative = Number(txn.amount_native);
    const systemExRate = Number(txn.system_exchange_rate) || 1;
    const amountReporting = amountNative * systemExRate;

    // Determine transaction direction
    const direction: 'inflow' | 'outflow' =
      amountNative >= 0 ? 'inflow' : 'outflow';

    // Step 5: Fetch historical contact stats
    const contactStats = contactResolution.contactFingerprint
      ? await getContactStats({
          companyId,
          contactFingerprint: contactResolution.contactFingerprint,
          currencyCode: txn.transaction_currency_code,
          contactId: contactResolution.contactId,
          db,
        })
      : null;

    // Step 6: Compute temporal features
    const txnDate = new Date(txn.date);
    const temporalFeatures = computeTemporalFeatures({
      date: txnDate,
      fiscalYearEnd: companyContext.fiscalYearEnd,
      timezone: companyContext.defaultTimezone,
    });

    // Calculate fiscal period boundaries
    const fiscalPeriod = calculateFiscalPeriodBoundaries({
      date: txnDate,
      fiscalYearEnd: companyContext.fiscalYearEnd,
    });

    // Calculate days to period close
    const periodEndDate = new Date(fiscalPeriod.month_end);
    const daysToPeriodClose = calculateDaysToPeriodClose({
      startDate: txnDate,
      endDate: periodEndDate,
    });

    // Step 7: Detect pattern signals
    const signals = detectPatternSignals({
      description: normalizedDesc,
      amount: amountNative,
      currencyCode: txn.transaction_currency_code,
    });

    // Step 8: Determine typical frequency (if we have historical data)
    let typicalFrequency:
      | 'one_time'
      | 'weekly'
      | 'monthly'
      | 'quarterly'
      | 'annual'
      | 'irregular' = 'one_time';
    if (contactStats && contactStats.totalTransactions > 1) {
      // Fetch recent transaction dates for this contact
      const recentDates = await fetchRecentTransactionDates({
        db,
        companyId,
        contactFingerprint: contactResolution.contactFingerprint!,
        currencyCode: txn.transaction_currency_code,
      });
      typicalFrequency = determineTypicalFrequency(recentDates);
    }

    const snapshotInfo = buildContactStatsSnapshot({
      contactStats,
      contactFingerprint: contactResolution.contactFingerprint,
      transactionId: bankTransactionId,
      transactionDate: txnDate,
    });
    const statsSnapshot = snapshotInfo.snapshot;
    const statsContext = snapshotInfo.context;

    // Step 9: Build EnrichedTransaction object
    const enrichedTransaction: EnrichedTransaction = {
      version: ENRICHMENT_VERSION,

      ids: {
        bank_transaction_id: txn.bank_transaction_id,
        bank_transaction_batch_id: txn.bank_transaction_batch_id || null,
        company_uuid: companyId,
        bank_account_id: txn.bank_account_id,
        bank_account_coa_id: txn.bank_account_coa_id,
        contact_id: contactResolution.contactId,
        enrichment_job_id: null, // Will be set by worker
      },

      raw: {
        date: txn.date,
        description: txn.description,
        amount_native: amountNative,
        system_ex_rate: systemExRate,
        amount_reporting: amountReporting,
        currency_code: txn.transaction_currency_code,
        direction,
        source: txn.raw_data?.source || 'csv',
        metadata: txn.raw_data || {},
      },

      normalized: {
        description: normalizedDesc,
        description_tokens: descriptionTokens,
        contact_name: contactResolution.contactName,
        contact_fingerprint: contactResolution.contactFingerprint,
        contact_match_confidence: contactResolution.matchConfidence,
        contact_type: contactResolution.contactType,
        normalized_reference: null,
        global_contact_id: contactResolution.globalContactId,
        global_contact_category_hints:
          contactResolution.globalContactCategoryHints,
      },

      context: {
        industry: companyContext.industry,
        company_name: companyContext.companyName,
        company_description: null,
        company_website: null,
        country_id: companyContext.countryId,
        country_code: companyContext.countryCode,
        accounting_basis: companyContext.accountingBasis,
        reporting_framework: companyContext.reportingFramework,
        reporting_currency_id: companyContext.reportingCurrencyId,
        reporting_currency_code: companyContext.reportingCurrencyCode,
        transaction_currency_id: txn.transaction_currency_id,
        transaction_currency_code: txn.transaction_currency_code,
        coa_snapshot_version: companyContext.coaSnapshotVersion,
        coa_snapshot_id: companyContext.coaSnapshotId,
        company_settings_checksum: companyContext.settingsChecksum,
      },

      // historical: {
      //   bank_contact_stats: contactStats
      //     ? {
      //         id: contactStats.companyId, // Placeholder - will be set by worker
      //         version: ENRICHMENT_VERSION,
      //       }
      //     : {
      //         id: companyId,
      //         version: ENRICHMENT_VERSION,
      //       },
      // },
      historical: {
        bank_contact_stats_snapshot: statsSnapshot,
      },

      signals,

      temporal: {
        ...temporalFeatures,
        days_to_period_close: daysToPeriodClose,
        fiscal_period: fiscalPeriod,
      },

      feedback_summary: undefined, // Not available during initial enrichment

      metadata: {
        source: 'ingestion',
        enriched_at: new Date().toISOString(),
        enrichment_latency_ms: Date.now() - startTime,
        enrichment_version: ENRICHMENT_VERSION,
        status: 'enriched',
        error_message: null,
        processing_context: 'primary',
        stats_replay_seq:
          statsContext.statsReplaySeq > 0
            ? statsContext.statsReplaySeq
            : undefined,
        stats_snapshot_checksum: statsContext.snapshotChecksum || undefined,
      },
    };

    const latencyMs = Date.now() - startTime;

    logger.debug(
      { bankTransactionId, latencyMs },
      'Transaction enrichment completed',
    );

    return {
      success: true,
      bankTransactionId,
      enrichedTransaction,
      latencyMs,
      statsContext,
    };
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
    };
  }
}
/**
 * Resolve contact from transaction data
 * Multi-step process: existing contact � global patterns � company contacts � fingerprint only
 */
async function resolveContact({
  companyId,
  contactId,
  contactTypeSnapshot,
  payee,
  description,
  trx,
}: {
  db: Knex | Knex.Transaction;
  companyId: string;
  contactId: string | null;
  contactTypeSnapshot?: ContactType | null;
  payee: string | null;
  description: string;
  trx?: Knex.Transaction;
}): Promise<ContactResolutionResult> {
  const db = trx || knexClient;
  // If contact already linked, fetch it
  const contactObj: ContactResolutionResult = {
    contact_id: contactId,
    contact_name: null,
    contact_fingerprint: null,
    contact_match_confidence: 'unmatched',
    contact_type: contactTypeSnapshot ?? 'unknown',
    global_contact_name: null,
    global_contact_category_hints: null,
  };

  if (contactId) {
    const existingContact = await db('contacts')
      .select('id', 'name')
      .where({ id: contactId, is_deleted: false })
      .first();
    if (existingContact) {
      contactObj.contact_name = existingContact.name;
      contactObj.contact_match_confidence = 'exact_contact';
    }
  }

  if (!contactObj.contact_name) {
    // Try to extract contact name from description
    // const extractedName = extractContact(description) || payee;
    const extractedName = extractContactFromDescription(description) || payee;

    if (extractedName) {
      contactObj.contact_name = extractedName;
      contactObj.contact_match_confidence = 'fingerprint_only';
    }
  }

  // Check global merchant patterns
  if (merchantPatterns) {
    for (const merchantPattern of merchantPatterns.patterns) {
      const expressions =
        merchantPattern.patterns && merchantPattern.patterns.length > 0
          ? merchantPattern.patterns
          : merchantPattern.pattern
            ? [merchantPattern.pattern]
            : [];

      for (const expression of expressions) {
        let regex: RegExp;
        try {
          regex = new RegExp(expression, 'i');
        } catch (error) {
          logger.warn(
            { expression, contact: merchantPattern.contact, error },
            'Invalid merchant regex skipped',
          );
          continue;
        }

        if (regex.test(description)) {
          // Global pattern matched
          return {
            contactId: null, // Not linked to company contact yet
            contactName: merchantPattern.normalized_name,
            contactFingerprint: generateContactFingerprint(
              merchantPattern.normalized_name,
            ),
            matchConfidence: 'fingerprint_only',
            contactType: 'vendor',
            globalContactId: merchantPattern.contact,
            globalContactCategoryHints: merchantPattern.category_hints,
          };
        }
      }
    }
  }

  // Step 4: Match against company contacts
  const matchedContact = await db('contacts')
    .where('company_id', companyId)
    .where('is_deleted', false)
    .whereRaw('LOWER(name) = ?', [normalizedName])
    .first();

  if (matchedContact) {
    return {
      contactId: matchedContact.id,
      contactName: matchedContact.name,
      contactFingerprint: fingerprint,
      matchConfidence: 'exact_contact',
      contactType: matchedContact.type || 'unknown',
    };
  }

  // Step 5: Fallback to fingerprint only
  return {
    contactId: null,
    contactName: extractedName,
    contactFingerprint: fingerprint,
    matchConfidence: 'fingerprint_only',
    contactType: 'unknown',
  };
}

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

function buildContactStatsSnapshot({
  contactStats,
  contactFingerprint,
  transactionId,
  transactionDate,
}: {
  contactStats: ContactStats | null;
  contactFingerprint: string | null;
  transactionId: string;
  transactionDate: Date;
}): {
  snapshot: EnrichedTransaction['historical']['bank_contact_stats_snapshot'];
  context: EnrichmentStatsContext;
} {
  if (!contactStats) {
    const baseContext: EnrichmentStatsContext = {
      contactFingerprint,
      statsRowId: null,
      snapshotChecksum: null,
      statsReplaySeq: 0,
      snapshotCapturedAt: null,
    };

    return {
      snapshot: null,
      context: baseContext,
    };
  }

  const asOfTransactionId =
    contactStats.lastTransactionId ?? transactionId ?? null;
  const asOfTransactionDate =
    contactStats.lastTransactionDate ??
    transactionDate.toISOString().slice(0, 10);

  const payload = {
    totals: {
      transaction_count: contactStats.totalTransactions,
      amount_native_sum: contactStats.totalAmountNative,
      amount_reporting_sum: contactStats.totalAmountReporting,
      avg_amount_native: contactStats.avgAmountNative,
      avg_amount_reporting: contactStats.avgAmountReporting,
      stddev_amount_native: contactStats.stdDevAmountNative,
      stddev_amount_reporting: contactStats.stdDevAmountReporting,
    },
    rolling_30d: {
      transaction_count: contactStats.rolling30dTxnCount,
      amount_native_sum: contactStats.rolling30dTotalNative,
      amount_reporting_sum: contactStats.rolling30dTotalReporting,
      avg_amount_native: contactStats.rolling30dAvgNative,
      avg_amount_reporting: contactStats.rolling30dAvgReporting,
      stddev_amount_native: contactStats.rolling30dStddevNative,
      stddev_amount_reporting: contactStats.rolling30dStddevReporting,
    },
    rolling_90d: {
      transaction_count: contactStats.rolling90dTxnCount,
      amount_native_sum: contactStats.rolling90dTotalNative,
      amount_reporting_sum: contactStats.rolling90dTotalReporting,
      avg_amount_native: contactStats.rolling90dAvgNative,
      avg_amount_reporting: contactStats.rolling90dAvgReporting,
      stddev_amount_native: contactStats.rolling90dStddevNative,
      stddev_amount_reporting: contactStats.rolling90dStddevReporting,
    },
    last_transaction_id: contactStats.lastTransactionId,
    last_transaction_date: contactStats.lastTransactionDate,
  };

  const checksum =
    contactStats.statsSnapshotChecksum ||
    generateStatsSnapshotChecksum({
      stats_id: contactStats.id,
      payload,
    });

  const capturedAt =
    contactStats.snapshotCapturedAt || new Date().toISOString();

  const snapshot: EnrichedTransaction['historical']['bank_contact_stats_snapshot'] =
    {
      stats_row_id: contactStats.id,
      captured_at: capturedAt,
      as_of_transaction_id: asOfTransactionId,
      as_of_transaction_date: asOfTransactionDate,
      stats_replay_seq: contactStats.statsReplaySeq ?? 0,
      checksum,
      totals: payload.totals,
      rolling_30d: payload.rolling_30d,
      rolling_90d: payload.rolling_90d,
      last_transaction_id: contactStats.lastTransactionId,
      last_transaction_date: contactStats.lastTransactionDate,
    };

  const context: EnrichmentStatsContext = {
    contactFingerprint,
    statsRowId: contactStats.id,
    snapshotChecksum: checksum,
    statsReplaySeq: contactStats.statsReplaySeq ?? 0,
    snapshotCapturedAt: capturedAt,
  };

  return { snapshot, context };
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
