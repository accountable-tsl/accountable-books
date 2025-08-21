import type { Knex } from 'knex';
import type { SeedStep, SeedContext, MarkFunction } from '../utils/types.js';
import { upsertByKey } from '../utils/step-runner.js';
import { getCountryData } from '../data/countries/index.js';
import { getCompanyTypeData } from '../data/companies/index.js';

export const journalsStep: SeedStep = {
  id: 'journals',
  name: 'Journal Entries',
  version: 1,
  description: 'Creates demo journal entries and ledger transactions',
  dependencies: ['companies', 'bank-accounts', 'contacts', 'transactions'],

  async up(knex: Knex, ctx: SeedContext, mark: MarkFunction): Promise<void> {
    if (!ctx.companyId) {
      throw new Error('Company ID not found in context. Run companies step first.');
    }

    const countryData = getCountryData(ctx.country!);
    const companyTypeData = getCompanyTypeData(ctx.companyType!);

    // Get company record
    const company = await knex('companies').where('id', ctx.companyId).first();
    if (!company) {
      throw new Error(`Company with ID ${ctx.companyId} not found`);
    }

    // Get bank transactions to create journal entries for
    const bankTransactions = await knex('bank_transactions')
      .where('company_id', ctx.companyId)
      .limit(20); // Sample for demo

    if (bankTransactions.length === 0) {
      console.log('⏭️ No bank transactions found, skipping journal entries');
      return;
    }

    // Get chart of accounts for company
    const coaAccounts = await knex('coa')
      .where('company_id', ctx.companyId)
      .where('is_active', true);

    if (coaAccounts.length === 0) {
      console.log('⚠️ No chart of accounts found, creating basic accounts');

      // Create basic accounts needed for journals
      const basicAccounts = [
        { code: '1010', name: 'Cash in Bank', type: 'asset', level: 2 },
        { code: '4000', name: 'Revenue', type: 'revenue', level: 2 },
        { code: '5000', name: 'Operating Expenses', type: 'expense', level: 2 },
        { code: '2000', name: 'Accounts Payable', type: 'liability', level: 2 },
      ];

      for (const account of basicAccounts) {
        const [coaAccount] = await upsertByKey(knex, 'coa', ['company_id', 'code'], {
          company_id: ctx.companyId,
          code: account.code,
          name: account.name,
          type: account.type,
          level: account.level,
          is_active: true,
          is_demo_account: true,
          created_at: new Date(),
          updated_at: new Date(),
        });

        await mark('coa', { id: coaAccount.id, company_id: ctx.companyId });
      }

      // Refresh COA accounts
      const refreshedAccounts = await knex('coa')
        .where('company_id', ctx.companyId)
        .where('is_active', true);
      coaAccounts.push(...refreshedAccounts);
    }

    // Generate journal entries data
    const journalsGenerator = companyTypeData.generators.journals;
    const journalsData = journalsGenerator.generate(ctx);

    for (const journalData of journalsData) {
      // Create journal batch
      const [batch] = await upsertByKey(knex, 'journal_batches', ['company_id', 'batch_name'], {
        company_id: ctx.companyId,
        batch_name: journalData.batchName,
        description: journalData.description,
        posting_date: journalData.postingDate,
        status: 'posted',
        total_entries: journalData.entries.length,
        is_demo_batch: true,
        created_at: new Date(),
        updated_at: new Date(),
      });

      await mark('journal_batches', { id: batch.id, company_id: ctx.companyId });

      // Create journal entries
      for (const entryData of journalData.entries) {
        const [entry] = await upsertByKey(
          knex,
          'journal_entries',
          ['company_id', 'batch_id', 'entry_number'],
          {
            company_id: ctx.companyId,
            batch_id: batch.id,
            entry_number: entryData.entryNumber,
            description: entryData.description,
            reference: entryData.reference,
            posting_date: entryData.postingDate,
            total_debits: entryData.totalDebits,
            total_credits: entryData.totalCredits,
            is_demo_entry: true,
            created_at: new Date(),
            updated_at: new Date(),
          },
        );

        await mark('journal_entries', { id: entry.id, company_id: ctx.companyId });

        // Create ledger transactions
        for (const txnData of entryData.transactions) {
          // Find appropriate COA account
          const coaAccount =
            coaAccounts.find(
              (acc) =>
                acc.type === txnData.accountType ||
                acc.name.toLowerCase().includes(txnData.accountHint?.toLowerCase() || ''),
            ) || coaAccounts[0]; // Fallback to first account

          const [ledgerTxn] = await upsertByKey(
            knex,
            'ledger_transactions',
            ['company_id', 'journal_entry_id', 'coa_id', 'debit_amount', 'credit_amount'],
            {
              company_id: ctx.companyId,
              journal_entry_id: entry.id,
              coa_id: coaAccount.id,
              description: txnData.description,
              debit_amount: txnData.debitAmount || 0,
              credit_amount: txnData.creditAmount || 0,
              posting_date: entry.posting_date,
              is_demo_transaction: true,
              created_at: new Date(),
              updated_at: new Date(),
            },
          );

          await mark('ledger_transactions', { id: ledgerTxn.id, company_id: ctx.companyId });
        }
      }

      console.log(
        `✓ Created journal batch: ${batch.batch_name} with ${journalData.entries.length} entries`,
      );
    }
  },

  async down(knex: Knex, ctx: SeedContext): Promise<void> {
    // Deletion handled by generic artifact system
    console.log('Journals step cleanup handled by artifact system');
  },
};
