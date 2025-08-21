import type { Knex } from 'knex';
import type { SeedStep, SeedContext, MarkFunction } from '../utils/types.js';
import { upsertByKey } from '../utils/step-runner.js';
import { getCountryData } from '../data/countries/index.js';
import { getCompanyTypeData } from '../data/companies/index.js';

export const bankAccountsStep: SeedStep = {
  id: 'bank-accounts',
  name: 'Bank Accounts',
  version: 1,
  description: 'Creates demo bank accounts for companies',
  dependencies: ['companies'],

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

    // Generate bank account data
    const bankAccountGenerator = companyTypeData.generators.bankAccounts;
    const bankAccountsData = bankAccountGenerator.generate(ctx);

    for (const accountData of bankAccountsData) {
      // Create bank account
      const [bankAccount] = await upsertByKey(
        knex,
        'bank_accounts',
        ['company_id', 'account_number'],
        {
          company_id: ctx.companyId,
          account_name: accountData.accountName,
          account_number: accountData.accountNumber,
          routing_code: accountData.routingCode,
          account_type: accountData.accountType,
          currency_id: company.reporting_currency_id,
          current_balance: accountData.currentBalance,
          available_balance: accountData.availableBalance,
          is_active: true,
          is_demo_account: true,
          bank_name: accountData.bankName,
          bank_code: accountData.bankCode,
          created_at: new Date(),
          updated_at: new Date(),
        },
      );

      await mark('bank_accounts', { id: bankAccount.id, company_id: ctx.companyId });

      console.log(
        `✓ Created bank account: ${bankAccount.account_name} (${bankAccount.account_number})`,
      );
    }
  },

  async down(knex: Knex, ctx: SeedContext): Promise<void> {
    // Deletion handled by generic artifact system
    console.log('Bank accounts step cleanup handled by artifact system');
  },
};
