import { faker } from '@faker-js/faker';
import type { CompanyTypeConfig, DataScenario } from '../../utils/types.js';

export const INDIVIDUAL_CONFIG: CompanyTypeConfig = {
  type: 'individual',
  displayName: 'Individual/Personal',
  defaultScenarios: ['personal-finance'],
  requiredData: ['bank-accounts', 'transactions', 'contacts'],
  optionalData: ['projects'], // Individuals rarely need projects
  businessRules: {
    minBankAccounts: 2, // Checking + Savings minimum
    maxBankAccounts: 4, // Checking, Savings, Credit Card, Investment
    typicalTransactionVolume: 100, // ~100 transactions per month
    commonContactTypes: ['family', 'service_provider', 'subscription', 'government'],
    projectsRequired: false,
  },
};

// Individual-specific data scenarios
export const INDIVIDUAL_SCENARIOS: Record<string, DataScenario> = {
  'personal-finance': {
    name: 'Personal Finance Management',
    description: 'Individual managing personal finances, expenses, and savings',
    dataGenerators: ['bank-accounts', 'personal-transactions', 'personal-contacts'],
    volume: {
      transactions: 120, // ~4 per day
      contacts: 15, // Small personal network
      monthsOfData: 12, // Full year of data
    },
  },
};

// Individual-specific bank account configurations
export const INDIVIDUAL_BANK_ACCOUNTS = {
  // Standard personal bank accounts
  accountTypes: [
    {
      type: 'checkings_current',
      name: 'Personal Checking',
      priority: 1,
      balance: { min: 500, max: 5000 },
      required: true,
    },
    {
      type: 'savings',
      name: 'Personal Savings',
      priority: 2,
      balance: { min: 2000, max: 50000 },
      required: true,
    },
    {
      type: 'credit_card',
      name: 'Credit Card',
      priority: 3,
      balance: { min: -10000, max: 0 }, // Negative balance for credit
      required: false,
    },
    {
      type: 'other',
      name: 'Investment Account',
      priority: 4,
      balance: { min: 5000, max: 100000 },
      required: false,
    },
  ],

  // Generate individual bank account configuration
  generateAccounts(country: 'US' | 'NG', count: number = 3) {
    const accounts = [];
    const baseTypes = this.accountTypes.slice(0, Math.min(count, this.accountTypes.length));

    return baseTypes.map((config, index) => ({
      displayName: config.name,
      accountType: config.type,
      businessOrPersonal: 'personal' as const,
      balance: faker.number.int({ min: config.balance.min, max: config.balance.max }),
      currency: country === 'US' ? 'USD' : 'NGN',
      isDefault: index === 0, // First account is default
    }));
  },
};

// Individual transaction patterns
export const INDIVIDUAL_TRANSACTIONS = {
  // Transaction categories for individuals
  categories: [
    // Income
    { name: 'Salary', type: 'income', frequency: 'monthly' },
    { name: 'Freelance Income', type: 'income', frequency: 'irregular' },
    { name: 'Investment Returns', type: 'income', frequency: 'quarterly' },
    { name: 'Gifts Received', type: 'income', frequency: 'irregular' },

    // Expenses
    { name: 'Groceries', type: 'expense', frequency: 'weekly' },
    { name: 'Rent/Mortgage', type: 'expense', frequency: 'monthly' },
    { name: 'Utilities', type: 'expense', frequency: 'monthly' },
    { name: 'Transportation', type: 'expense', frequency: 'weekly' },
    { name: 'Healthcare', type: 'expense', frequency: 'monthly' },
    { name: 'Entertainment', type: 'expense', frequency: 'weekly' },
    { name: 'Subscriptions', type: 'expense', frequency: 'monthly' },
    { name: 'Insurance', type: 'expense', frequency: 'monthly' },
    { name: 'Personal Care', type: 'expense', frequency: 'weekly' },
    { name: 'Dining Out', type: 'expense', frequency: 'weekly' },
    { name: 'Shopping', type: 'expense', frequency: 'weekly' },
    { name: 'Travel', type: 'expense', frequency: 'irregular' },
  ],

  // Generate realistic transaction patterns for individuals
  generateTransactionPattern(country: 'US' | 'NG') {
    const currency = country === 'US' ? 'USD' : 'NGN';
    const multiplier = currency === 'USD' ? 1 : 800; // Rough USD to NGN conversion

    return {
      income: {
        salary: {
          amount: { min: 3000 * multiplier, max: 8000 * multiplier },
          frequency: 'monthly',
          day: faker.number.int({ min: 1, max: 5 }), // Early in month
        },
        freelance: {
          amount: { min: 500 * multiplier, max: 2000 * multiplier },
          frequency: 'irregular',
          probability: 0.3, // 30% chance per month
        },
      },
      expenses: {
        rent: {
          amount: { min: 800 * multiplier, max: 2500 * multiplier },
          frequency: 'monthly',
          day: 1, // First of month
        },
        groceries: {
          amount: { min: 80 * multiplier, max: 200 * multiplier },
          frequency: 'weekly',
          variance: 0.3, // 30% variance
        },
        utilities: {
          amount: { min: 100 * multiplier, max: 300 * multiplier },
          frequency: 'monthly',
          day: faker.number.int({ min: 15, max: 25 }),
        },
        transportation: {
          amount: { min: 20 * multiplier, max: 100 * multiplier },
          frequency: 'weekly',
          variance: 0.5,
        },
        entertainment: {
          amount: { min: 15 * multiplier, max: 80 * multiplier },
          frequency: 'weekly',
          variance: 0.7,
        },
        subscriptions: {
          amount: { min: 10 * multiplier, max: 50 * multiplier },
          frequency: 'monthly',
          variance: 0.1, // Subscriptions are usually fixed
        },
      },
    };
  },
};

// Individual contact types
export const INDIVIDUAL_CONTACTS = {
  // Contact categories for individuals
  contactTypes: [
    'family',
    'friend',
    'service_provider',
    'subscription_service',
    'government',
    'financial',
    'healthcare',
    'utility',
    'landlord',
  ],

  // Generate individual-specific contacts
  generateContacts(country: 'US' | 'NG', count: number = 15) {
    const contacts = [];

    // Family contacts (2-3)
    for (let i = 0; i < faker.number.int({ min: 2, max: 3 }); i++) {
      contacts.push({
        displayName: faker.person.fullName(),
        email: faker.internet.email(),
        phone: this.generatePhoneNumber(country),
        type: 'family',
        notes: `Family member - ${faker.helpers.arrayElement(['Sister', 'Brother', 'Parent', 'Cousin'])}`,
      });
    }

    // Service providers (5-7)
    const serviceProviders =
      country === 'US'
        ? [
            'Local Mechanic',
            'Hair Salon',
            'Dentist',
            'Family Doctor',
            'Plumber',
            'Electrician',
            'Internet Provider',
            'Insurance Agent',
          ]
        : [
            'Mechanic - Ikeja',
            'Hair Salon - Victoria Island',
            'Dentist - Lekki',
            'Family Doctor',
            'Plumber',
            'Electrician',
            'MTN Store',
            'Insurance Agent',
          ];

    for (let i = 0; i < faker.number.int({ min: 5, max: 7 }); i++) {
      const provider = faker.helpers.arrayElement(serviceProviders);
      contacts.push({
        displayName: provider,
        email: faker.internet.email(),
        phone: this.generatePhoneNumber(country),
        type: 'service_provider',
        notes: `Regular service provider - ${provider.toLowerCase()}`,
      });
    }

    // Fill remaining with random contacts
    while (contacts.length < count) {
      contacts.push({
        displayName: faker.company.name(),
        email: faker.internet.email(),
        phone: this.generatePhoneNumber(country),
        type: faker.helpers.arrayElement(['subscription_service', 'utility', 'financial']),
        notes: faker.company.catchPhrase(),
      });
    }

    return contacts;
  },

  generatePhoneNumber(country: 'US' | 'NG'): string {
    if (country === 'US') {
      return faker.phone.number('+1 (###) ###-####');
    } else {
      const prefixes = ['803', '806', '813', '816', '703', '706', '701', '708'];
      const prefix = faker.helpers.arrayElement(prefixes);
      const suffix = faker.helpers.fromRegExp(/^\d{7}$/);
      return `+234${prefix}${suffix}`;
    }
  },
};

// Export all individual configurations
export const INDIVIDUAL_DATA = {
  config: INDIVIDUAL_CONFIG,
  scenarios: INDIVIDUAL_SCENARIOS,
  bankAccounts: INDIVIDUAL_BANK_ACCOUNTS,
  transactions: INDIVIDUAL_TRANSACTIONS,
  contacts: INDIVIDUAL_CONTACTS,
};
