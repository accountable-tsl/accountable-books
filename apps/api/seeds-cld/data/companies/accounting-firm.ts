import { faker } from '@faker-js/faker';
import type { CompanyTypeConfig, DataScenario } from '../../utils/types.js';

export const ACCOUNTING_FIRM_CONFIG: CompanyTypeConfig = {
  type: 'accounting_firm',
  displayName: 'Accounting Firm',
  defaultScenarios: ['professional-services'],
  requiredData: ['bank-accounts', 'transactions', 'contacts', 'projects', 'journal-entries'],
  optionalData: ['recurring-templates', 'client-trust-accounts'],
  businessRules: {
    minBankAccounts: 3, // Operating + Client Trust + Savings minimum
    maxBankAccounts: 8, // Multiple trust accounts for different purposes
    typicalTransactionVolume: 500, // High volume for multiple clients
    commonContactTypes: ['client', 'vendor', 'employee', 'subcontractor', 'professional'],
    projectsRequired: true,
  },
};

// Accounting firm specific data scenarios
export const ACCOUNTING_FIRM_SCENARIOS: Record<string, DataScenario> = {
  'professional-services': {
    name: 'Professional Services Firm',
    description:
      'Accounting firm providing bookkeeping, tax, and audit services to multiple clients',
    dataGenerators: [
      'firm-bank-accounts',
      'professional-transactions',
      'client-contacts',
      'client-projects',
    ],
    volume: {
      transactions: 600, // High volume from multiple clients
      contacts: 50, // Mix of clients, vendors, employees, professionals
      projects: 15, // Active client engagements
      monthsOfData: 36, // 3 years of professional history
    },
  },
};

// Accounting firm specific bank account configurations
export const ACCOUNTING_FIRM_BANK_ACCOUNTS = {
  accountTypes: [
    {
      type: 'checkings_current',
      name: 'Operating Account',
      priority: 1,
      balance: { min: 25000, max: 300000 },
      required: true,
      purpose: 'Daily operations and business expenses',
      category: 'operating',
    },
    {
      type: 'checkings_current',
      name: 'Client Trust Account',
      priority: 2,
      balance: { min: 50000, max: 2000000 },
      required: true,
      purpose: 'Client funds held in trust',
      category: 'trust',
    },
    {
      type: 'savings',
      name: 'Business Savings',
      priority: 3,
      balance: { min: 50000, max: 1000000 },
      required: true,
      purpose: 'Reserve fund and long-term savings',
      category: 'operating',
    },
    {
      type: 'checkings_current',
      name: 'Payroll Account',
      priority: 4,
      balance: { min: 30000, max: 150000 },
      required: false,
      purpose: 'Employee payroll processing',
      category: 'operating',
    },
    {
      type: 'other',
      name: 'Tax Escrow Account',
      priority: 5,
      balance: { min: 25000, max: 500000 },
      required: false,
      purpose: 'Client tax payments in escrow',
      category: 'trust',
    },
    {
      type: 'checkings_current',
      name: 'Client Trust - Entity A',
      priority: 6,
      balance: { min: 10000, max: 500000 },
      required: false,
      purpose: 'Dedicated trust account for major client',
      category: 'trust',
    },
    {
      type: 'credit_card',
      name: 'Business Credit Line',
      priority: 7,
      balance: { min: -100000, max: 0 },
      required: false,
      purpose: 'Credit facility for cash flow',
      category: 'operating',
    },
    {
      type: 'other',
      name: 'Equipment Finance Account',
      priority: 8,
      balance: { min: 5000, max: 50000 },
      required: false,
      purpose: 'Equipment purchases and leases',
      category: 'operating',
    },
  ],

  generateAccounts(country: 'US' | 'NG', count: number = 5) {
    const accounts = [];
    const selectedTypes = this.accountTypes.slice(0, Math.min(count, this.accountTypes.length));

    const multiplier = country === 'US' ? 1 : 800; // USD to NGN conversion

    return selectedTypes.map((config, index) => ({
      displayName: config.name,
      accountType: config.type,
      businessOrPersonal: 'business' as const,
      balance: faker.number.int({
        min: config.balance.min * multiplier,
        max: config.balance.max * multiplier,
      }),
      currency: country === 'US' ? 'USD' : 'NGN',
      description: config.purpose,
      category: config.category,
      isDefault: index === 0,
      isTrustAccount: config.category === 'trust',
    }));
  },
};

// Accounting firm transaction patterns
export const ACCOUNTING_FIRM_TRANSACTIONS = {
  categories: [
    // Professional Revenue
    { name: 'Bookkeeping Fees', type: 'income', frequency: 'monthly' },
    { name: 'Tax Preparation Fees', type: 'income', frequency: 'seasonal' },
    { name: 'Audit Fees', type: 'income', frequency: 'project' },
    { name: 'Consulting Fees', type: 'income', frequency: 'irregular' },
    { name: 'Payroll Processing Fees', type: 'income', frequency: 'monthly' },
    { name: 'Advisory Fees', type: 'income', frequency: 'monthly' },

    // Trust Account Transactions
    { name: 'Client Tax Payment', type: 'trust_out', frequency: 'quarterly' },
    { name: 'Client Fund Deposit', type: 'trust_in', frequency: 'irregular' },
    { name: 'Escrow Release', type: 'trust_out', frequency: 'irregular' },

    // Operating Expenses
    { name: 'Staff Salaries', type: 'expense', frequency: 'monthly' },
    { name: 'Office Rent', type: 'expense', frequency: 'monthly' },
    { name: 'Professional Software', type: 'expense', frequency: 'monthly' },
    { name: 'Professional Insurance', type: 'expense', frequency: 'monthly' },
    { name: 'Continuing Education', type: 'expense', frequency: 'quarterly' },
    { name: 'Professional Memberships', type: 'expense', frequency: 'yearly' },
    { name: 'Legal & Compliance', type: 'expense', frequency: 'quarterly' },
    { name: 'Office Supplies', type: 'expense', frequency: 'monthly' },
    { name: 'Travel & Client Meetings', type: 'expense', frequency: 'monthly' },
    { name: 'Marketing & Business Development', type: 'expense', frequency: 'monthly' },
    { name: 'Technology & Equipment', type: 'expense', frequency: 'irregular' },
    { name: 'Subcontractor Fees', type: 'expense', frequency: 'irregular' },
  ],

  generateTransactionPattern(country: 'US' | 'NG') {
    const currency = country === 'US' ? 'USD' : 'NGN';
    const multiplier = currency === 'USD' ? 1 : 800;

    return {
      revenue: {
        bookkeeping: {
          amount: { min: 25000 * multiplier, max: 150000 * multiplier },
          frequency: 'monthly',
          clients: faker.number.int({ min: 8, max: 25 }),
          variance: 0.15, // 15% variance month-to-month
        },
        tax_prep: {
          amount: { min: 50000 * multiplier, max: 500000 * multiplier },
          frequency: 'seasonal', // Q1-Q2 heavy
          seasonality: {
            jan: 1.8,
            feb: 2.5,
            mar: 3.0,
            apr: 2.8,
            may: 1.2,
            jun: 0.8,
            jul: 0.7,
            aug: 0.8,
            sep: 0.9,
            oct: 1.1,
            nov: 1.5,
            dec: 1.3,
          },
        },
        audit: {
          amount: { min: 75000 * multiplier, max: 800000 * multiplier },
          frequency: 'project',
          duration: faker.number.int({ min: 60, max: 180 }), // 2-6 months
          probability: 0.4, // 40% chance per quarter
        },
        consulting: {
          amount: { min: 15000 * multiplier, max: 100000 * multiplier },
          frequency: 'irregular',
          probability: 0.6, // 60% chance per month
        },
        payroll_services: {
          amount: { min: 3000 * multiplier, max: 25000 * multiplier },
          frequency: 'monthly',
          variance: 0.05, // Very stable
        },
      },
      expenses: {
        salaries: {
          amount: { min: 80000 * multiplier, max: 400000 * multiplier },
          frequency: 'monthly',
          day: faker.number.int({ min: 1, max: 5 }),
        },
        rent: {
          amount: { min: 8000 * multiplier, max: 35000 * multiplier },
          frequency: 'monthly',
          day: 1,
        },
        software: {
          amount: { min: 5000 * multiplier, max: 25000 * multiplier },
          frequency: 'monthly',
          vendors: ['QuickBooks', 'Sage', 'TaxWise', 'CCH', 'Thomson Reuters'],
        },
        insurance: {
          amount: { min: 3000 * multiplier, max: 15000 * multiplier },
          frequency: 'monthly',
          types: ['Professional Liability', 'General Liability', 'Cyber Insurance'],
        },
        continuing_education: {
          amount: { min: 2000 * multiplier, max: 15000 * multiplier },
          frequency: 'quarterly',
          variance: 0.4,
        },
        memberships: {
          amount: { min: 1000 * multiplier, max: 8000 * multiplier },
          frequency: 'yearly',
          organizations: ['AICPA', 'State CPA Society', 'IMA', 'ICAN'],
        },
      },
      trust_transactions: {
        client_deposits: {
          amount: { min: 5000 * multiplier, max: 200000 * multiplier },
          frequency: 'irregular',
          probability: 0.7,
        },
        tax_payments: {
          amount: { min: 10000 * multiplier, max: 500000 * multiplier },
          frequency: 'quarterly',
          months: [3, 6, 9, 12], // March, June, September, December
        },
      },
    };
  },
};

// Accounting firm contact types
export const ACCOUNTING_FIRM_CONTACTS = {
  contactTypes: [
    'client',
    'vendor',
    'employee',
    'subcontractor',
    'professional',
    'regulator',
    'bank',
    'insurance',
    'software_vendor',
  ],

  generateContacts(country: 'US' | 'NG', count: number = 50) {
    const contacts = [];

    // Clients (50% of contacts)
    const clientCount = Math.floor(count * 0.5);
    for (let i = 0; i < clientCount; i++) {
      contacts.push(this.generateClient(country));
    }

    // Professional Service Vendors (20% of contacts)
    const vendorCount = Math.floor(count * 0.2);
    for (let i = 0; i < vendorCount; i++) {
      contacts.push(this.generateVendor(country));
    }

    // Employees (15% of contacts)
    const employeeCount = Math.floor(count * 0.15);
    for (let i = 0; i < employeeCount; i++) {
      contacts.push(this.generateEmployee(country));
    }

    // Professional Network (15% of contacts)
    const professionalCount = count - contacts.length;
    for (let i = 0; i < professionalCount; i++) {
      contacts.push(this.generateProfessional(country));
    }

    return contacts;
  },

  generateClient(country: 'US' | 'NG') {
    const clientTypes = ['individual', 'small_business', 'medium_business', 'non_profit'];
    const clientType = faker.helpers.arrayElement(clientTypes);

    const services = [
      'Monthly Bookkeeping',
      'Tax Preparation',
      'Payroll Services',
      'Financial Statements',
      'Audit Services',
      'Tax Advisory',
      'Business Consulting',
      'Compliance Services',
    ];

    if (clientType === 'individual') {
      return {
        displayName: faker.person.fullName(),
        email: faker.internet.email(),
        phone: this.generatePersonalPhone(country),
        type: 'client',
        clientType: 'individual',
        services: faker.helpers.arrayElements(services, { min: 1, max: 3 }),
        monthlyRevenue: faker.number.int({ min: 500, max: 3000 }) * (country === 'US' ? 1 : 800),
        notes: `Individual client - ${faker.helpers.arrayElement(['tax only', 'bookkeeping + tax', 'consultation'])}`,
      };
    } else {
      return {
        displayName: `${faker.company.name()} ${country === 'US' ? 'LLC' : 'Ltd'}`,
        email: faker.internet.email(),
        phone: this.generateBusinessPhone(country),
        address: this.generateBusinessAddress(country),
        type: 'client',
        clientType,
        contactPerson: faker.person.fullName(),
        services: faker.helpers.arrayElements(services, { min: 2, max: 5 }),
        monthlyRevenue: faker.number.int({ min: 2000, max: 25000 }) * (country === 'US' ? 1 : 800),
        employees: faker.number.int({ min: 1, max: 100 }),
        industry: faker.company.buzzNoun(),
        notes: `${clientType.replace('_', ' ')} client - ${faker.helpers.arrayElement(['full-service', 'seasonal', 'project-based'])}`,
      };
    }
  },

  generateVendor(country: 'US' | 'NG') {
    const vendorTypes =
      country === 'US'
        ? [
            'Thomson Reuters',
            'CCH Wolters Kluwer',
            'Intuit ProConnect',
            'Sage',
            'Drake Software',
            'UltraTax CS',
            'GoSystem Tax RS',
            'PPC',
            'BNA Tax & Accounting',
            'Checkpoint Learning',
          ]
        : [
            'Sage Accounting',
            'QuickBooks Nigeria',
            'TaxPro Software',
            'FIRS e-Services',
            'CAC Portal Services',
            'SystemSpecs',
            'Seamfix',
            'AppZone',
            'Interswitch',
            'Remita',
          ];

    const vendorName = faker.helpers.arrayElement(vendorTypes);
    const categories = ['software', 'training', 'compliance', 'infrastructure', 'professional'];

    return {
      displayName: vendorName,
      email: `support@${vendorName.toLowerCase().replace(/\s+/g, '')}.com`,
      phone: this.generateBusinessPhone(country),
      type: 'vendor',
      category: faker.helpers.arrayElement(categories),
      services: faker.helpers.arrayElement([
        'Tax Software License',
        'Audit Software',
        'CPE Training',
        'Compliance Updates',
        'Research Tools',
        'Document Management',
      ]),
      monthlyCost: faker.number.int({ min: 500, max: 8000 }) * (country === 'US' ? 1 : 800),
      notes: `Professional software vendor - ${vendorName}`,
    };
  },

  generateEmployee(country: 'US' | 'NG') {
    const roles = [
      'Senior Accountant',
      'Staff Accountant',
      'Tax Preparer',
      'Bookkeeper',
      'Audit Senior',
      'Tax Manager',
      'Controller',
      'Administrative Assistant',
    ];

    const certifications =
      country === 'US'
        ? ['CPA', 'CMA', 'CIA', 'EA', 'ChFC', 'None']
        : ['ACA', 'ACCA', 'ICAN', 'CITN', 'CMA', 'None'];

    return {
      displayName: faker.person.fullName(),
      email: faker.internet.email(),
      phone: this.generatePersonalPhone(country),
      type: 'employee',
      jobTitle: faker.helpers.arrayElement(roles),
      department: faker.helpers.arrayElement(['Tax', 'Audit', 'Bookkeeping', 'Administration']),
      certifications: faker.helpers.arrayElement(certifications),
      hireDate: faker.date.past({ years: 5 }),
      notes: `${faker.helpers.arrayElement(['Full-time', 'Part-time', 'Seasonal'])} employee`,
    };
  },

  generateProfessional(country: 'US' | 'NG') {
    const professionalTypes =
      country === 'US'
        ? [
            'Attorney - Tax Law',
            'Financial Advisor',
            'Business Valuation Expert',
            'Forensic Accountant',
            'IT Consultant',
            'Insurance Agent',
            'Bank Relationship Manager',
            'Real Estate Appraiser',
          ]
        : [
            'Tax Lawyer - Lagos',
            'Financial Consultant',
            'Business Valuator',
            'Forensic Accountant',
            'IT Consultant Lagos',
            'Insurance Broker',
            'Bank Manager',
            'Property Valuer',
          ];

    const profType = faker.helpers.arrayElement(professionalTypes);

    return {
      displayName: faker.person.fullName(),
      email: faker.internet.email(),
      phone: this.generateBusinessPhone(country),
      type: 'professional',
      specialization: profType,
      firm: `${faker.company.name()} ${country === 'US' ? 'LLP' : 'Associates'}`,
      referralSource: faker.datatype.boolean(),
      notes: `Professional referral partner - ${profType.toLowerCase()}`,
    };
  },

  generateBusinessPhone(country: 'US' | 'NG'): string {
    if (country === 'US') {
      return faker.phone.number('+1 (###) ###-####');
    } else {
      return faker.phone.number('+234 ### ### ####');
    }
  },

  generatePersonalPhone(country: 'US' | 'NG'): string {
    if (country === 'US') {
      return faker.phone.number('+1 (###) ###-####');
    } else {
      const prefixes = ['803', '806', '813', '816', '703', '706', '701', '708'];
      const prefix = faker.helpers.arrayElement(prefixes);
      const suffix = faker.helpers.fromRegExp(/^\d{7}$/);
      return `+234${prefix}${suffix}`;
    }
  },

  generateBusinessAddress(country: 'US' | 'NG') {
    if (country === 'US') {
      const states = ['CA', 'NY', 'TX', 'FL', 'IL', 'PA', 'OH', 'NJ'];
      const state = faker.helpers.arrayElement(states);
      return {
        street: faker.location.streetAddress(),
        city: faker.location.city(),
        state: state,
        zipCode: faker.location.zipCode(),
        country: 'US',
      };
    } else {
      const states = ['Lagos', 'Abuja', 'Rivers', 'Kano', 'Ogun'];
      const state = faker.helpers.arrayElement(states);
      return {
        street: `${faker.number.int({ min: 1, max: 999 })} ${faker.location.streetName()} Street`,
        city:
          state === 'Lagos'
            ? faker.helpers.arrayElement(['Ikeja', 'Victoria Island', 'Ikoyi'])
            : state,
        state: state,
        country: 'Nigeria',
      };
    }
  },
};

// Accounting firm project types
export const ACCOUNTING_FIRM_PROJECTS = {
  projectTypes: [
    'bookkeeping',
    'tax_preparation',
    'audit',
    'consulting',
    'payroll_setup',
    'compliance',
  ],

  generateProjects(country: 'US' | 'NG', count: number = 15) {
    const projects = [];

    for (let i = 0; i < count; i++) {
      projects.push(this.generateProject(country));
    }

    return projects;
  },

  generateProject(country: 'US' | 'NG') {
    const projectTemplates = [
      'Annual Tax Preparation - Client ABC',
      'Monthly Bookkeeping - XYZ Corp',
      'Year-end Audit - DEF Industries',
      'Payroll Setup & Training',
      'Financial Statement Preparation',
      'Tax Planning & Advisory',
      'Compliance Review & Update',
      'Business Valuation Services',
      'Forensic Accounting Investigation',
      'M&A Due Diligence',
      'Internal Controls Assessment',
      'Budget & Forecast Development',
    ];

    const projectName = faker.helpers.arrayElement(projectTemplates);
    const projectType = faker.helpers.arrayElement(this.projectTypes);

    // Different duration based on project type
    const durations = {
      bookkeeping: { min: 365, max: 365 }, // Ongoing monthly
      tax_preparation: { min: 30, max: 90 },
      audit: { min: 60, max: 180 },
      consulting: { min: 14, max: 90 },
      payroll_setup: { min: 7, max: 30 },
      compliance: { min: 14, max: 60 },
    };

    const duration = durations[projectType as keyof typeof durations];
    const startDate = faker.date.past({ years: 1 });
    const projectDuration = faker.number.int({ min: duration.min, max: duration.max });
    const endDate = new Date(startDate.getTime() + projectDuration * 24 * 60 * 60 * 1000);

    // Fees based on project type and country
    const baseFees = {
      bookkeeping: { min: 2000, max: 15000 },
      tax_preparation: { min: 1000, max: 25000 },
      audit: { min: 15000, max: 150000 },
      consulting: { min: 5000, max: 50000 },
      payroll_setup: { min: 2000, max: 8000 },
      compliance: { min: 3000, max: 20000 },
    };

    const feeRange = baseFees[projectType as keyof typeof baseFees];
    const multiplier = country === 'US' ? 1 : 800;

    return {
      name: projectName,
      code: `${projectType.toUpperCase().substring(0, 3)}-${faker.string.alphanumeric(5).toUpperCase()}`,
      description: `${projectName} - Professional services engagement`,
      status: faker.helpers.arrayElement(['in_progress', 'completed', 'on_hold']),
      type: projectType,
      startDate,
      endDate,
      fee: faker.number.int({
        min: feeRange.min * multiplier,
        max: feeRange.max * multiplier,
      }),
      currency: country === 'US' ? 'USD' : 'NGN',
      billingType: faker.helpers.arrayElement(['fixed_fee', 'hourly', 'monthly_retainer']),
      hourlyRate:
        projectType === 'consulting'
          ? faker.number.int({ min: 150 * multiplier, max: 500 * multiplier })
          : null,
    };
  },
};

// Export all accounting firm configurations
export const ACCOUNTING_FIRM_DATA = {
  config: ACCOUNTING_FIRM_CONFIG,
  scenarios: ACCOUNTING_FIRM_SCENARIOS,
  bankAccounts: ACCOUNTING_FIRM_BANK_ACCOUNTS,
  transactions: ACCOUNTING_FIRM_TRANSACTIONS,
  contacts: ACCOUNTING_FIRM_CONTACTS,
  projects: ACCOUNTING_FIRM_PROJECTS,
};
