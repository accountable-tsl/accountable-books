import type { Knex } from 'knex';

import { generateBatchFingerprint } from '../../../../src/domains/bankTransactions/bankTransactions.utils.js';
import { determineExchangeRate } from '../../../../src/domains/exchangeRates/exchangeRates.utils.js';
import { generateFingerprintSync } from '../../../../src/shared/index.js';
import { type DemoFilter } from '../../shared/config.js';
import {
  getDemoCompanies,
  getDemoUserMap,
  resolveFiltersToIds,
} from '../../shared/utils.js';
import { generateDemoCompaniesMap } from '../002_companies/companies.data.js';
import { generateBankTransactions } from './bank-transactions.data.js';

/**
 * NOTE: Partition creation is skipped for seed to avoid DDL locks within transaction context.
 * Transactions will go to default partition. Partitions can be created later if needed.
 * This is acceptable for seed data as partition management can be handled separately.
 */

/**
 * Inline helper: Get company UUID (avoid importing from src/)
 */
async function getCompanyUUID(
  identifier: string,
  trx: Knex.Transaction,
): Promise<string | null> {
  const trimmedId = identifier.trim();

  const company = await trx('companies')
    .select('id')
    .where({ id: trimmedId })
    .orWhere({ short_code: trimmedId })
    .first();

  return company?.id || null;
}

/**
 * Categorization status constant (inline to avoid imports)
 */
// const CATEGORIZATION_STATUS_UNCATEGORIZED = 'uncategorized';

/**
 * Helper: Generate external ID for transaction deduplication
 */
function generateExternalId(input: {
  date: Date;
  amount: number;
  payee: string;
  description: string;
  bankAccountId: string;
}): string {
  const { date, amount, payee, description, bankAccountId } = input;
  const formattedDate = date.toISOString().split('T')[0];
  const amountHash = Number(amount).toFixed(4);
  const payeeNorm = (payee || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const descNorm = (description || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

  return generateFingerprintSync(
    `${formattedDate}|${amountHash}|${payeeNorm}|${descNorm}|${bankAccountId}`,
  );
}

/**
 * Create demo bank transactions for demo companies.
 *
 * NOTE: This is a seed-specific implementation that does NOT trigger background jobs:
 * - No balance recalculation queue (enqueueBankBalance)
 * - No transaction enrichment queue (enqueueTransactionEnrichment)
 *
 * This avoids Redis connection dependencies during seeding (which would hang the process).
 * Bank balances will remain unaffected until manually recalculated or when real transactions
 * are added through the production API.
 */
export const createDemoBankTransactions = async (
  trx: Knex.Transaction,
  filters?: DemoFilter,
) => {
  console.log('  ✅ Bank transactions seed started!');

  // Test step 1: Load demo companies
  console.log('  🔍 Loading demo companies...');
  const companies = await getDemoCompanies(trx, filters);
  console.log(`  ✅ Loaded ${companies.length} companies`);

  // Test step 2: Generate companies map
  console.log('  🔍 Generating companies map...');
  const companiesMap = generateDemoCompaniesMap(filters);
  console.log(`  ✅ Generated map for ${companiesMap.length} companies`);

  // Test step 3: Get user map
  console.log('  🔍 Loading user map...');
  const userMap = await getDemoUserMap(trx);
  console.log(`  ✅ Loaded ${userMap.size} users`);

  console.log('  ✅ All initialization complete!');

  // Test step 4: Loop through companies and load bank accounts
  console.log(`  📊 Processing ${companies.length} companies...`);

  for (const company of companies) {
    console.log(`  🏢 Processing company: ${company.short_code}...`);
    const companyMapData = companiesMap.find(
      (c) => c.company.shortCode === company.short_code,
    );
    if (!companyMapData) {
      console.warn(
        `Company map data not found for ${company.short_code}, skipping transactions`,
      );
      continue;
    }

    console.log(`    🔍 Loading bank accounts for ${company.short_code}...`);
    // Ensure we have bank accounts with currency information
    const bankAccounts = await trx('bank_accounts as ba')
      .join('companies as c', 'ba.company_id', 'c.id')
      .where({ 'ba.company_id': company.id, 'ba.is_deleted': false })
      .select(
        'ba.id',
        'ba.account_type',
        'ba.display_name',
        'ba.business_or_personal',
        'ba.company_id',
        'ba.currency_id as bankCurrencyId',
        'c.reporting_currency_id as reportingCurrencyId',
      );
    console.log(`    ✅ Loaded ${bankAccounts.length} bank accounts`);

    if (bankAccounts.length === 0) {
      console.log(
        `No bank accounts for company ${company.short_code}, skipping transactions`,
      );
      continue;
    }

    const userId = userMap.get(companyMapData.user.email);
    if (!userId) {
      throw new Error(
        `Demo user not found for ${companyMapData.user.email} (company ${company.short_code})`,
      );
    }

    // Get company UUID for operations
    const companyUUID = await getCompanyUUID(company.id, trx);
    if (!companyUUID) {
      throw new Error(`Company UUID not found for ${company.short_code}`);
    }

    for (const bankAccount of bankAccounts) {
      const batch = generateBankTransactions({
        country: companyMapData.country.code,
        type: companyMapData.company.companyType,
        bankAccountId: bankAccount.id,
      });

      const { bank_transactions } = batch;

      // Skip if no transactions
      if (!bank_transactions || bank_transactions.length === 0) {
        console.log(
          `No transactions generated for account ${bankAccount.id}, skipping`,
        );
        continue;
      }

      // Normalize to Date objects for downstream logic
      const normalizedTxns = bank_transactions.map((tx) => ({
        ...tx,
        date: tx.date,
        txn_at: tx.date,
      }));

      // Find earliest and latest transactions
      let earliestTxn = normalizedTxns[0];
      let latestTxn = normalizedTxns[0];
      for (const txn of normalizedTxns) {
        if (txn.date < earliestTxn.date) earliestTxn = txn;
        if (txn.date > latestTxn.date) latestTxn = txn;
      }

      // Create batch record
      const fingerprint = generateBatchFingerprint(normalizedTxns);
      const [batchRecord] = await trx('bank_transaction_batches')
        .insert({
          bank_account_id: bankAccount.id,
          start_date: earliestTxn.date,
          end_date: latestTxn.date,
          source: batch.source || 'manual_entry',
          fingerprint,
          import_row_count: bank_transactions.length,
          metadata: {
            bankAccountType: bankAccount.account_type,
            generatedFor: company.short_code,
          },
          created_by_id: userId,
          updated_by_id: userId,
        })
        .onConflict(['bank_account_id', 'fingerprint'])
        .ignore()
        .returning(['id']);

      if (!batchRecord) {
        console.log(
          `Batch already exists for ${company.short_code} account ${bankAccount.id}, skipping`,
        );
        continue;
      }

      // Extract unique payees and create contacts
      const uniquePayees = [
        ...new Set(
          normalizedTxns
            .map((tx) => tx.payee?.trim())
            .filter((payee): payee is string => !!payee),
        ),
      ];

      if (uniquePayees.length > 0) {
        await trx('contacts')
          .insert(
            uniquePayees.map((payee) => ({
              company_id: companyUUID,
              display_name: payee,
              normalized_name: payee.toLowerCase(),
              created_by_id: userId,
              updated_by_id: userId,
            })),
          )
          .onConflict(['company_id', 'normalized_name'])
          .ignore();
      }

      // Fetch created contacts for linking
      const createdContacts = uniquePayees.length
        ? await trx('contacts')
            .select(['id', 'normalized_name'])
            .where({ company_id: companyUUID })
            .whereIn(
              'normalized_name',
              uniquePayees.map((p) => p.toLowerCase()),
            )
        : [];

      const contactIdByName = new Map(
        createdContacts.map((r) => [r.normalized_name, r.id as string]),
      );

      // Get currency information for exchange rate calculation
      const bankCurrencyId = bankAccount.bankCurrencyId;
      const reportingCurrencyId = bankAccount.reportingCurrencyId;
      const sameCurrency = bankCurrencyId === reportingCurrencyId;

      // Collect unique transaction dates for exchange rate fetching
      const uniqueDates = !sameCurrency
        ? [...new Set(normalizedTxns.map((tx) => tx.date))]
        : [];

      // Pre-fetch exchange rates if currencies differ
      const fxRates = new Map<string, number>();
      if (uniqueDates.length > 0) {
        console.log(
          `    💱 Fetching exchange rates for ${uniqueDates.length} unique dates...`,
        );
        const ratePromises = uniqueDates.map(async (date) => {
          const rate = await determineExchangeRate({
            date,
            fromCurrencyId: bankCurrencyId,
            toCurrencyId: reportingCurrencyId,
          });
          return { date, rate };
        });

        const rates = await Promise.all(ratePromises);

        // Build rate map and check for missing rates
        const missingDates: string[] = [];
        rates.forEach(({ date, rate }) => {
          if (rate === null) {
            missingDates.push(date.toISOString());
          } else {
            fxRates.set(date.toISOString(), Number(rate));
          }
        });

        if (missingDates.length > 0) {
          throw new Error(
            `Missing exchange rates for dates: ${missingDates.join(', ')}`,
          );
        }
        console.log(`    ✅ Exchange rates fetched`);
      }

      // Prepare transactions for insertion
      const preparedTransactions = normalizedTxns.map((tx) => {
        const rate = sameCurrency ? 1 : fxRates.get(tx.date.toISOString());

        if (!rate) {
          throw new Error(`Missing exchange rate for ${tx.date}`);
        }

        const generatedExternalId = generateExternalId({
          date: new Date(tx.date),
          amount: tx.amount,
          payee: tx.payee || '',
          description: tx.description || '',
          bankAccountId: bankAccount.id,
        });

        const contactId = tx.payee
          ? contactIdByName.get(tx.payee.trim().toLowerCase())
          : undefined;

        return {
          date: tx.date,
          txn_at: tx.txn_at || tx.date, // Use date as transaction timestamp
          amount: Number(tx.amount),
          payee: tx.payee || null,
          description: tx.description || null,
          reference: tx.reference || null,
          bank_account_id: bankAccount.id,
          contact_id: contactId || null,
          contact_type_snapshot: null,
          raw_data: tx.metadata ?? null,
          external_id: generatedExternalId,
          system_exchange_rate: Number(rate),
          // categorization_status: CATEGORIZATION_STATUS_UNCATEGORIZED,
          bank_transaction_batch_id: batchRecord.id,
          source: batch.source || 'manual_entry',
          created_by_id: userId,
          updated_by_id: userId,
        };
      });

      // Insert transactions
      const insertedTxns = await trx('bank_transactions')
        .insert(preparedTransactions)
        .onConflict(['bank_account_id', 'external_id', 'date'])
        .ignore()
        .returning('id');

      const inserted = insertedTxns.length;
      const skipped = preparedTransactions.length - inserted;

      console.log(
        `✓ Created ${inserted} transactions for ${company.short_code} account ${bankAccount.display_name}${skipped > 0 ? ` (${skipped} duplicates skipped)` : ''}`,
      );

      // NOTE: We deliberately skip balance recalculation and enrichment queues
      // to avoid Redis connection during seeding. Balances can be recalculated
      // later if needed through the production API or worker.
    }
  }
};

export const deleteDemoBankTransactions = async (
  trx: Knex.Transaction,
  filters?: DemoFilter,
) => {
  // Resolve company short codes from filters
  const shortCodes = filters ? resolveFiltersToIds(filters) : [];

  // Get bank account IDs for demo companies (filtered)
  const bankAccountIdsQuery = trx('bank_accounts')
    .join('companies', 'bank_accounts.company_id', 'companies.id')
    .where('companies.is_demo_company', true)
    .select('bank_accounts.id');

  if (shortCodes.length > 0) {
    bankAccountIdsQuery.whereIn('companies.short_code', shortCodes);
  }

  const bankAccountIds = (await bankAccountIdsQuery).map((row) => row.id);
  if (bankAccountIds.length === 0) {
    console.log('No bank accounts found for demo companies, skipping delete');
    return;
  }

  // Temporarily disable triggers to allow demo data cleanup
  await trx.raw(
    'ALTER TABLE bank_transactions DISABLE TRIGGER guard_bank_transactions_update',
  );
  await trx.raw(
    'ALTER TABLE bank_transactions DISABLE TRIGGER prevent_bank_transactions_delete',
  );

  try {
    // Delete transactions (now possible with triggers disabled)
    await trx('bank_transactions')
      .whereIn('bank_account_id', bankAccountIds)
      .delete();

    // Delete batches
    await trx('bank_transaction_batches')
      .whereIn('bank_account_id', bankAccountIds)
      .delete();

    console.log(
      `Deleted bank transactions and batches for ${bankAccountIds.length} accounts`,
    );
  } finally {
    // Re-enable triggers
    await trx.raw(
      'ALTER TABLE bank_transactions ENABLE TRIGGER guard_bank_transactions_update',
    );
    await trx.raw(
      'ALTER TABLE bank_transactions ENABLE TRIGGER prevent_bank_transactions_delete',
    );
  }
};
