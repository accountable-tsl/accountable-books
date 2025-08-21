import { faker } from '@faker-js/faker';
import type { CountryConfig } from '../../utils/types.js';

export const US_CONFIG: CountryConfig = {
  code: 'US',
  name: 'United States',
  currency: {
    code: 'USD',
    symbol: '$',
    id: 'f3a1b0b1-c658-4af8-b5d0-b93467829a4d', // USD currency ID
  },
  bankingFormats: {
    accountNumber: /^\d{8,17}$/, // US bank account numbers
    routingCode: /^\d{9}$/, // ABA routing numbers
    routingCodeName: 'routing number',
  },
  localization: {
    businessRegistrationPrefix: 'EIN',
    taxIdFormat: /^\d{2}-\d{7}$/, // EIN format: XX-XXXXXXX
    phoneFormat: /^\+1\d{10}$/, // US phone: +1XXXXXXXXXX
    addressFormat: '{street}, {city}, {state} {zipCode}',
  },
};

// US-specific bank data generators
export const US_BANK_DATA = {
  // Common US banks for realistic demo data
  banks: [
    { name: 'Chase Bank', code: 'chase' },
    { name: 'Bank of America', code: 'bofa' },
    { name: 'Wells Fargo', code: 'wells' },
    { name: 'Citibank', code: 'citi' },
    { name: 'Capital One', code: 'capital_one' },
    { name: 'PNC Bank', code: 'pnc' },
    { name: 'TD Bank', code: 'td' },
    { name: 'US Bank', code: 'us_bank' },
  ],

  // Generate realistic US routing number
  generateRoutingNumber(): string {
    // Use faker to generate a realistic routing number
    return faker.helpers.fromRegExp(/^[0-9]{9}$/);
  },

  // Generate realistic US account number
  generateAccountNumber(): string {
    return faker.helpers.fromRegExp(/^[0-9]{10,12}$/);
  },

  // US-specific transaction descriptions
  transactionDescriptions: {
    individual: [
      'GROCERY STORE PURCHASE',
      'AMAZON.COM PURCHASE',
      'STARBUCKS COFFEE',
      'TARGET STORE PURCHASE',
      'NETFLIX SUBSCRIPTION',
      'SPOTIFY PREMIUM',
      'UBER RIDE',
      'VENMO PAYMENT',
      'PAYPAL TRANSFER',
      'ATM WITHDRAWAL',
      'DIRECT DEPOSIT SALARY',
      'INTEREST PAYMENT',
    ],
    business: [
      'AWS SERVICES',
      'STRIPE PAYMENT',
      'OFFICE SUPPLIES',
      'SOFTWARE SUBSCRIPTION',
      'PROFESSIONAL SERVICES',
      'MARKETING EXPENSE',
      'PAYROLL PROCESSING',
      'INSURANCE PREMIUM',
      'LOAN PAYMENT',
      'CLIENT PAYMENT',
      'VENDOR PAYMENT',
      'TAX PAYMENT',
    ],
    accounting_firm: [
      'QUICKBOOKS SUBSCRIPTION',
      'PROFESSIONAL LIABILITY INS',
      'CLIENT TRUST TRANSFER',
      'TAX SOFTWARE LICENSE',
      'CONTINUING EDUCATION',
      'OFFICE RENT',
      'LEGAL FEES',
      'AUDIT SOFTWARE',
      'CLIENT PAYMENT',
      'SUBCONTRACTOR PAYMENT',
    ],
  },

  // US business entity types
  businessEntityTypes: ['LLC', 'Inc.', 'Corp.', 'LP', 'LLP'],

  // US states for addresses
  states: [
    'AL',
    'AK',
    'AZ',
    'AR',
    'CA',
    'CO',
    'CT',
    'DE',
    'FL',
    'GA',
    'HI',
    'ID',
    'IL',
    'IN',
    'IA',
    'KS',
    'KY',
    'LA',
    'ME',
    'MD',
    'MA',
    'MI',
    'MN',
    'MS',
    'MO',
    'MT',
    'NE',
    'NV',
    'NH',
    'NJ',
    'NM',
    'NY',
    'NC',
    'ND',
    'OH',
    'OK',
    'OR',
    'PA',
    'RI',
    'SC',
    'SD',
    'TN',
    'TX',
    'UT',
    'VT',
    'VA',
    'WA',
    'WV',
    'WI',
    'WY',
  ],

  // Generate US business address
  generateBusinessAddress() {
    const state = faker.helpers.arrayElement(this.states);
    return {
      street: faker.location.streetAddress(),
      city: faker.location.city(),
      state: state,
      zipCode: faker.location.zipCode(),
      country: 'US',
      formatted: `${faker.location.streetAddress()}, ${faker.location.city()}, ${state} ${faker.location.zipCode()}`,
    };
  },

  // Generate US phone number
  generatePhoneNumber(): string {
    return faker.phone.number('+1 (###) ###-####');
  },

  // Generate US EIN (Employer Identification Number)
  generateEIN(): string {
    return faker.helpers.fromRegExp(/^\d{2}-\d{7}$/);
  },

  // US-specific transaction amount ranges by company type
  transactionAmounts: {
    individual: {
      income: { min: 1000, max: 8000 }, // Monthly salary/income
      expenses: { min: 5, max: 2000 }, // Individual expenses
      transfers: { min: 50, max: 5000 },
    },
    business: {
      revenue: { min: 5000, max: 100000 }, // Business revenue
      expenses: { min: 100, max: 25000 }, // Business expenses
      transfers: { min: 500, max: 50000 },
    },
    accounting_firm: {
      revenue: { min: 10000, max: 200000 }, // Professional fees
      expenses: { min: 500, max: 15000 }, // Professional expenses
      transfers: { min: 1000, max: 75000 },
    },
  },
};

// US-specific contact data
export const US_CONTACT_DATA = {
  // Service providers commonly used by US businesses
  serviceProviders: {
    individual: [
      { name: 'Comcast Cable', email: 'billing@comcast.com', category: 'utilities' },
      { name: 'Verizon Wireless', email: 'support@verizon.com', category: 'telecom' },
      { name: 'State Farm Insurance', email: 'claims@statefarm.com', category: 'insurance' },
      { name: 'IRS', email: 'taxpayer.advocate@irs.gov', category: 'government' },
      { name: 'Social Security Admin', email: 'info@ssa.gov', category: 'government' },
    ],
    business: [
      { name: 'Amazon Web Services', email: 'billing@aws.amazon.com', category: 'technology' },
      { name: 'Gusto Payroll', email: 'support@gusto.com', category: 'payroll' },
      { name: 'Salesforce.com', email: 'billing@salesforce.com', category: 'software' },
      { name: 'FedEx Corporation', email: 'billing@fedex.com', category: 'shipping' },
      { name: 'UPS Inc.', email: 'billing@ups.com', category: 'shipping' },
    ],
    accounting_firm: [
      { name: 'Intuit QuickBooks', email: 'support@quickbooks.com', category: 'software' },
      { name: 'Thomson Reuters', email: 'support@thomsonreuters.com', category: 'software' },
      { name: 'CCH Wolters Kluwer', email: 'support@cch.com', category: 'software' },
      { name: 'AICPA', email: 'service@aicpa.org', category: 'professional' },
      { name: 'CPA Society', email: 'info@cpasociety.org', category: 'professional' },
    ],
  },

  // Generate US customer/client
  generateCustomer() {
    return {
      name: faker.company.name(),
      contactPerson: faker.person.fullName(),
      email: faker.internet.email(),
      phone: US_BANK_DATA.generatePhoneNumber(),
      address: US_BANK_DATA.generateBusinessAddress(),
      taxId: US_BANK_DATA.generateEIN(),
      type: 'customer',
    };
  },

  // Generate US vendor/supplier
  generateVendor() {
    return {
      name: faker.company.name(),
      contactPerson: faker.person.fullName(),
      email: faker.internet.email(),
      phone: US_BANK_DATA.generatePhoneNumber(),
      address: US_BANK_DATA.generateBusinessAddress(),
      taxId: US_BANK_DATA.generateEIN(),
      type: 'vendor',
    };
  },
};
