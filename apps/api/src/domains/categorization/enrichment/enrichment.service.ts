import { knexClient } from '../../../db/knexClient.js';
import type { Knex } from 'knex';
import type {
  EnrichedTransaction,
  EnrichmentProcessingType,
  EnrichmentResult,
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
import type { CategorizationTaskSource } from '../tasks/tasks.enums.js';

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
}
