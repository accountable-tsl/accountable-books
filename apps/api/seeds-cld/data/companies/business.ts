import { faker } from '@faker-js/faker';
import type { CompanyTypeConfig, DataScenario } from '../../utils/types.js';

export const BUSINESS_CONFIG: CompanyTypeConfig = {
  type: 'business',
  displayName: 'Business/Company',
  defaultScenarios: ['tech-startup', 'digital-business'],
  requiredData: ['bank-accounts', 'transactions', 'contacts', 'projects'],
  optionalData: ['journal-entries', 'recurring-templates'],
  businessRules: {
    minBankAccounts: 2, // Business Checking + Savings minimum
    maxBankAccounts: 6, // Multiple accounts for different purposes
    typicalTransactionVolume: 300, // ~300 transactions per month
    commonContactTypes: ['customer', 'supplier', 'vendor', 'service_provider', 'employee'],
    projectsRequired: true,
  },
};

// Business-specific data scenarios
export const BUSINESS_SCENARIOS: Record<string, DataScenario> = {
  'tech-startup': {
    name: 'Technology Startup',
    description: 'Growing technology company with SaaS revenue and typical startup expenses',
    dataGenerators: [
      'business-bank-accounts',
      'startup-transactions',
      'tech-contacts',
      'development-projects',
    ],
    volume: {
      transactions: 400, // Higher volume for active business
      contacts: 35, // Mix of customers, vendors, employees
      projects: 8, // Active development projects
      monthsOfData: 18, // 1.5 years of operational data
    },
  },
  'digital-business': {
    name: 'Digital Business',
    description: 'Established digital services company with recurring revenue',
    dataGenerators: [
      'business-bank-accounts',
      'digital-transactions',
      'business-contacts',
      'service-projects',
    ],
    volume: {
      transactions: 350,
      contacts: 40,
      projects: 12,
      monthsOfData: 24, // 2 years of data
    },
  },
};

// Business-specific bank account configurations
export const BUSINESS_BANK_ACCOUNTS = {
  accountTypes: [
    {
      type: 'checkings_current',
      name: 'Business Checking',
      priority: 1,
      balance: { min: 5000, max: 100000 },
      required: true,
      purpose: 'Operating account for daily transactions',
    },
    {
      type: 'savings',
      name: 'Business Savings',
      priority: 2,
      balance: { min: 10000, max: 500000 },
      required: true,
      purpose: 'Reserve fund and emergency savings',
    },
    {
      type: 'checkings_current',
      name: 'Payroll Account',
      priority: 3,
      balance: { min: 15000, max: 75000 },
      required: false,
      purpose: 'Dedicated payroll processing',
    },
    {
      type: 'credit_card',
      name: 'Business Credit Card',
      priority: 4,
      balance: { min: -50000, max: 0 },
      required: false,
      purpose: 'Business expenses and credit line',
    },
    {
      type: 'other',
      name: 'Merchant Account',
      priority: 5,
      balance: { min: 2000, max: 25000 },
      required: false,
      purpose: 'Payment processing and settlements',
    },
    {
      type: 'other',
      name: 'Tax Reserve Account',
      priority: 6,
      balance: { min: 5000, max: 100000 },
      required: false,
      purpose: 'Tax obligations and quarterly payments',
    },
  ],

  generateAccounts(country: 'US' | 'NG', scenario: string = 'tech-startup', count: number = 4) {
    const accounts = [];
    const selectedTypes = this.accountTypes.slice(0, Math.min(count, this.accountTypes.length));

    // Adjust balances based on scenario and country
    const multiplier = country === 'US' ? 1 : 800; // Rough USD to NGN conversion
    const scenarioMultiplier = scenario === 'tech-startup' ? 0.7 : 1.2; // Startups have less cash

    return selectedTypes.map((config, index) => ({
      displayName: config.name,
      accountType: config.type,
      businessOrPersonal: 'business' as const,
      balance: faker.number.int({
        min: config.balance.min * multiplier * scenarioMultiplier,
        max: config.balance.max * multiplier * scenarioMultiplier,
      }),
      currency: country === 'US' ? 'USD' : 'NGN',
      description: config.purpose,
      isDefault: index === 0,
    }));
  },
};

// Business transaction patterns
export const BUSINESS_TRANSACTIONS = {
  categories: [
    // Revenue
    { name: 'Software License Revenue', type: 'income', frequency: 'monthly' },
    { name: 'Consulting Revenue', type: 'income', frequency: 'irregular' },
    { name: 'Subscription Revenue', type: 'income', frequency: 'monthly' },
    { name: 'Project Revenue', type: 'income', frequency: 'milestone' },
    { name: 'Commission Income', type: 'income', frequency: 'irregular' },

    // Operational Expenses
    { name: 'Payroll', type: 'expense', frequency: 'monthly' },
    { name: 'Office Rent', type: 'expense', frequency: 'monthly' },
    { name: 'Software Subscriptions', type: 'expense', frequency: 'monthly' },
    { name: 'Cloud Hosting', type: 'expense', frequency: 'monthly' },
    { name: 'Internet & Phone', type: 'expense', frequency: 'monthly' },
    { name: 'Insurance', type: 'expense', frequency: 'monthly' },
    { name: 'Legal & Professional', type: 'expense', frequency: 'quarterly' },
    { name: 'Marketing & Advertising', type: 'expense', frequency: 'irregular' },
    { name: 'Travel & Entertainment', type: 'expense', frequency: 'irregular' },
    { name: 'Office Supplies', type: 'expense', frequency: 'monthly' },
    { name: 'Equipment Purchase', type: 'expense', frequency: 'irregular' },
    { name: 'Training & Development', type: 'expense', frequency: 'quarterly' },

    // Taxes and Compliance
    { name: 'Income Tax', type: 'expense', frequency: 'quarterly' },
    { name: 'Payroll Tax', type: 'expense', frequency: 'monthly' },
    { name: 'Sales Tax', type: 'expense', frequency: 'monthly' },
    { name: 'Business License', type: 'expense', frequency: 'yearly' },
  ],

  generateTransactionPattern(country: 'US' | 'NG', scenario: string = 'tech-startup') {
    const currency = country === 'US' ? 'USD' : 'NGN';
    const multiplier = currency === 'USD' ? 1 : 800;
    const scenarioMultiplier = scenario === 'tech-startup' ? 0.6 : 1.0; // Startups typically smaller scale

    return {
      revenue: {
        subscription: {
          amount: {
            min: 15000 * multiplier * scenarioMultiplier,
            max: 80000 * multiplier * scenarioMultiplier,
          },
          frequency: 'monthly',
          growth: 0.05, // 5% monthly growth
          churn: 0.02, // 2% monthly churn
        },
        consulting: {
          amount: {
            min: 25000 * multiplier * scenarioMultiplier,
            max: 150000 * multiplier * scenarioMultiplier,
          },
          frequency: 'irregular',
          probability: 0.7, // 70% chance per month
        },
        projects: {
          amount: {
            min: 50000 * multiplier * scenarioMultiplier,
            max: 300000 * multiplier * scenarioMultiplier,
          },
          frequency: 'milestone',
          probability: 0.3, // 30% chance per month
        },
      },
      expenses: {
        payroll: {
          amount: {
            min: 30000 * multiplier * scenarioMultiplier,
            max: 120000 * multiplier * scenarioMultiplier,
          },
          frequency: 'monthly',
          day: faker.number.int({ min: 1, max: 5 }),
        },
        rent: {
          amount: {
            min: 5000 * multiplier * scenarioMultiplier,
            max: 25000 * multiplier * scenarioMultiplier,
          },
          frequency: 'monthly',
          day: 1,
        },
        software: {
          amount: {
            min: 2000 * multiplier * scenarioMultiplier,
            max: 15000 * multiplier * scenarioMultiplier,
          },
          frequency: 'monthly',
          variance: 0.2,
        },
        hosting: {
          amount: {
            min: 500 * multiplier * scenarioMultiplier,
            max: 5000 * multiplier * scenarioMultiplier,
          },
          frequency: 'monthly',
          day: faker.number.int({ min: 1, max: 28 }),
        },
        marketing: {
          amount: {
            min: 3000 * multiplier * scenarioMultiplier,
            max: 25000 * multiplier * scenarioMultiplier,
          },
          frequency: 'irregular',
          probability: 0.8, // 80% chance per month
        },
      },
    };
  },
};

// Business contact types
export const BUSINESS_CONTACTS = {
  contactTypes: [
    'customer',
    'supplier',
    'vendor',
    'employee',
    'contractor',
    'partner',
    'investor',
    'advisor',
    'service_provider',
    'government',
  ],

  generateContacts(country: 'US' | 'NG', scenario: string = 'tech-startup', count: number = 35) {
    const contacts = [];

    // Customers (40% of contacts)
    const customerCount = Math.floor(count * 0.4);
    for (let i = 0; i < customerCount; i++) {
      contacts.push(this.generateCustomer(country, scenario));
    }

    // Vendors/Suppliers (25% of contacts)
    const vendorCount = Math.floor(count * 0.25);
    for (let i = 0; i < vendorCount; i++) {
      contacts.push(this.generateVendor(country, scenario));
    }

    // Service Providers (20% of contacts)
    const serviceCount = Math.floor(count * 0.2);
    for (let i = 0; i < serviceCount; i++) {
      contacts.push(this.generateServiceProvider(country));
    }

    // Employees/Contractors (15% of contacts)
    const employeeCount = count - contacts.length;
    for (let i = 0; i < employeeCount; i++) {
      contacts.push(this.generateEmployee(country));
    }

    return contacts;
  },

  generateCustomer(country: 'US' | 'NG', scenario: string) {
    const isEnterprise = faker.datatype.boolean({ probability: 0.3 });

    if (isEnterprise) {
      return {
        displayName: `${faker.company.name()} ${country === 'US' ? 'Inc.' : 'Ltd'}`,
        email: faker.internet.email(),
        phone: this.generateBusinessPhone(country),
        address: this.generateBusinessAddress(country),
        type: 'customer',
        contactPerson: faker.person.fullName(),
        notes: `Enterprise customer - ${scenario === 'tech-startup' ? 'early adopter' : 'established client'}`,
        revenue: faker.number.int({ min: 10000, max: 500000 }), // Annual contract value
      };
    } else {
      return {
        displayName: faker.company.name(),
        email: faker.internet.email(),
        phone: this.generateBusinessPhone(country),
        type: 'customer',
        contactPerson: faker.person.fullName(),
        notes: `SMB customer - ${faker.helpers.arrayElement(['monthly subscription', 'project-based', 'consulting client'])}`,
        revenue: faker.number.int({ min: 2000, max: 50000 }),
      };
    }
  },

  generateVendor(country: 'US' | 'NG', scenario: string) {
    const vendorTypes =
      country === 'US'
        ? [
            'AWS',
            'Microsoft Azure',
            'Google Cloud',
            'Stripe',
            'Salesforce',
            'HubSpot',
            'Slack',
            'Zoom',
            'Adobe',
            'Atlassian',
          ]
        : [
            'Flutterwave',
            'Paystack',
            'Interswitch',
            'Whogohost',
            'Microsoft Nigeria',
            'MTN Business',
            'Airtel Business',
            'MainOne',
            'SystemSpecs',
            'Seamfix',
          ];

    const vendorName = faker.helpers.arrayElement(vendorTypes);
    return {
      displayName: vendorName,
      email: `billing@${vendorName.toLowerCase().replace(/\s+/g, '')}.com`,
      phone: this.generateBusinessPhone(country),
      type: 'vendor',
      category: faker.helpers.arrayElement(['software', 'infrastructure', 'marketing', 'payment']),
      notes: `Software/service vendor - ${faker.helpers.arrayElement(['monthly subscription', 'usage-based billing', 'annual contract'])}`,
      monthlyCost: faker.number.int({ min: 100, max: 5000 }),
    };
  },

  generateServiceProvider(country: 'US' | 'NG') {
    const serviceTypes =
      country === 'US'
        ? [
            'Legal Counsel',
            'Accounting Firm',
            'Marketing Agency',
            'IT Support',
            'HR Consulting',
            'Insurance Broker',
            'Banking Relationship',
          ]
        : [
            'Legal Chambers',
            'Audit Firm',
            'Marketing Agency',
            'IT Support Lagos',
            'HR Consulting',
            'Insurance Broker',
            'Bank Relationship Manager',
          ];

    const serviceName = faker.helpers.arrayElement(serviceTypes);
    return {
      displayName: serviceName,
      email: faker.internet.email(),
      phone: this.generateBusinessPhone(country),
      type: 'service_provider',
      contactPerson: faker.person.fullName(),
      specialization: faker.helpers.arrayElement(['legal', 'financial', 'marketing', 'operations']),
      notes: `Professional service provider - ${serviceName.toLowerCase()}`,
    };
  },

  generateEmployee(country: 'US' | 'NG') {
    const roles = [
      'Software Developer',
      'Product Manager',
      'Sales Representative',
      'Marketing Coordinator',
      'Customer Success',
      'Operations Manager',
    ];

    return {
      displayName: faker.person.fullName(),
      email: faker.internet.email(),
      phone: this.generatePersonalPhone(country),
      type: 'employee',
      jobTitle: faker.helpers.arrayElement(roles),
      department: faker.helpers.arrayElement(['Engineering', 'Sales', 'Marketing', 'Operations']),
      notes: `Employee - ${faker.helpers.arrayElement(['full-time', 'part-time', 'contractor'])}`,
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
      const states = ['CA', 'NY', 'TX', 'FL', 'WA', 'IL', 'PA', 'OH'];
      const state = faker.helpers.arrayElement(states);
      return {
        street: faker.location.streetAddress(),
        city: faker.location.city(),
        state: state,
        zipCode: faker.location.zipCode(),
        country: 'US',
      };
    } else {
      const states = ['Lagos', 'Abuja', 'Rivers', 'Kano', 'Ogun', 'Kaduna'];
      const state = faker.helpers.arrayElement(states);
      return {
        street: `${faker.number.int({ min: 1, max: 999 })} ${faker.location.streetName()} Street`,
        city:
          state === 'Lagos'
            ? faker.helpers.arrayElement(['Ikeja', 'Victoria Island', 'Lekki', 'Surulere'])
            : state,
        state: state,
        country: 'Nigeria',
      };
    }
  },
};

// Business project types
export const BUSINESS_PROJECTS = {
  projectTypes: [
    'product_development',
    'marketing_campaign',
    'client_project',
    'internal_process',
    'compliance',
    'research',
  ],

  generateProjects(country: 'US' | 'NG', scenario: string = 'tech-startup', count: number = 8) {
    const projects = [];

    for (let i = 0; i < count; i++) {
      projects.push(this.generateProject(country, scenario));
    }

    return projects;
  },

  generateProject(country: 'US' | 'NG', scenario: string) {
    const projectTemplates =
      scenario === 'tech-startup'
        ? [
            'Mobile App Development',
            'Platform Migration',
            'Customer Onboarding System',
            'Payment Integration',
            'Analytics Dashboard',
            'Security Audit',
            'Marketing Website',
            'API Documentation',
          ]
        : [
            'E-commerce Platform',
            'Client Portal Development',
            'Digital Transformation',
            'Process Automation',
            'Data Analytics Project',
            'Compliance Implementation',
            'Brand Redesign',
            'System Integration',
          ];

    const projectName = faker.helpers.arrayElement(projectTemplates);
    const startDate = faker.date.past({ years: 1 });
    const duration = faker.number.int({ min: 30, max: 365 }); // 1 month to 1 year
    const endDate = new Date(startDate.getTime() + duration * 24 * 60 * 60 * 1000);

    return {
      name: projectName,
      code: faker.string.alphanumeric(8).toUpperCase(),
      description: `${projectName} - ${faker.company.buzzPhrase()}`,
      status: faker.helpers.arrayElement(['in_progress', 'completed', 'on_hold', 'cancelled']),
      startDate,
      endDate,
      budget: faker.number.int({
        min: country === 'US' ? 10000 : 8000000,
        max: country === 'US' ? 200000 : 160000000,
      }),
      currency: country === 'US' ? 'USD' : 'NGN',
    };
  },
};

// Export all business configurations
export const BUSINESS_DATA = {
  config: BUSINESS_CONFIG,
  scenarios: BUSINESS_SCENARIOS,
  bankAccounts: BUSINESS_BANK_ACCOUNTS,
  transactions: BUSINESS_TRANSACTIONS,
  contacts: BUSINESS_CONTACTS,
  projects: BUSINESS_PROJECTS,
};
