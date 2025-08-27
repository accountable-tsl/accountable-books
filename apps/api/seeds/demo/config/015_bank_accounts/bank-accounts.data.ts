import type { Knex } from 'knex';
import {
  COUNTRY_CODES,
  COMPANY_TYPES,
  DemoCompanyType,
  DemoCountryCode,
  DemoFilter,
} from '../../shared/config.js';
import { getDemoCompanies } from '../../shared/utils.js';
import { generateDemoCompaniesMap } from '../002_companies/companies.data.js';

type BankAccountType =
  | 'other'
  | 'credit_card'
  | 'debit_card'
  | 'savings'
  | 'checkings_current'
  | 'utility';

type BusinessOrPersonal = 'business' | 'personal';

export type RawBankAccount = {
  id?: string;
  displayName: string;
  accountName: string | null;
  accountType: BankAccountType;
  accountNumber: string;
  businessOrPersonal: BusinessOrPersonal;
  bankKey: string;
  companyId: string;
  currencyCode: string;
  createdByEmail: string;
};

// Single generic type for bank account mapping
export type CompanyBankAccountsMap<T = RawBankAccount> = {
  company: {
    id: string;
    shortCode: string;
    companyType: DemoCompanyType;
  };
  user: {
    id: string;
  };
  country: {
    code: DemoCountryCode;
  };
  currencyCode: string;
  bankAccounts: T[];
};

const US_BANK_KEYS = [
  'us_chase_bank',
  'us_bank_of_america',
  'us_wells_fargo',
  'us_citibank',
  'us_capital_one',
];

const NG_BANK_KEYS = [
  'ng_gtbank',
  'ng_zenith_bank',
  'ng_uba',
  'ng_access_bank',
  'ng_citibank_nigeria',
  'ng_ecobank_nigeria',
  'ng_wema_bank',
  'ng_moniepoint',
  'ng_first_bank_of_nigeria',
  'ng_first_city_monument_ba',
];

const generateAccountNumber = (
  accountType: BankAccountType,
  countryCode: DemoCountryCode,
): string => {
  if (accountType === 'credit_card') {
    // Generate 16-digit credit card number
    const prefix = countryCode === 'US' ? '4' : '5'; // Visa for US, Mastercard for NG
    const remaining = Array.from({ length: 15 }, () => Math.floor(Math.random() * 10)).join('');
    return prefix + remaining;
  }

  if (countryCode === 'US') {
    // US bank accounts: 8-17 digits, commonly 10-12
    const length = Math.floor(Math.random() * 3) + 10; // 10-12 digits
    return Array.from({ length }, () => Math.floor(Math.random() * 10)).join('');
  } else {
    // Nigeria bank accounts: exactly 10 digits
    return Array.from({ length: 10 }, () => Math.floor(Math.random() * 10)).join('');
  }
};

const getRandomBankKey = (countryCode: DemoCountryCode): string => {
  const banks = countryCode === COUNTRY_CODES.US ? US_BANK_KEYS : NG_BANK_KEYS;
  return banks[Math.floor(Math.random() * banks.length)];
};

const getBankAccountsForCompanyType = (
  companyType: DemoCompanyType,
  countryCode: DemoCountryCode,
  companyId: string,
  createdByEmail: string,
  currencyCode: string,
): RawBankAccount[] => {
  const businessOrPersonal: BusinessOrPersonal =
    companyType === COMPANY_TYPES.INDIVIDUAL ? 'personal' : 'business';

  const accounts: RawBankAccount[] = [];

  switch (companyType) {
    case COMPANY_TYPES.INDIVIDUAL:
      accounts.push(
        {
          displayName: 'Primary Checking',
          accountName: 'Personal Checking Account',
          accountType: 'checkings_current',
          accountNumber: generateAccountNumber('checkings_current', countryCode),
          businessOrPersonal,
          bankKey: getRandomBankKey(countryCode),
          companyId,
          currencyCode,
          createdByEmail,
        },
        {
          displayName: 'Savings Account',
          accountName: 'Personal Savings Account',
          accountType: 'savings',
          accountNumber: generateAccountNumber('savings', countryCode),
          businessOrPersonal,
          bankKey: getRandomBankKey(countryCode),
          companyId,
          currencyCode,
          createdByEmail,
        },
      );
      break;

    case COMPANY_TYPES.BUSINESS:
      accounts.push(
        {
          displayName: 'Business Checking',
          accountName: 'Business Operating Account',
          accountType: 'checkings_current',
          accountNumber: generateAccountNumber('checkings_current', countryCode),
          businessOrPersonal,
          bankKey: getRandomBankKey(countryCode),
          companyId,
          currencyCode,
          createdByEmail,
        },
        {
          displayName: 'Business Credit Card',
          accountName: 'Business Credit Line',
          accountType: 'credit_card',
          accountNumber: generateAccountNumber('credit_card', countryCode),
          businessOrPersonal,
          bankKey: getRandomBankKey(countryCode),
          companyId,
          currencyCode,
          createdByEmail,
        },
        {
          displayName: 'Business Savings',
          accountName: 'Business Savings Account',
          accountType: 'savings',
          accountNumber: generateAccountNumber('savings', countryCode),
          businessOrPersonal,
          bankKey: getRandomBankKey(countryCode),
          companyId,
          currencyCode,
          createdByEmail,
        },
      );
      break;

    case COMPANY_TYPES.ACCOUNTING_FIRM:
      accounts.push(
        {
          displayName: 'Operating Account',
          accountName: 'Professional Services Operating Account',
          accountType: 'checkings_current',
          accountNumber: generateAccountNumber('checkings_current', countryCode),
          businessOrPersonal,
          bankKey: getRandomBankKey(countryCode),
          companyId,
          currencyCode,
          createdByEmail,
        },
        {
          displayName: 'Credit Line',
          accountName: 'Professional Services Credit Line',
          accountType: 'credit_card',
          accountNumber: generateAccountNumber('credit_card', countryCode),
          businessOrPersonal,
          bankKey: getRandomBankKey(countryCode),
          companyId,
          currencyCode,
          createdByEmail,
        },
      );
      break;
  }

  return accounts;
};

export const getRawBankAccountsForInsertion = async (
  trx: Knex,
  filters?: DemoFilter,
): Promise<CompanyBankAccountsMap[]> => {
  const companies = await getDemoCompanies(trx, filters);
  const companiesMap = generateDemoCompaniesMap(filters);

  return companies.map((company) => {
    const companyMapData = companiesMap.find((c) => c.company.shortCode === company.short_code);
    if (!companyMapData) {
      throw new Error(`Company map data not found for ${company.short_code}`);
    }

    return {
      company: {
        id: company.id,
        shortCode: company.short_code,
        companyType: companyMapData.company.companyType,
      },
      user: companyMapData.user,
      country: companyMapData.country,
      currencyCode: companyMapData.currency.code,
      bankAccounts: getBankAccountsForCompanyType(
        companyMapData.company.companyType,
        companyMapData.country.code,
        company.id,
        companyMapData.user.email,
        companyMapData.currency.code,
      ),
    };
  });
};
