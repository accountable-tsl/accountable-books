import type { Knex } from 'knex';
import type { SeedStep, SeedContext, MarkFunction } from '../utils/types.js';
import { upsertByKey } from '../utils/step-runner.js';
import { getCountryData } from '../data/countries/index.js';
import { getCompanyTypeData } from '../data/companies/index.js';

export const transactionsStep: SeedStep = {
  id: 'transactions',
  name: 'Bank Transactions',
  version: 1,
  description: 'Creates demo bank transactions and categorization',
  dependencies: ['companies', 'bank-accounts', 'contacts'],

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

    // Get bank accounts for this company
    const bankAccounts = await knex('bank_accounts')
      .where('company_id', ctx.companyId)
      .where('is_active', true);

    if (bankAccounts.length === 0) {
      throw new Error('No bank accounts found. Run bank-accounts step first.');
    }

    // Get contacts for transaction references
    const contacts = await knex('contacts').where('company_id', ctx.companyId);

    // Generate transactions data
    const transactionsGenerator = companyTypeData.generators.transactions;
    const transactionsData = transactionsGenerator.generate(ctx);

    // Create transaction batch
    const [batch] = await upsertByKey(
      knex,
      'bank_transaction_batches',
      ['company_id', 'batch_name'],
      {
        company_id: ctx.companyId,
        batch_name: `Demo Data - ${ctx.companyShortCode}`,
        source: 'demo_seed',
        status: 'processed',
        total_transactions: transactionsData.length,
        processed_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      },
    );

    await mark('bank_transaction_batches', { id: batch.id, company_id: ctx.companyId });

    // Create transactions
    for (const [index, txnData] of transactionsData.entries()) {
      // Select random bank account
      const bankAccount = bankAccounts[Math.floor(Math.random() * bankAccounts.length)];

      // Select random contact if applicable
      const contact =
        txnData.contactRef && contacts.length > 0
          ? contacts[Math.floor(Math.random() * contacts.length)]
          : null;

      // Create bank transaction
      const [transaction] = await upsertByKey(
        knex,
        'bank_transactions',
        ['bank_account_id', 'transaction_date', 'amount', 'description'],
        {
          company_id: ctx.companyId,
          bank_account_id: bankAccount.id,
          batch_id: batch.id,
          transaction_date: txnData.date,
          amount: txnData.amount,
          description: txnData.description,
          reference: txnData.reference,
          transaction_type: txnData.type,
          balance_after: txnData.balanceAfter,
          contact_id: contact?.id,
          category: txnData.category,
          is_demo_transaction: true,
          external_id: `demo_${ctx.companyShortCode}_${index}`,
          created_at: new Date(),
          updated_at: new Date(),
        },
      );

      await mark('bank_transactions', { id: transaction.id, company_id: ctx.companyId });
    }

    console.log(`✓ Created ${transactionsData.length} transactions in batch: ${batch.batch_name}`);
  },

  async down(knex: Knex, ctx: SeedContext): Promise<void> {
    // Deletion handled by generic artifact system
    console.log('Transactions step cleanup handled by artifact system');
  },
};
