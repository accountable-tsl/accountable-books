import { fakerEN_NG as fakerNG, fakerEN_US as fakerUS } from '@faker-js/faker';
import type { DemoCompanyType, DemoCountryCode } from '../../shared/config.js';

export const BUSINESS = [
  { payee: 'Stripe', description: 'Stripe payout' },
  { payee: 'AWS', description: 'Cloud hosting' },
  { payee: 'Zapier', description: 'Automation platform' },
  { payee: 'Gusto', description: 'Payroll run' },
  { payee: 'Zoom', description: 'Meetings subscription' },
  { payee: 'Google Ads', description: 'Ad spend' },
  { payee: 'Delta Air Lines', description: 'Team travel' },
  { payee: 'Operating Savings Sweep', description: 'Monthly sweep to savings' },

  { payee: 'Flutterwave', description: 'Settlement payout' },
  { payee: 'Paystack', description: 'Card settlement' },
  { payee: 'GTBank', description: 'Account maintenance fees' },
  { payee: 'Whogohost', description: 'Hosting and domains' },
  { payee: 'Diesel Supplier', description: 'Generator diesel' },
  { payee: 'Salary Payments', description: 'Monthly payroll' },
  { payee: 'Jumia', description: 'Supplies and equipment' },
];
export const INDIVIDUAL = [
  { payee: 'ACME Payroll', description: 'Direct deposit' },
  { payee: 'Rent Payment', description: 'Monthly rent' },
  { payee: 'Johns Groceries', description: 'Groceries and household' },
  { payee: 'T-Mobile', description: 'Mobile phone' },
  { payee: 'Spotify', description: 'Streaming subscription' },
  { payee: 'Netflix', description: 'Streaming subscription' },
  { payee: 'Savings Transfer', description: 'Transfer to savings' },

  { payee: 'Employer Payroll', description: 'Monthly salary' },
  { payee: 'MTN Nigeria', description: 'Airtime and data' },
  { payee: 'Ikeja Electric', description: 'Electricity tokens' },
  { payee: 'PiggyVest', description: 'Transfer to savings' },
  { payee: 'Market Groceries', description: 'Weekly market run' },
];

export const FIRM = [
  {
    payee: 'Client Retainer - Northwind',
    description: 'Monthly advisory retainer',
  },
  { payee: 'Client Retainer - Contoso', description: 'Bookkeeping retainer' },
  { payee: 'QuickBooks', description: 'Firm software' },
  { payee: 'Xero', description: 'Client subscription pool' },
  { payee: 'Gusto', description: 'Payroll and contractor payouts' },
  { payee: 'Bench', description: 'White-label bookkeeping' },
  { payee: 'Office Lease LLC', description: 'Office rent' },

  { payee: 'Client Retainer - Lekki Stores', description: 'Monthly retainer' },
  {
    payee: 'Client Retainer - Mainland Foods',
    description: 'Bookkeeping retainer',
  },
  { payee: 'Paystack', description: 'Collection fees' },
  { payee: 'FIRS', description: 'Tax filing fees' },
  { payee: 'Mono', description: 'Bank data APIs' },
];

const PAIRED: Record<
  DemoCompanyType,
  Array<{ payee: string; description: string }>
> = {
  business: BUSINESS,
  individual: INDIVIDUAL,
  accounting_firm: FIRM,
};
const SEED_BASE: Record<DemoCountryCode, number> = { NG: 100, US: 200 };
const TYPE_OFFSET: Record<DemoCompanyType, number> = {
  business: 0,
  individual: 1,
  accounting_firm: 2,
};

const DEFAULT_AMOUNTS = {
  NG: { min: 5_000, max: 500_000_000 },
  US: { min: 50, max: 1_000_000 },
} as const;

export type BankTransaction = {
  date: Date;
  amount: number;
  payee?: string;
  description?: string;
  bank_account_id?: string;
  reference?: string;
  metadata?: Record<string, unknown>;
};

type Options = {
  country: DemoCountryCode;
  type: DemoCompanyType;
  date?: { from?: Date | string; to?: Date | string };
  amount?: { min?: number; max?: number };
  txnCount?: number;
  bankAccountId: string;
  metadata?: Record<string, unknown>;
};

export function generateBankTransactions(opts: Options): {
  source: 'manual_entry';
  bank_account_id: string;
  bank_transactions: BankTransaction[];
} {
  const {
    country,
    type,
    date: { from = '2020-01-01', to = new Date() } = {},
    amount: {
      min = DEFAULT_AMOUNTS[country].min,
      max = DEFAULT_AMOUNTS[country].max,
    } = {},
    txnCount = 500,
    bankAccountId,
    metadata,
  } = opts;

  // deterministic seed from country + type
  const seed = SEED_BASE[country] + TYPE_OFFSET[type];

  const faker = country === 'NG' ? fakerNG : fakerUS;
  faker.seed(seed);

  const fromDate = new Date(from);
  const toDate = new Date(to);

  const pairedList = PAIRED[type] ?? [];
  const PAIRED_RATIO = 0.3;

  const bankTransactions = Array.from({ length: txnCount }, () => {
    const isDebit = faker.datatype.boolean();
    const abs = faker.finance.amount({ min, max, dec: 2 });
    const amount = isDebit ? -Number(abs) : Number(abs);

    let payee: string | undefined;
    let description: string | undefined;
    const usePaired =
      pairedList.length > 0 && faker.datatype.boolean(PAIRED_RATIO);

    if (usePaired) {
      // Clean, perfect signal
      const item = faker.helpers.arrayElement(pairedList);
      payee = item.payee;
      description = item.description;
    } else {
      // Realistic noise – this is what real bank feeds look like
      const source = faker.helpers.arrayElement([
        () => ({
          payee: faker.company.name(),
          desc: faker.finance.transactionDescription(),
        }),
        () => ({
          payee: faker.person.fullName(),
          desc: faker.helpers.arrayElement(['Transfer', 'Payment', 'Purchase']),
        }),
        () => ({
          payee: getLocalVendor(faker, country),
          desc: faker.commerce.productName(),
        }),
        () => ({
          payee: 'ATM Withdrawal',
          desc: `Cash withdrawal ${faker.location.city()}`,
        }),
        () => ({ payee: 'POS Purchase', desc: faker.commerce.product() }),
        () => ({
          payee: faker.string.alphanumeric(12).toUpperCase(),
          desc: '',
        }), // raw reference only
        () => ({ payee: '', desc: faker.finance.transactionDescription() }), // missing payee
      ]);

      const result = source();
      payee = result.payee || undefined;
      description = result.desc || undefined;
    }

    return {
      date: faker.date.between({ from: fromDate, to: toDate }),
      bank_account_id: bankAccountId,
      amount,
      ...(description && { description }),
      ...(payee && { payee }),
    };
  });

  return {
    source: 'manual_entry',
    bank_account_id: bankAccountId,
    bank_transactions: bankTransactions,
  };
}

function getLocalVendor(faker: any, country: DemoCountryCode) {
  if (country === 'NG') {
    return faker.helpers.arrayElement([
      `${faker.location.city()} Supermarket`,
      `${faker.person.firstName()} Stores`,
      'Chicken Republic',
      'Shoprite',
      'Fuel Station',
    ]);
  }
  return faker.helpers.arrayElement([
    'Walmart',
    'Target',
    'Starbucks',
    'Whole Foods',
    'Shell Gas',
  ]);
}
