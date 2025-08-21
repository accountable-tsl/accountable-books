import { faker } from '@faker-js/faker';
import type { CountryConfig } from '../../utils/types.js';

export const NG_CONFIG: CountryConfig = {
  code: 'NG',
  name: 'Nigeria',
  currency: {
    code: 'NGN',
    symbol: '₦',
    id: '1d6a1e31-7e36-4eab-94e1-42f2173ea972', // NGN currency ID
  },
  bankingFormats: {
    accountNumber: /^\d{10}$/, // Nigerian account numbers (10 digits)
    routingCode: /^\d{3}$/, // Nigerian sort codes (3 digits)
    routingCodeName: 'sort code',
  },
  localization: {
    businessRegistrationPrefix: 'RC',
    taxIdFormat: /^\d{8}-\d{4}$/, // Nigerian TIN: XXXXXXXX-XXXX
    phoneFormat: /^\+234[789]\d{9}$/, // Nigerian mobile: +234XXXXXXXXX
    addressFormat: '{street}, {city}, {state} State, Nigeria',
  },
};

// Nigeria-specific bank data generators
export const NG_BANK_DATA = {
  // Major Nigerian banks for realistic demo data
  banks: [
    { name: 'GTBank', code: 'gtb', sortCode: '058' },
    { name: 'Access Bank', code: 'access', sortCode: '044' },
    { name: 'First Bank', code: 'firstbank', sortCode: '011' },
    { name: 'Zenith Bank', code: 'zenith', sortCode: '057' },
    { name: 'UBA', code: 'uba', sortCode: '033' },
    { name: 'Fidelity Bank', code: 'fidelity', sortCode: '070' },
    { name: 'Sterling Bank', code: 'sterling', sortCode: '232' },
    { name: 'Wema Bank', code: 'wema', sortCode: '035' },
    { name: 'FCMB', code: 'fcmb', sortCode: '214' },
    { name: 'Union Bank', code: 'union', sortCode: '032' },
  ],

  // Generate realistic Nigerian sort code
  generateSortCode(): string {
    const sortCodes = this.banks.map((bank) => bank.sortCode);
    return faker.helpers.arrayElement(sortCodes);
  },

  // Generate realistic Nigerian account number
  generateAccountNumber(): string {
    return faker.helpers.fromRegExp(/^[0-9]{10}$/);
  },

  // Nigeria-specific transaction descriptions
  transactionDescriptions: {
    individual: [
      'SHOPRITE PURCHASE',
      'JUMIA ORDER',
      'KONGA PURCHASE',
      'MTN AIRTIME',
      'GLO DATA BUNDLE',
      'NETFLIX NAIRA',
      'SPOTIFY NAIRA',
      'UBER LAGOS',
      'BOLT RIDE',
      'OPAY TRANSFER',
      'PALMPAY PAYMENT',
      'SALARY CREDIT',
      'DIVIDEND PAYMENT',
    ],
    business: [
      'INTERSWITCH PAYMENT',
      'FLUTTERWAVE FEES',
      'PAYSTACK CHARGES',
      'MICROSOFT NIGERIA',
      'ZOOM PRO NAIRA',
      'MARKETING EXPENSE',
      'STAFF SALARY',
      'PENSION CONTRIBUTION',
      'INSURANCE PREMIUM',
      'LOAN REPAYMENT',
      'CLIENT PAYMENT',
      'SUPPLIER PAYMENT',
      'VAT PAYMENT',
    ],
    accounting_firm: [
      'SAGE ACCOUNTING',
      'QUICKBOOKS NAIRA',
      'PROFESSIONAL INDEMNITY',
      'ICAN MEMBERSHIP',
      'TAX AUDIT SOFTWARE',
      'OFFICE RENT LAGOS',
      'LEGAL RETAINER',
      'AUDIT FEES',
      'CLIENT PAYMENT',
      'ASSOCIATE PAYMENT',
    ],
  },

  // Nigerian business entity types
  businessEntityTypes: ['Ltd', 'PLC', 'Gte', 'NGO', 'Partnership'],

  // Nigerian states
  states: [
    'Abia',
    'Adamawa',
    'Akwa Ibom',
    'Anambra',
    'Bauchi',
    'Bayelsa',
    'Benue',
    'Borno',
    'Cross River',
    'Delta',
    'Ebonyi',
    'Edo',
    'Ekiti',
    'Enugu',
    'FCT',
    'Gombe',
    'Imo',
    'Jigawa',
    'Kaduna',
    'Kano',
    'Katsina',
    'Kebbi',
    'Kogi',
    'Kwara',
    'Lagos',
    'Nasarawa',
    'Niger',
    'Ogun',
    'Ondo',
    'Osun',
    'Oyo',
    'Plateau',
    'Rivers',
    'Sokoto',
    'Taraba',
    'Yobe',
    'Zamfara',
  ],

  // Major Nigerian cities
  majorCities: [
    'Lagos',
    'Abuja',
    'Kano',
    'Ibadan',
    'Port Harcourt',
    'Benin City',
    'Kaduna',
    'Jos',
    'Warri',
    'Ilorin',
    'Aba',
    'Enugu',
    'Onitsha',
  ],

  // Generate Nigerian business address
  generateBusinessAddress() {
    const state = faker.helpers.arrayElement(this.states);
    const city = this.majorCities.includes(state)
      ? state
      : faker.helpers.arrayElement(this.majorCities);

    return {
      street: `${faker.number.int({ min: 1, max: 999 })} ${faker.location.streetName()} Street`,
      city: city,
      state: state,
      country: 'Nigeria',
      formatted: `${faker.number.int({ min: 1, max: 999 })} ${faker.location.streetName()} Street, ${city}, ${state} State, Nigeria`,
    };
  },

  // Generate Nigerian phone number
  generatePhoneNumber(): string {
    const prefixes = [
      '803',
      '806',
      '813',
      '816',
      '703',
      '706',
      '813',
      '816',
      '701',
      '708',
      '802',
      '805',
      '807',
      '815',
      '811',
      '818',
    ];
    const prefix = faker.helpers.arrayElement(prefixes);
    const suffix = faker.helpers.fromRegExp(/^\d{7}$/);
    return `+234${prefix}${suffix}`;
  },

  // Generate Nigerian TIN (Tax Identification Number)
  generateTIN(): string {
    return faker.helpers.fromRegExp(/^\d{8}-\d{4}$/);
  },

  // Generate Nigerian RC number (Company registration)
  generateRCNumber(): string {
    return `RC${faker.number.int({ min: 100000, max: 9999999 })}`;
  },

  // Nigeria-specific transaction amount ranges (in Naira)
  transactionAmounts: {
    individual: {
      income: { min: 50000, max: 500000 }, // Monthly salary in Naira
      expenses: { min: 500, max: 100000 }, // Individual expenses
      transfers: { min: 5000, max: 200000 },
    },
    business: {
      revenue: { min: 100000, max: 5000000 }, // Business revenue in Naira
      expenses: { min: 10000, max: 1000000 }, // Business expenses
      transfers: { min: 25000, max: 2000000 },
    },
    accounting_firm: {
      revenue: { min: 200000, max: 10000000 }, // Professional fees in Naira
      expenses: { min: 50000, max: 500000 }, // Professional expenses
      transfers: { min: 100000, max: 3000000 },
    },
  },
};

// Nigeria-specific contact data
export const NG_CONTACT_DATA = {
  // Service providers commonly used by Nigerian businesses
  serviceProviders: {
    individual: [
      { name: 'MTN Nigeria', email: 'customercare@mtnonline.com', category: 'telecom' },
      { name: 'GLO Nigeria', email: 'customercare@gloworld.com', category: 'telecom' },
      { name: 'Airtel Nigeria', email: 'care@ng.airtel.com', category: 'telecom' },
      { name: 'IKEDC', email: 'customercare@ikejaelectric.com', category: 'utilities' },
      { name: 'FIRS', email: 'info@firs.gov.ng', category: 'government' },
    ],
    business: [
      { name: 'Paystack', email: 'support@paystack.com', category: 'fintech' },
      { name: 'Flutterwave', email: 'support@flutterwave.com', category: 'fintech' },
      { name: 'Interswitch', email: 'support@interswitchgroup.com', category: 'fintech' },
      { name: 'Mono', email: 'support@mono.co', category: 'fintech' },
      { name: 'Whogohost', email: 'support@whogohost.com', category: 'technology' },
    ],
    accounting_firm: [
      { name: 'Sage Accounting', email: 'support@sage.com', category: 'software' },
      { name: 'ICAN', email: 'info@icanig.org', category: 'professional' },
      { name: 'CITN', email: 'info@citn.org', category: 'professional' },
      { name: 'PWC Nigeria', email: 'ng_contactus@ng.pwc.com', category: 'consulting' },
      { name: 'KPMG Nigeria', email: 'info@kpmg.com', category: 'consulting' },
    ],
  },

  // Generate Nigerian customer/client
  generateCustomer() {
    const isIndividual = faker.datatype.boolean();

    if (isIndividual) {
      return {
        name: faker.person.fullName(),
        contactPerson: faker.person.fullName(),
        email: faker.internet.email(),
        phone: NG_BANK_DATA.generatePhoneNumber(),
        address: NG_BANK_DATA.generateBusinessAddress(),
        type: 'customer',
      };
    } else {
      return {
        name: `${faker.company.name()} ${faker.helpers.arrayElement(NG_BANK_DATA.businessEntityTypes)}`,
        contactPerson: faker.person.fullName(),
        email: faker.internet.email(),
        phone: NG_BANK_DATA.generatePhoneNumber(),
        address: NG_BANK_DATA.generateBusinessAddress(),
        rcNumber: NG_BANK_DATA.generateRCNumber(),
        tin: NG_BANK_DATA.generateTIN(),
        type: 'customer',
      };
    }
  },

  // Generate Nigerian vendor/supplier
  generateVendor() {
    return {
      name: `${faker.company.name()} ${faker.helpers.arrayElement(NG_BANK_DATA.businessEntityTypes)}`,
      contactPerson: faker.person.fullName(),
      email: faker.internet.email(),
      phone: NG_BANK_DATA.generatePhoneNumber(),
      address: NG_BANK_DATA.generateBusinessAddress(),
      rcNumber: NG_BANK_DATA.generateRCNumber(),
      tin: NG_BANK_DATA.generateTIN(),
      type: 'vendor',
    };
  },

  // Nigerian first names for realistic data
  nigerianFirstNames: [
    'Adebayo',
    'Chinedu',
    'Emeka',
    'Folake',
    'Kemi',
    'Olumide',
    'Funmi',
    'Taiwo',
    'Segun',
    'Bola',
    'Tunde',
    'Yemi',
    'Femi',
    'Dupe',
    'Gbemi',
    'Kola',
    'Bisi',
    'Dare',
    'Gbenga',
    'Joke',
    'Lanre',
    'Moji',
    'Remi',
    'Sola',
    'Tayo',
    'Wale',
    'Yinka',
    'Biodun',
    'Kunle',
    'Shade',
  ],

  // Nigerian last names
  nigerianLastNames: [
    'Adebayo',
    'Ogundimu',
    'Okafor',
    'Ibrahim',
    'Williams',
    'Johnson',
    'Adebisi',
    'Ogundipe',
    'Adeleke',
    'Oladele',
    'Babatunde',
    'Olayinka',
    'Adeyemi',
    'Ogunbanjo',
    'Akinyemi',
    'Oluwaseun',
    'Adedayo',
    'Ogunleye',
    'Adeniyi',
    'Ogunniran',
    'Akinola',
    'Olumuyiwa',
    'Adeyinka',
    'Ogunmola',
  ],
};
