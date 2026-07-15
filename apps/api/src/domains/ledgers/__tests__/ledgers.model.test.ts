import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDb } from '../../../../config/test-db.js';
import {
  getCurrencyId,
  getTestCompanyId,
  getTestUserId,
  US_USER_EMAIL,
} from '../../../../test/helpers.js';
import { createLedgerRecord } from '../ledgers.model.js';

import type { NewLedgerTransactionData } from '../ledgers.types.js';

// Type for the result data from createLedgerRecord
interface CreateLedgerRecordResult {
  ledgerTransactionId: string;
  affectedCOAs: number;
  dateRange?: { min: string; max: string };
  warnings?: { [key: string]: string };
}

describe('createLedgerRecord - Integration Tests', () => {
  let trx: Knex.Transaction;
  let testCompanyId: string;
  let testUserId: string;
  let testCurrencyId: string;
  let testCoaIds: { cash: string; expense: string };
  let testContactId: string;
  let testProjectId: string;
  let testBankAccountId: string;

  async function createBankTransaction(amount: number, description: string) {
    const [batch] = await trx('bank_transaction_batches')
      .insert({
        bank_account_id: testBankAccountId,
        company_id: testCompanyId,
        start_date: '2025-01-15',
        end_date: '2025-01-15',
        source: 'manual_entry',
        fingerprint: randomUUID(),
        import_row_count: 1,
        created_by_id: testUserId,
      })
      .returning<{ id: string }[]>('id');

    const [bankTransaction] = await trx('bank_transactions')
      .insert({
        bank_account_id: testBankAccountId,
        company_id: testCompanyId,
        bank_transaction_batch_id: batch.id,
        transaction_date: '2025-01-15',
        transaction_at: new Date('2025-01-15T12:00:00Z'),
        amount,
        description,
        system_exchange_rate: 1,
        idempotency_key: randomUUID(),
        created_by_id: testUserId,
      })
      .returning('*');

    return bankTransaction;
  }

  beforeEach(async () => {
    // Use transaction for test isolation - will rollback in afterEach
    const db = getTestDb();
    trx = await db.transaction();

    // Get existing demo data from seeded test database
    testCompanyId = await getTestCompanyId(trx, 'bizDemoUS');
    testUserId = await getTestUserId(trx, US_USER_EMAIL);
    testCurrencyId = await getCurrencyId(trx, 'USD');

    // Get COAs from demo company (cash and expense accounts)
    const cashCoa = await trx('coa')
      .where({ company_id: testCompanyId })
      .join('account_types', 'coa.account_type_id', 'account_types.id')
      .where('account_types.key', 'ca_bank')
      .select('coa.id', 'coa.name')
      .first();

    const expenseCoa = await trx('coa')
      .where({ company_id: testCompanyId })
      .join('account_types', 'coa.account_type_id', 'account_types.id')
      .where('account_types.key', 'exp_opex_office_supplies')
      .select('coa.id', 'coa.name')
      .first();

    if (!cashCoa || !expenseCoa) {
      throw new Error(
        'Demo company missing required COAs. Seed test demo data with: NODE_ENV=test pnpm -F @accountable-books/api run demo apply',
      );
    }

    testCoaIds = { cash: cashCoa.id, expense: expenseCoa.id };

    // Get or create a contact for the demo company (within transaction)
    let contact = await trx('contacts')
      .where({ company_id: testCompanyId })
      .first();

    if (!contact) {
      [contact] = await trx('contacts')
        .insert({
          company_id: testCompanyId,
          display_name: 'Test Vendor',
          normalized_name: 'testvendor',
          created_by_id: testUserId,
          updated_by_id: testUserId,
        })
        .returning('*');
    }
    testContactId = contact.id;

    // Get or create a project for the demo company (within transaction)
    let project = await trx('projects')
      .where({ company_id: testCompanyId })
      .first();

    if (!project) {
      [project] = await trx('projects')
        .insert({
          company_id: testCompanyId,
          name: 'Test Project',
          code: 'PRJ-001',
        })
        .returning('*');
    }
    testProjectId = project.id;

    // Get or create a bank account for the demo company (within transaction)
    let bankAccount = await trx('bank_accounts')
      .where({ company_id: testCompanyId, is_deleted: false })
      .first();

    if (!bankAccount) {
      // Get or create a bank first
      let bank = await trx('banks').where({ key: 'us_chase_bank' }).first();

      if (!bank) {
        [bank] = await trx('banks')
          .insert({
            key: 'us_chase_bank',
            display_name: 'Chase Bank',
            country_code: 'US',
          })
          .returning('*');
      }

      [bankAccount] = await trx('bank_accounts')
        .insert({
          company_id: testCompanyId,
          display_name: 'Test Bank Account',
          account_type: 'checkings_current',
          business_or_personal: 'business',
          bank_id: bank.id,
          currency_id: testCurrencyId,
          coa_id: cashCoa.id,
          created_by_id: testUserId,
          updated_by_id: testUserId,
        })
        .returning('*');
    }
    testBankAccountId = bankAccount.id;
    // Bank leg COA must match the bank account's COA
    testCoaIds.cash = bankAccount.coa_id;
  });

  afterEach(async () => {
    // Rollback transaction to clean up all test data
    await trx.rollback();
  });

  describe('Success Cases', () => {
    it('should create simple manual journal entry', async () => {
      const data: NewLedgerTransactionData = {
        transaction_date: '2025-01-15',
        transaction_source: 'manual_journal',
        source_transaction_id: randomUUID(),
        categorization_source: 'manual',
        source_transaction_currency_id: testCurrencyId,
        transactions: [
          {
            fs_date: '2025-01-15',
            coa_id: testCoaIds.cash,
            source_currency_id: testCurrencyId,
            source_amount: -1000,
            description: 'Office supplies',
          },
          {
            fs_date: '2025-01-15',
            coa_id: testCoaIds.expense,
            source_currency_id: testCurrencyId,
            source_amount: 1000,
            description: 'Office supplies',
          },
        ],
      };

      const result = await createLedgerRecord({
        data,
        companyId: testCompanyId,
        userId: testUserId,
        trx,
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('ledgerTransactionId');
      expect(result.data).toHaveProperty('affectedCOAs', 2);

      // Verify database records
      const resultData = result.data as CreateLedgerRecordResult;
      const transaction = await trx('ledger_transactions')
        .where('id', resultData.ledgerTransactionId)
        .first();
      expect(transaction).toBeTruthy();
      expect(transaction.company_id).toBe(testCompanyId);

      const entries = await trx('ledger_entries').where(
        'ledger_transaction_id',
        resultData.ledgerTransactionId,
      );
      // .where('is_deleted', false);
      expect(entries).toHaveLength(2);
    });

    it('should create transaction with contact', async () => {
      const data: NewLedgerTransactionData = {
        transaction_date: '2025-01-15',
        transaction_source: 'manual_journal',
        source_transaction_id: randomUUID(),
        categorization_source: 'manual',
        source_transaction_currency_id: testCurrencyId,
        contact_id: testContactId,
        contact_type: 'vendor',
        transactions: [
          {
            fs_date: '2025-01-15',
            coa_id: testCoaIds.cash,
            source_currency_id: testCurrencyId,
            source_amount: -1000,
            description: 'Payment to vendor',
          },
          {
            fs_date: '2025-01-15',
            coa_id: testCoaIds.expense,
            source_currency_id: testCurrencyId,
            source_amount: 1000,
            description: 'Payment to vendor',
          },
        ],
      };

      const result = await createLedgerRecord({
        data,
        companyId: testCompanyId,
        userId: testUserId,
        trx,
      });

      expect(result.success).toBe(true);

      // Verify contact cascade to entries
      const resultData = result.data as CreateLedgerRecordResult;
      const entries = await trx('ledger_entries').where(
        'ledger_transaction_id',
        resultData.ledgerTransactionId,
      );
      // .where('is_deleted', false);

      expect(entries.every((e) => e.contact_id === testContactId)).toBe(true);
      expect(entries.every((e) => e.contact_type === 'vendor')).toBe(true);
    });

    it('should cascade contact from transaction to entries without contact', async () => {
      // Create a second contact for entry-level override (within transaction)
      const [entryContact] = await trx('contacts')
        .insert({
          company_id: testCompanyId,
          display_name: 'Entry Contact',
          normalized_name: 'entrycontact',
          created_by_id: testUserId,
          review_status: 'unreviewed',
        })
        .returning('*');

      const data: NewLedgerTransactionData = {
        transaction_date: '2025-01-15',
        transaction_source: 'manual_journal',
        source_transaction_id: randomUUID(),
        categorization_source: 'manual',
        source_transaction_currency_id: testCurrencyId,
        contact_id: testContactId, // Transaction-level contact
        contact_type: 'vendor',
        transactions: [
          {
            fs_date: '2025-01-15',
            coa_id: testCoaIds.cash,
            source_currency_id: testCurrencyId,
            source_amount: -1000,
            description: 'Payment',
            // No contact_id - should inherit from transaction
          },
          {
            fs_date: '2025-01-15',
            coa_id: testCoaIds.expense,
            source_currency_id: testCurrencyId,
            source_amount: 1000,
            description: 'Payment',
            contact_id: entryContact.id, // Entry-level contact - should override
            contact_type: 'customer',
          },
        ],
      };

      const result = await createLedgerRecord({
        data,
        companyId: testCompanyId,
        userId: testUserId,
        trx,
      });

      expect(result.success).toBe(true);

      // Verify contact cascade behavior
      const resultData = result.data as CreateLedgerRecordResult;
      const entries = await trx('ledger_entries')
        .where('ledger_transaction_id', resultData.ledgerTransactionId)
        // .where('is_deleted', false)
        .orderBy('coa_id');

      // First entry (cash) should have transaction contact (no entry contact provided)
      const cashEntry = entries.find((e) => e.coa_id === testCoaIds.cash);
      expect(cashEntry?.contact_id).toBe(testContactId);
      expect(cashEntry?.contact_type).toBe('vendor');

      // Second entry (expense) should have entry contact (overrides transaction contact)
      const expenseEntry = entries.find((e) => e.coa_id === testCoaIds.expense);
      expect(expenseEntry?.contact_id).toBe(entryContact.id);
      expect(expenseEntry?.contact_type).toBe('customer');
    });

    it('should create transaction with project on entry', async () => {
      const data: NewLedgerTransactionData = {
        transaction_date: '2025-01-15',
        transaction_source: 'manual_journal',
        source_transaction_id: randomUUID(),
        categorization_source: 'manual',
        source_transaction_currency_id: testCurrencyId,
        transactions: [
          {
            fs_date: '2025-01-15',
            coa_id: testCoaIds.cash,
            source_currency_id: testCurrencyId,
            source_amount: -1000,
            description: 'Project expense',
          },
          {
            fs_date: '2025-01-15',
            coa_id: testCoaIds.expense,
            source_currency_id: testCurrencyId,
            source_amount: 1000,
            description: 'Project expense',
            project_id: testProjectId,
          },
        ],
      };

      const result = await createLedgerRecord({
        data,
        companyId: testCompanyId,
        userId: testUserId,
        trx,
      });

      expect(result.success).toBe(true);

      const resultData = result.data as CreateLedgerRecordResult;
      const entries = await trx('ledger_entries').where(
        'ledger_transaction_id',
        resultData.ledgerTransactionId,
      );
      // .where('is_deleted', false);

      const projectEntry = entries.find((e) => e.coa_id === testCoaIds.expense);
      expect(projectEntry?.project_id).toBe(testProjectId);
    });

    it('should create bank transaction with bank leg', async () => {
      // Create bank transaction first (within transaction)
      const bankTxn = await createBankTransaction(-500, 'Bank payment');

      const data: NewLedgerTransactionData = {
        transaction_date: '2025-01-15',
        transaction_source: 'bank_transaction',
        categorization_source: 'ml',
        source_transaction_id: bankTxn.id,
        source_transaction_date: '2025-01-15',
        source_transaction_amount: -500,
        source_transaction_currency_id: testCurrencyId,
        transactions: [
          {
            fs_date: '2025-01-15',
            coa_id: testCoaIds.cash,
            source_currency_id: testCurrencyId,
            source_amount: -500,
            description: 'Bank payment',
            is_bank_leg: true,
          },
          {
            fs_date: '2025-01-15',
            coa_id: testCoaIds.expense,
            source_currency_id: testCurrencyId,
            source_amount: 500,
            description: 'Bank payment',
          },
        ],
      };

      const result = await createLedgerRecord({
        data,
        companyId: testCompanyId,
        userId: testUserId,
        trx,
      });

      expect(result.success).toBe(true);

      const resultData = result.data as CreateLedgerRecordResult;
      const entries = await trx('ledger_entries').where(
        'ledger_transaction_id',
        resultData.ledgerTransactionId,
      );
      // .where('is_deleted', false);

      const bankLeg = entries.find((e) => e.is_bank_leg);
      expect(bankLeg).toBeTruthy();
      expect(bankLeg?.coa_id).toBe(testCoaIds.cash);
    });

    it('should handle split entries (one bank leg, multiple categorizations)', async () => {
      const bankTxn = await createBankTransaction(-1500, 'Split payment');

      const data: NewLedgerTransactionData = {
        transaction_date: '2025-01-15',
        transaction_source: 'bank_transaction',
        categorization_source: 'manual',
        source_transaction_id: bankTxn.id,
        source_transaction_date: '2025-01-15',
        source_transaction_amount: -1500,
        source_transaction_currency_id: testCurrencyId,
        transactions: [
          {
            fs_date: '2025-01-15',
            coa_id: testCoaIds.cash,
            source_currency_id: testCurrencyId,
            source_amount: -1500,
            description: 'Split payment',
            is_bank_leg: true,
          },
          {
            fs_date: '2025-01-15',
            coa_id: testCoaIds.expense,
            source_currency_id: testCurrencyId,
            source_amount: 900,
            description: 'Office supplies portion',
          },
          {
            fs_date: '2025-01-15',
            coa_id: testCoaIds.expense,
            source_currency_id: testCurrencyId,
            source_amount: 600,
            description: 'Marketing materials portion',
          },
        ],
      };

      const result = await createLedgerRecord({
        data,
        companyId: testCompanyId,
        userId: testUserId,
        trx,
      });

      expect(result.success).toBe(true);

      const resultData = result.data as CreateLedgerRecordResult;
      const entries = await trx('ledger_entries').where(
        'ledger_transaction_id',
        resultData.ledgerTransactionId,
      );
      // .where('is_deleted', false);

      expect(entries).toHaveLength(3);
      expect(entries.filter((e) => e.is_bank_leg)).toHaveLength(1);
    });

    it('should handle FX transaction with custom exchange rate', async () => {
      // Get or create EUR currency (within transaction)
      let eurCurrency = await trx('currencies').where('code', 'EUR').first();

      if (!eurCurrency) {
        [eurCurrency] = await trx('currencies')
          .insert({
            code: 'EUR',
            name: 'Euro',
            symbol: '€',
          })
          .returning('*');
      }

      // Use existing COA from demo data (constraint validation doesn't use transaction context)
      // so we can't create a new COA within the test transaction
      const eurCashCoaId = testCoaIds.cash; // Use the existing cash COA

      // Create exchange rate for EUR to USD (within transaction)
      await trx('exchange_rates').insert({
        rate_date: '2025-01-15',
        base_currency_id: eurCurrency.id,
        price_currency_id: testCurrencyId,
        rate: 1.1, // System rate: 1 EUR = 1.10 USD
        source: 'manual',
      });

      const data: NewLedgerTransactionData = {
        transaction_date: '2025-01-15',
        transaction_source: 'manual_journal',
        source_transaction_id: randomUUID(),
        categorization_source: 'manual',
        source_transaction_currency_id: eurCurrency.id,
        transactions: [
          {
            fs_date: '2025-01-15',
            coa_id: eurCashCoaId,
            source_currency_id: eurCurrency.id,
            source_amount: -1000,
            description: 'EUR payment',
            custom_exchange_rate: 1.12, // Custom rate: 1 EUR = 1.12 USD
          },
          {
            fs_date: '2025-01-15',
            coa_id: testCoaIds.expense,
            source_currency_id: eurCurrency.id,
            source_amount: 1000,
            description: 'EUR expense',
            custom_exchange_rate: 1.12, // Same custom rate
          },
        ],
      };

      const result = await createLedgerRecord({
        data,
        companyId: testCompanyId,
        userId: testUserId,
        trx,
      });

      expect(result.success).toBe(true);

      // Verify entries were created with custom exchange rate
      const resultData = result.data as CreateLedgerRecordResult;
      const entries = await trx('ledger_entries').where(
        'ledger_transaction_id',
        resultData.ledgerTransactionId,
      );
      // .where('is_deleted', false);

      // Both entries should have the custom exchange rate applied
      entries.forEach((entry) => {
        // Database returns decimals as strings, parse and compare with tolerance
        expect(Number(entry.custom_exchange_rate)).toBeCloseTo(1.12, 2);
        // System rate should exist and be positive (exact value depends on exchange rate lookup)
        expect(Number(entry.system_exchange_rate)).toBeGreaterThan(0);
      });

      // Verify reporting currency amounts are calculated correctly
      // 1000 EUR * 1.12 = 1120 USD
      const expenseEntry = entries.find((e) => e.coa_id === testCoaIds.expense);
      expect(Number(expenseEntry?.amount)).toBeCloseTo(1120, 2); // Reporting currency amount
    });
  });

  describe('Validation Errors', () => {
    it('should fail with invalid Zod schema', async () => {
      const invalidData = {
        transaction_date: 'not-a-date',
        transaction_source: 'invalid_source',
        transactions: [],
      };

      // Zod validation happens before transaction, so it returns error response
      const result = await createLedgerRecord({
        data: invalidData as any,
        companyId: testCompanyId,
        userId: testUserId,
        trx,
      });

      expect(result.success).toBe(false);
      // Error structure may vary, just check that it failed
      expect(result.error).toBeDefined();
    });

    it('should fail with no entries', async () => {
      const data: NewLedgerTransactionData = {
        transaction_date: '2025-01-15',
        transaction_source: 'manual_journal',
        source_transaction_id: randomUUID(),
        categorization_source: 'manual',
        source_transaction_currency_id: testCurrencyId,
        transactions: [],
      };

      // Zod validation happens first and returns error response
      const result = await createLedgerRecord({
        data,
        companyId: testCompanyId,
        userId: testUserId,
        trx,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should fail when company not found', async () => {
      const data: NewLedgerTransactionData = {
        transaction_date: '2025-01-15',
        transaction_source: 'manual_journal',
        source_transaction_id: randomUUID(),
        categorization_source: 'manual',
        source_transaction_currency_id: testCurrencyId,
        transactions: [
          {
            fs_date: '2025-01-15',
            coa_id: testCoaIds.cash,
            source_currency_id: testCurrencyId,
            source_amount: -1000,
            description: 'Test',
          },
          {
            fs_date: '2025-01-15',
            coa_id: testCoaIds.expense,
            source_currency_id: testCurrencyId,
            source_amount: 1000,
            description: 'Test',
          },
        ],
      };

      // When trx is provided, errors are thrown as AppError, not returned
      // Use valid UUID format to avoid UUID parsing errors
      await expect(
        createLedgerRecord({
          data,
          companyId: '00000000-0000-0000-0000-000000000000', // Valid UUID but non-existent
          userId: testUserId,
          trx,
        }),
      ).rejects.toThrow(
        /Company not found|Failed to create ledger transaction/,
      );
    });

    it('should fail with invalid contact ID', async () => {
      const data: NewLedgerTransactionData = {
        transaction_date: '2025-01-15',
        transaction_source: 'manual_journal',
        source_transaction_id: randomUUID(),
        categorization_source: 'manual',
        source_transaction_currency_id: testCurrencyId,
        contact_id: '00000000-0000-0000-0000-000000000000', // Valid UUID format but non-existent
        transactions: [
          {
            fs_date: '2025-01-15',
            coa_id: testCoaIds.cash,
            source_currency_id: testCurrencyId,
            source_amount: -1000,
            description: 'Test',
          },
          {
            fs_date: '2025-01-15',
            coa_id: testCoaIds.expense,
            source_currency_id: testCurrencyId,
            source_amount: 1000,
            description: 'Test',
          },
        ],
      };

      // When trx is provided, errors are thrown as AppError, not returned
      await expect(
        createLedgerRecord({
          data,
          companyId: testCompanyId,
          userId: testUserId,
          trx,
        }),
      ).rejects.toThrow('Invalid contacts IDs');
    });

    it('should fail with invalid project ID', async () => {
      const data: NewLedgerTransactionData = {
        transaction_date: '2025-01-15',
        transaction_source: 'manual_journal',
        source_transaction_id: randomUUID(),
        categorization_source: 'manual',
        source_transaction_currency_id: testCurrencyId,
        transactions: [
          {
            fs_date: '2025-01-15',
            coa_id: testCoaIds.cash,
            source_currency_id: testCurrencyId,
            source_amount: -1000,
            description: 'Test',
          },
          {
            fs_date: '2025-01-15',
            coa_id: testCoaIds.expense,
            source_currency_id: testCurrencyId,
            source_amount: 1000,
            description: 'Test',
            project_id: '00000000-0000-0000-0000-000000000000', // Valid UUID format but non-existent
          },
        ],
      };

      // When trx is provided, errors are thrown as AppError, not returned
      await expect(
        createLedgerRecord({
          data,
          companyId: testCompanyId,
          userId: testUserId,
          trx,
        }),
      ).rejects.toThrow('Invalid projects IDs');
    });

    it('should fail when entries do not sum to zero', async () => {
      const data: NewLedgerTransactionData = {
        transaction_date: '2025-01-15',
        transaction_source: 'manual_journal',
        source_transaction_id: randomUUID(),
        categorization_source: 'manual',
        source_transaction_currency_id: testCurrencyId,
        transactions: [
          {
            fs_date: '2025-01-15',
            coa_id: testCoaIds.cash,
            source_currency_id: testCurrencyId,
            source_amount: -1000,
            description: 'Test',
          },
          {
            fs_date: '2025-01-15',
            coa_id: testCoaIds.expense,
            source_currency_id: testCurrencyId,
            source_amount: 900, // Should be 1000
            description: 'Test',
          },
        ],
      };

      // When trx is provided, errors are thrown as AppError, not returned
      await expect(
        createLedgerRecord({
          data,
          companyId: testCompanyId,
          userId: testUserId,
          trx,
        }),
      ).rejects.toThrow('must be zero');
    });

    it('should fail when bank leg amount does not match bank transaction', async () => {
      const bankTxn = await createBankTransaction(-1000, 'Bank payment');

      const data: NewLedgerTransactionData = {
        transaction_date: '2025-01-15',
        transaction_source: 'bank_transaction',
        categorization_source: 'ml',
        source_transaction_id: bankTxn.id,
        source_transaction_date: '2025-01-15',
        source_transaction_amount: -1000,
        source_transaction_currency_id: testCurrencyId,
        transactions: [
          {
            fs_date: '2025-01-15',
            coa_id: testCoaIds.cash,
            source_currency_id: testCurrencyId,
            source_amount: -500, // Should be -1000
            description: 'Bank payment',
            is_bank_leg: true,
          },
          {
            fs_date: '2025-01-15',
            coa_id: testCoaIds.expense,
            source_currency_id: testCurrencyId,
            source_amount: 500,
            description: 'Bank payment',
          },
        ],
      };

      // When trx is provided, errors are thrown as AppError, not returned
      await expect(
        createLedgerRecord({
          data,
          companyId: testCompanyId,
          userId: testUserId,
          trx,
        }),
      ).rejects.toThrow('does not match');
    });

    it('should fail when bank transaction already categorized (idempotency)', async () => {
      const bankTxn = await createBankTransaction(-500, 'Bank payment');

      const data: NewLedgerTransactionData = {
        transaction_date: '2025-01-15',
        transaction_source: 'bank_transaction',
        categorization_source: 'ml',
        source_transaction_id: bankTxn.id,
        source_transaction_date: '2025-01-15',
        source_transaction_amount: -500,
        source_transaction_currency_id: testCurrencyId,
        transactions: [
          {
            fs_date: '2025-01-15',
            coa_id: testCoaIds.cash,
            source_currency_id: testCurrencyId,
            source_amount: -500,
            description: 'Bank payment',
            is_bank_leg: true,
          },
          {
            fs_date: '2025-01-15',
            coa_id: testCoaIds.expense,
            source_currency_id: testCurrencyId,
            source_amount: 500,
            description: 'Bank payment',
          },
        ],
      };

      // Create first time (should succeed)
      const result1 = await createLedgerRecord({
        data,
        companyId: testCompanyId,
        userId: testUserId,
        trx,
      });
      expect(result1.success).toBe(true);

      // Create second time (should fail) - when trx is provided, errors are thrown
      await expect(
        createLedgerRecord({
          data,
          companyId: testCompanyId,
          userId: testUserId,
          trx,
        }),
      ).rejects.toThrow('already exists');
    });

    it('should fail when bank leg COA does not match bank account COA', async () => {
      const bankTxn = await createBankTransaction(-500, 'Bank payment');

      const data: NewLedgerTransactionData = {
        transaction_date: '2025-01-15',
        transaction_source: 'bank_transaction',
        categorization_source: 'ml',
        source_transaction_id: bankTxn.id,
        source_transaction_date: '2025-01-15',
        source_transaction_amount: -500,
        source_transaction_currency_id: testCurrencyId,
        transactions: [
          {
            fs_date: '2025-01-15',
            coa_id: testCoaIds.expense, // Wrong COA!
            source_currency_id: testCurrencyId,
            source_amount: -500,
            description: 'Bank payment',
            is_bank_leg: true,
          },
          {
            fs_date: '2025-01-15',
            coa_id: testCoaIds.expense,
            source_currency_id: testCurrencyId,
            source_amount: 500,
            description: 'Bank payment',
          },
        ],
      };

      // When trx is provided, errors are thrown as AppError, not returned
      await expect(
        createLedgerRecord({
          data,
          companyId: testCompanyId,
          userId: testUserId,
          trx,
        }),
      ).rejects.toThrow('COA');
    });

    it('should fail when bank transaction has no bank leg', async () => {
      const bankTxn = await createBankTransaction(-500, 'Bank payment');

      const data: NewLedgerTransactionData = {
        transaction_date: '2025-01-15',
        transaction_source: 'bank_transaction',
        categorization_source: 'ml',
        source_transaction_id: bankTxn.id,
        source_transaction_date: '2025-01-15',
        source_transaction_amount: -500,
        source_transaction_currency_id: testCurrencyId,
        transactions: [
          {
            fs_date: '2025-01-15',
            coa_id: testCoaIds.cash,
            source_currency_id: testCurrencyId,
            source_amount: -500,
            description: 'Bank payment',
            // Missing is_bank_leg: true
          },
          {
            fs_date: '2025-01-15',
            coa_id: testCoaIds.expense,
            source_currency_id: testCurrencyId,
            source_amount: 500,
            description: 'Bank payment',
          },
        ],
      };

      // When trx is provided, errors are thrown as AppError, not returned
      await expect(
        createLedgerRecord({
          data,
          companyId: testCompanyId,
          userId: testUserId,
          trx,
        }),
      ).rejects.toThrow('exactly one bank leg');
    });

    it('should fail when manual journal has bank leg', async () => {
      const data: NewLedgerTransactionData = {
        transaction_date: '2025-01-15',
        transaction_source: 'manual_journal',
        source_transaction_id: randomUUID(),
        categorization_source: 'manual',
        source_transaction_currency_id: testCurrencyId,
        transactions: [
          {
            fs_date: '2025-01-15',
            coa_id: testCoaIds.cash,
            source_currency_id: testCurrencyId,
            source_amount: -500,
            description: 'Payment',
            is_bank_leg: true, // Should not have bank leg
          },
          {
            fs_date: '2025-01-15',
            coa_id: testCoaIds.expense,
            source_currency_id: testCurrencyId,
            source_amount: 500,
            description: 'Payment',
          },
        ],
      };

      // When trx is provided, errors are thrown as AppError, not returned
      await expect(
        createLedgerRecord({
          data,
          companyId: testCompanyId,
          userId: testUserId,
          trx,
        }),
      ).rejects.toThrow('only allowed for bank transactions');
    });
  });

  describe('FX Warnings', () => {
    it('should warn for suspiciously large exchange rate', async () => {
      // Get or create NGN currency (within transaction)
      let ngnCurrency = await trx('currencies').where('code', 'NGN').first();

      if (!ngnCurrency) {
        [ngnCurrency] = await trx('currencies')
          .insert({
            code: 'NGN',
            name: 'Nigerian Naira',
            symbol: '₦',
          })
          .returning('*');
      }

      // Mock exchange rate (15000 NGN to 1 USD) (within transaction)
      await trx('exchange_rates').insert({
        base_currency_id: ngnCurrency.id,
        price_currency_id: testCurrencyId,
        rate_date: '2025-01-15',
        rate: 15000,
        source: 'manual',
      });

      const data: NewLedgerTransactionData = {
        transaction_date: '2025-01-15',
        transaction_source: 'manual_journal',
        source_transaction_id: randomUUID(),
        categorization_source: 'manual',
        source_transaction_currency_id: ngnCurrency.id,
        transactions: [
          {
            fs_date: '2025-01-15',
            coa_id: testCoaIds.cash,
            source_currency_id: ngnCurrency.id,
            source_amount: -1000,
            description: 'Test',
            custom_exchange_rate: 15000, // Suspiciously large custom rate
          },
          {
            fs_date: '2025-01-15',
            coa_id: testCoaIds.expense,
            source_currency_id: ngnCurrency.id,
            source_amount: 1000,
            description: 'Test',
            custom_exchange_rate: 15000, // Suspiciously large custom rate
          },
        ],
      };

      const result = await createLedgerRecord({
        data,
        companyId: testCompanyId,
        userId: testUserId,
        trx,
      });

      expect(result.success).toBe(true);
      const resultData = result.data as CreateLedgerRecordResult;
      // fxWarnings is a string (joined with ', '), not an array
      expect(resultData.warnings?.fxWarnings).toBeDefined();
      expect(resultData.warnings?.fxWarnings).toContain(
        'Suspiciously large FX rate',
      );
    });

    it('should return warnings in response data structure', async () => {
      // Get or create EUR currency (within transaction)
      let eurCurrency = await trx('currencies').where('code', 'EUR').first();

      if (!eurCurrency) {
        [eurCurrency] = await trx('currencies')
          .insert({
            code: 'EUR',
            name: 'Euro',
            symbol: '€',
          })
          .returning('*');
      }

      // Create exchange rate (within transaction)
      await trx('exchange_rates').insert({
        base_currency_id: eurCurrency.id,
        price_currency_id: testCurrencyId,
        rate_date: '2025-01-15',
        rate: 1.1,
        source: 'manual',
      });

      const data: NewLedgerTransactionData = {
        transaction_date: '2025-01-15',
        transaction_source: 'manual_journal',
        source_transaction_id: randomUUID(),
        categorization_source: 'manual',
        source_transaction_currency_id: eurCurrency.id,
        transactions: [
          {
            fs_date: '2025-01-15',
            coa_id: testCoaIds.cash,
            source_currency_id: eurCurrency.id,
            source_amount: -1000,
            description: 'Test',
            custom_exchange_rate: 15000, // Suspiciously large custom rate
          },
          {
            fs_date: '2025-01-15',
            coa_id: testCoaIds.expense,
            source_currency_id: eurCurrency.id,
            source_amount: 1000,
            description: 'Test',
            custom_exchange_rate: 15000,
          },
        ],
      };

      const result = await createLedgerRecord({
        data,
        companyId: testCompanyId,
        userId: testUserId,
        trx,
      });

      expect(result.success).toBe(true);
      // Verify warnings object exists in response
      const resultData = result.data as CreateLedgerRecordResult;
      expect(resultData.warnings).toBeDefined();
      expect(typeof resultData.warnings).toBe('object');
      // Verify FX warnings are present
      expect(resultData.warnings?.fxWarnings).toBeDefined();
      expect(resultData.warnings?.fxWarnings).toContain('large');
    });
  });
});
