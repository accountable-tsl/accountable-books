import type { Knex } from 'knex';
import { createNewBankAccount } from '../../../src/domains/bankAccounts/bankAccounts.model.js';
import { coaSource } from '../../../src/domains/chartOfAccounts/coa.types.js';
import { bankAccountType } from '../../../src/domains/bankAccounts/bankAccounts.types.js';
import { faker } from '@faker-js/faker';
import type { MarkFn, SeedCtx } from '../old_engine/helpers.js';
import banks from '../../../migrations/data/banks.json' with { type: 'json' };
import countries from '../../../migrations/data/countries.json' with { type: 'json' };
import currencies from '../../../migrations/data/currencies.json' with { type: 'json' };

const banksInSystem = banks;
const countriesInSystem = countries;
const currenciesInSystem = currencies;

export async function up(knex: Knex, ctx: SeedCtx, mark: MarkFn) {
  const { companyShortCode, userEmail, reportingCurrencyId, countryId } = ctx;

  const company = await knex('companies')
    .select('id')
    .where({ short_code: companyShortCode })
    .first();
  const user = await knex('users').select('id').where({ email: userEmail }).first();
  if (!company?.id || !user?.id)
    throw new Error('Company or user not found for bank-accounts step');

  const inputs = generateDemoBankAccounts({ currency: reportingCurrencyId, country: countryId });

  for (const data of inputs) {
    const res = await createNewBankAccount({ companyId: company.id, userId: user.id, data });
    if (res.success && res.data)
      await mark('bank_accounts', { id: res.data.id, company_id: company.id }, res.data);
    // if failure due to duplicates, continue; otherwise throw
  }
}

function generateDemoBankAccounts({ currency, country }: { currency: string; country: string }) {
  const resolvedCurrency = currenciesInSystem.find((c) => c.id === currency);
  const resolvedCountry = countriesInSystem.find((c) => c.id === country);
  if (!resolvedCurrency) throw new Error(`Currency not found: ${currency}`);
  if (!resolvedCountry) throw new Error(`Country not found: ${country}`);

  const namePool = [
    'Main Account',
    'Operating Account',
    'Reserve Fund',
    'Online Sales',
    'Salary Account',
    'Tax Reserve',
  ];

  const shuffledNames = faker.helpers.shuffle(namePool).slice(0, 3);
  const localBanks = banksInSystem.filter((b) => b.country === resolvedCountry.code);
  if (localBanks.length === 0)
    throw new Error(`No banks found for country: ${resolvedCountry.name}`);

  const localBank1 = faker.helpers.arrayElement(localBanks);
  const localBank2 = faker.helpers.arrayElement(
    localBanks.filter((b) => b.id !== localBank1.id).length
      ? localBanks.filter((b) => b.id !== localBank1.id)
      : localBanks,
  );

  return [
    {
      displayName: shuffledNames[0],
      accountType: faker.helpers.arrayElement(bankAccountType.options),
      accountNumber: faker.finance.accountNumber(10),
      bankId: localBank1.id,
      currencyId: resolvedCurrency.id,
      source: coaSource.enum.system,
    },
    {
      displayName: shuffledNames[1],
      accountType: faker.helpers.arrayElement(bankAccountType.options),
      accountNumber: faker.finance.accountNumber(10),
      bankId: localBank2.id,
      currencyId: resolvedCurrency.id,
      source: coaSource.enum.system,
    },
  ];
}
