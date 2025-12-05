import type { Knex } from 'knex';

import {
  NG_USER,
  NG_USER_EMAIL,
  US_USER,
  US_USER_EMAIL,
} from '../seeds/demo/config/001_users/users.data.js';
import {
  getCompanyId,
  getCompanyIdMap,
  getDemoUserByEmail,
  getDemoUserMap,
} from '../seeds/demo/shared/utils.js';

/**
 * Test helpers for working with demo data
 * Centralizes all demo data access to avoid importing from seeds/demo everywhere
 *
 * These helpers retrieve existing demo data - ensure demo data is seeded before running tests
 */

// Re-export demo data constants for easy access
export { NG_USER, NG_USER_EMAIL, US_USER, US_USER_EMAIL };

/**
 * Get demo company ID by short code (e.g., 'bizDemoUS', 'firmDemoNG')
 * Throws if demo company doesn't exist - ensure demo data is seeded
 */
export async function getTestCompanyId(
  trx: Knex.Transaction,
  shortCode: string = 'bizDemoUS',
): Promise<string> {
  const companyId = await getCompanyId(trx, shortCode);
  if (!companyId) {
    throw new Error(
      `Demo company ${shortCode} not found. Ensure demo data is seeded.`,
    );
  }
  return companyId;
}

/**
 * Get demo user ID by email
 * Throws if demo user doesn't exist - ensure demo data is seeded
 */
export async function getTestUserId(
  trx: Knex.Transaction,
  email: string = US_USER_EMAIL,
): Promise<string> {
  const demoUser = await getDemoUserByEmail(trx, email);
  if (!demoUser) {
    throw new Error(
      `Demo user ${email} not found. Ensure demo data is seeded.`,
    );
  }
  return demoUser.id;
}

/**
 * Get currency ID by code (e.g., 'USD', 'NGN')
 */
export async function getCurrencyId(
  trx: Knex.Transaction,
  code: string = 'USD',
): Promise<string> {
  const currency = await trx('currencies')
    .where('code', code)
    .select('id')
    .first();
  if (!currency) {
    throw new Error(
      `Currency ${code} not found in test database. Ensure migrations have run.`,
    );
  }
  return currency.id;
}

/**
 * Get country ID by code (e.g., 'US', 'NG')
 */
export async function getCountryId(
  trx: Knex.Transaction,
  code: string = 'US',
): Promise<string> {
  const country = await trx('countries')
    .where('code', code)
    .select('id')
    .first();
  if (!country) {
    throw new Error(
      `Country ${code} not found in test database. Ensure migrations have run.`,
    );
  }
  return country.id;
}

/**
 * Get a bank account for a demo company
 * Returns the first bank account found for the company
 */
export async function getDemoBankAccount(
  trx: Knex.Transaction,
  companyId: string,
): Promise<string> {
  const bankAccount = await trx('bank_accounts')
    .where('company_id', companyId)
    .select('id')
    .first();

  if (!bankAccount) {
    throw new Error(
      `No bank account found for company ${companyId}. Ensure demo data is seeded.`,
    );
  }

  return bankAccount.id;
}

/**
 * Get a COA entry for a demo company
 * Returns the first COA entry found for the company
 */
export async function getDemoCoaEntry(
  trx: Knex.Transaction,
  companyId: string,
): Promise<string> {
  const coa = await trx('coa')
    .where('company_id', companyId)
    .select('id')
    .first();

  if (!coa) {
    throw new Error(
      `No COA entry found for company ${companyId}. Ensure demo data is seeded.`,
    );
  }

  return coa.id;
}

/**
 * Test data structure returned by setup functions
 */
export interface TestData {
  companyId: string;
  userId: string;
  bankAccountId: string;
  bankTransactionId: string;
  coaId: string;
}
