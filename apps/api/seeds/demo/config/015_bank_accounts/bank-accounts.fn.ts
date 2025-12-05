import type { Knex } from 'knex';

import { DEMO_CURRENCIES, type DemoFilter } from '../../shared/config.js';
import {
  deleteDemoData,
  getAccountTypeByKey,
  getBankMap,
  getDemoUserMap,
  resolveFiltersToIds,
} from '../../shared/utils.js';
import {
  getRawBankAccountsForInsertion,
  type RawBankAccount,
} from './bank-accounts.data.js';

/**
 * Create COA and bank account atomically following production pattern
 */
const createBankAccountWithCoa = async (
  account: RawBankAccount,
  bankId: string,
  currencyId: string,
  createdById: string,
  trx: Knex.Transaction,
): Promise<any> => {
  // Get the bank account type (ca_bank) from cache
  const accountType = await getAccountTypeByKey(trx, 'ca_bank');
  if (!accountType || !accountType.id) {
    throw new Error('Failed to fetch account type ca_bank for bank account');
  }

  // Create COA entry first (following production createNewBankAccount pattern)
  const [coa] = await trx('coa')
    .insert({
      company_id: account.companyId,
      name: account.displayName, // Use display name as COA name
      code: null, // No code for demo bank accounts
      account_type_id: accountType.id,
      source: 'user', // Demo accounts are user-created
      created_by_id: createdById,
      updated_by_id: createdById,
      currency_id: currencyId,
      is_active: true,
    })
    .returning('*');

  if (!coa || !coa.id) {
    throw new Error(
      `Failed to create COA for bank account ${account.displayName}`,
    );
  }

  // Create bank account with reference to COA
  const [bankAccount] = await trx('bank_accounts')
    .insert({
      display_name: account.displayName,
      account_name: account.accountName,
      account_type: account.accountType,
      account_number: account.accountNumber,
      account_number_mask: account.accountNumber.slice(-4),
      business_or_personal: account.businessOrPersonal,
      bank_id: bankId,
      currency_id: currencyId,
      company_id: account.companyId,
      coa_id: coa.id, // Reference to created COA
      connection_status: 'not_connected', // Demo accounts are not connected to providers
      created_by_id: createdById,
      updated_by_id: createdById,
    })
    .returning('*');

  if (!bankAccount) {
    throw new Error(`Failed to create bank account ${account.displayName}`);
  }

  return { bankAccount, coa };
};

export const createDemoBankAccounts = async (
  trx: Knex.Transaction,
  filters?: DemoFilter,
) => {
  const rawBankAccountsData = await getRawBankAccountsForInsertion(
    trx,
    filters,
  );

  if (rawBankAccountsData.length === 0) {
    console.log('No bank accounts to create based on filters');
    return;
  }

  // Get user mapping for dynamic user ID lookup
  const userMap = await getDemoUserMap(trx);

  // Helper to get user ID safely
  const getUserId = (email: string) => {
    const userId = userMap.get(email);
    if (!userId) {
      throw new Error(`Demo user not found for email: ${email}`);
    }
    return userId;
  };

  const results: any[] = [];

  for (const item of rawBankAccountsData) {
    const { bankAccounts, company, currencyCode } = item;
    if (!bankAccounts || bankAccounts.length === 0) continue;

    // Check if bank accounts already exist for this company (idempotency)
    const existingAccounts = await trx('bank_accounts')
      .where({ company_id: company.id })
      .first();

    if (existingAccounts) {
      console.log(
        `Bank accounts already exist for company ${company.shortCode}, skipping`,
      );
      continue;
    }

    console.log(
      `Creating ${bankAccounts.length} bank accounts for company ${company.shortCode}`,
    );

    // Get currency ID from existing DEMO_CURRENCIES config
    const demoCurrency =
      DEMO_CURRENCIES[currencyCode as keyof typeof DEMO_CURRENCIES];
    if (!demoCurrency) {
      throw new Error(
        `Demo currency ${currencyCode} not found for company ${company.shortCode}`,
      );
    }

    // Get bank mapping from cache
    const bankMap = await getBankMap(trx);

    // Create each bank account with its COA in a single transaction
    const companyResults: any[] = [];
    for (const account of bankAccounts) {
      const bankId = bankMap.get(account.bankKey);
      if (!bankId) {
        throw new Error(`Bank with key ${account.bankKey} not found`);
      }

      try {
        const userId = getUserId(account.createdByEmail);
        const result = await createBankAccountWithCoa(
          account,
          bankId,
          demoCurrency.id,
          userId,
          trx,
        );
        companyResults.push(result);
      } catch (error) {
        console.error(
          `Failed to create bank account ${account.displayName}:`,
          error,
        );
        throw error;
      }
    }

    results.push(companyResults);
  }

  console.log(
    `Successfully created bank accounts for ${rawBankAccountsData.length} companies`,
  );
  return results;
};

export const deleteDemoBankAccounts = async (
  trx: Knex.Transaction,
  filters?: DemoFilter,
) => {
  // First get the COA IDs that are referenced by bank accounts we're about to delete
  // Use the same filtering logic as deleteDemoData to ensure consistency
  const bankAccountsQuery = trx('bank_accounts')
    .join('companies', 'bank_accounts.company_id', 'companies.id')
    .where('companies.is_demo_company', true);

  // Apply shortCode-based filtering (same as deleteDemoData does)
  if (filters) {
    const shortCodes = filters ? resolveFiltersToIds(filters) : [];
    if (shortCodes.length > 0) {
      bankAccountsQuery.whereIn('companies.short_code', shortCodes);
    }
  }

  const bankAccountsToDelete = await bankAccountsQuery.select(
    'bank_accounts.coa_id',
  );
  const coaIds = bankAccountsToDelete.map((ba) => ba.coa_id).filter((id) => id); // Filter out any null coa_ids

  // Delete bank accounts first (they reference COA)
  await deleteDemoData({
    trx,
    table: 'bank_accounts',
    filters,
  });

  // Then delete the associated COA entries if any exist
  if (coaIds.length > 0) {
    await trx('coa').whereIn('id', coaIds).delete();

    console.log(
      `Deleted ${coaIds.length} associated COA entries for bank accounts`,
    );
  }
};
