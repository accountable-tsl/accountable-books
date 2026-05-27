// Mock data for investor demo

export interface Client {
  id: string;
  name: string;
  industry: string;
  transactionCount: number;
  categorizedCount: number;
  lastActivity: string;
  status: 'active' | 'review_needed';
}

export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'debit' | 'credit';
  bankAccount: string;
  status: 'uncategorized' | 'ai_suggested' | 'approved' | 'posted';
  aiSuggestion?: AISuggestion;
  approvedCategory?: string;
}

export interface AISuggestion {
  category: string;
  accountCode: string;
  confidence: number;
  reasoning: string;
  similarTransactions: SimilarTransaction[];
  alternativeSuggestions: AlternativeSuggestion[];
}

export interface SimilarTransaction {
  description: string;
  amount: number;
  date: string;
  category: string;
}

export interface AlternativeSuggestion {
  category: string;
  accountCode: string;
  confidence: number;
}

export interface CategorySummary {
  category: string;
  accountCode: string;
  total: number;
  count: number;
  transactions: Transaction[];
}

// Clients for the accounting firm
export const clients: Client[] = [
  {
    id: '1',
    name: 'Sunrise Coffee Co.',
    industry: 'Food & Beverage',
    transactionCount: 234,
    categorizedCount: 198,
    lastActivity: '2 hours ago',
    status: 'review_needed',
  },
  {
    id: '2',
    name: 'TechFlow Solutions',
    industry: 'Technology',
    transactionCount: 156,
    categorizedCount: 156,
    lastActivity: '1 day ago',
    status: 'active',
  },
  {
    id: '3',
    name: 'Green Valley Landscaping',
    industry: 'Services',
    transactionCount: 89,
    categorizedCount: 72,
    lastActivity: '3 hours ago',
    status: 'review_needed',
  },
  {
    id: '4',
    name: 'Metro Medical Clinic',
    industry: 'Healthcare',
    transactionCount: 312,
    categorizedCount: 312,
    lastActivity: '5 hours ago',
    status: 'active',
  },
];

// Transactions for Sunrise Coffee Co.
export const transactions: Transaction[] = [
  {
    id: 't1',
    date: '2024-01-15',
    description: 'SYSCO FOODS #4521 DALLAS TX',
    amount: 2847.5,
    type: 'debit',
    bankAccount: 'Chase Business Checking',
    status: 'ai_suggested',
    aiSuggestion: {
      category: 'Cost of Goods Sold - Food & Ingredients',
      accountCode: '5010',
      confidence: 96,
      reasoning:
        'SYSCO is a major food service distributor. This merchant has appeared 12 times in the last 6 months, always categorized as COGS - Food & Ingredients. Amount is consistent with typical inventory purchases ($2,000-$4,000 range).',
      similarTransactions: [
        {
          description: 'SYSCO FOODS #4521 DALLAS TX',
          amount: 3102.25,
          date: '2023-12-18',
          category: 'COGS - Food & Ingredients',
        },
        {
          description: 'SYSCO FOODS #4521 DALLAS TX',
          amount: 2654.0,
          date: '2023-12-04',
          category: 'COGS - Food & Ingredients',
        },
        {
          description: 'SYSCO FOODS #4521 DALLAS TX',
          amount: 2891.75,
          date: '2023-11-20',
          category: 'COGS - Food & Ingredients',
        },
      ],
      alternativeSuggestions: [
        {
          category: 'Inventory Purchases',
          accountCode: '1400',
          confidence: 12,
        },
        { category: 'Operating Supplies', accountCode: '5030', confidence: 4 },
      ],
    },
  },
  {
    id: 't2',
    date: '2024-01-15',
    description: 'SQ *BLUE BOTTLE COFFEE BEANS',
    amount: 892.0,
    type: 'debit',
    bankAccount: 'Chase Business Checking',
    status: 'ai_suggested',
    aiSuggestion: {
      category: 'Cost of Goods Sold - Beverages',
      accountCode: '5015',
      confidence: 94,
      reasoning:
        'Square merchant selling coffee beans - core inventory for a coffee shop. Pattern matches previous coffee bean purchases. Blue Bottle is a known wholesale coffee supplier.',
      similarTransactions: [
        {
          description: 'SQ *BLUE BOTTLE COFFEE BEANS',
          amount: 945.0,
          date: '2023-12-28',
          category: 'COGS - Beverages',
        },
        {
          description: 'SQ *COUNTER CULTURE COFFEE',
          amount: 756.0,
          date: '2023-12-15',
          category: 'COGS - Beverages',
        },
      ],
      alternativeSuggestions: [
        {
          category: 'COGS - Food & Ingredients',
          accountCode: '5010',
          confidence: 18,
        },
        { category: 'Office Supplies', accountCode: '6010', confidence: 2 },
      ],
    },
  },
  {
    id: 't3',
    date: '2024-01-14',
    description: 'GUSTO PAYROLL 230115',
    amount: 8924.67,
    type: 'debit',
    bankAccount: 'Chase Business Checking',
    status: 'ai_suggested',
    aiSuggestion: {
      category: 'Payroll Expenses - Wages',
      accountCode: '6200',
      confidence: 99,
      reasoning:
        'GUSTO is a payroll provider. Transaction code 230115 indicates payroll run date. Amount is consistent with bi-weekly payroll history ($8,500-$9,500). This is a recurring payroll transaction.',
      similarTransactions: [
        {
          description: 'GUSTO PAYROLL 230101',
          amount: 8924.67,
          date: '2024-01-01',
          category: 'Payroll Expenses',
        },
        {
          description: 'GUSTO PAYROLL 221215',
          amount: 8756.42,
          date: '2023-12-15',
          category: 'Payroll Expenses',
        },
        {
          description: 'GUSTO PAYROLL 221201',
          amount: 8756.42,
          date: '2023-12-01',
          category: 'Payroll Expenses',
        },
      ],
      alternativeSuggestions: [
        { category: 'Payroll Taxes', accountCode: '6210', confidence: 8 },
      ],
    },
  },
  {
    id: 't4',
    date: '2024-01-14',
    description: 'COMCAST BUSINESS SVC 800-934-6489',
    amount: 189.99,
    type: 'debit',
    bankAccount: 'Chase Business Checking',
    status: 'ai_suggested',
    aiSuggestion: {
      category: 'Utilities - Internet & Phone',
      accountCode: '6320',
      confidence: 98,
      reasoning:
        'Comcast Business is an internet/phone provider. Recurring monthly charge. Amount has been consistent at $189.99 for the past 8 months.',
      similarTransactions: [
        {
          description: 'COMCAST BUSINESS SVC',
          amount: 189.99,
          date: '2023-12-14',
          category: 'Utilities',
        },
        {
          description: 'COMCAST BUSINESS SVC',
          amount: 189.99,
          date: '2023-11-14',
          category: 'Utilities',
        },
      ],
      alternativeSuggestions: [
        { category: 'Office Expenses', accountCode: '6010', confidence: 5 },
      ],
    },
  },
  {
    id: 't5',
    date: '2024-01-13',
    description: 'ADOBE *CREATIVE CLD 800-833-6687',
    amount: 54.99,
    type: 'debit',
    bankAccount: 'Chase Business Checking',
    status: 'ai_suggested',
    aiSuggestion: {
      category: 'Software Subscriptions',
      accountCode: '6350',
      confidence: 97,
      reasoning:
        'Adobe Creative Cloud subscription. Recurring monthly software expense. Used for marketing materials and menu design based on transaction history.',
      similarTransactions: [
        {
          description: 'ADOBE *CREATIVE CLD',
          amount: 54.99,
          date: '2023-12-13',
          category: 'Software Subscriptions',
        },
        {
          description: 'ADOBE *CREATIVE CLD',
          amount: 54.99,
          date: '2023-11-13',
          category: 'Software Subscriptions',
        },
      ],
      alternativeSuggestions: [
        { category: 'Marketing Expenses', accountCode: '6400', confidence: 15 },
      ],
    },
  },
  {
    id: 't6',
    date: '2024-01-13',
    description: 'AMZN MKTP US*2K8YH1QZ3',
    amount: 127.84,
    type: 'debit',
    bankAccount: 'Chase Business Checking',
    status: 'ai_suggested',
    aiSuggestion: {
      category: 'Office Supplies',
      accountCode: '6010',
      confidence: 72,
      reasoning:
        'Amazon Marketplace purchase. Without receipt details, categorizing as Office Supplies based on amount range and business purchase patterns. Consider attaching receipt for more accurate categorization.',
      similarTransactions: [
        {
          description: 'AMZN MKTP US*1J7KL9M2',
          amount: 89.42,
          date: '2023-12-20',
          category: 'Office Supplies',
        },
        {
          description: 'AMZN MKTP US*3N5PQ8R1',
          amount: 234.56,
          date: '2023-11-28',
          category: 'Operating Supplies',
        },
      ],
      alternativeSuggestions: [
        { category: 'Operating Supplies', accountCode: '5030', confidence: 45 },
        { category: 'Equipment - Small', accountCode: '1520', confidence: 22 },
      ],
    },
  },
  {
    id: 't7',
    date: '2024-01-12',
    description: 'TEXAS WORKFORCE COMMISSION',
    amount: 342.18,
    type: 'debit',
    bankAccount: 'Chase Business Checking',
    status: 'ai_suggested',
    aiSuggestion: {
      category: 'Payroll Taxes - State Unemployment',
      accountCode: '6215',
      confidence: 99,
      reasoning:
        'Texas Workforce Commission handles state unemployment insurance. This is a quarterly SUTA payment. Amount aligns with Q4 payroll totals and TX unemployment rate.',
      similarTransactions: [
        {
          description: 'TEXAS WORKFORCE COMMISSION',
          amount: 318.42,
          date: '2023-10-12',
          category: 'Payroll Taxes',
        },
        {
          description: 'TEXAS WORKFORCE COMMISSION',
          amount: 298.67,
          date: '2023-07-14',
          category: 'Payroll Taxes',
        },
      ],
      alternativeSuggestions: [],
    },
  },
  {
    id: 't8',
    date: '2024-01-12',
    description: 'STRIPE TRANSFER 4829104',
    amount: 4521.33,
    type: 'credit',
    bankAccount: 'Chase Business Checking',
    status: 'ai_suggested',
    aiSuggestion: {
      category: 'Sales Revenue - Credit Card',
      accountCode: '4010',
      confidence: 98,
      reasoning:
        'Stripe payout for credit card sales. This is a deposit of processed card transactions minus Stripe fees. Matches POS sales data from connected Square terminal.',
      similarTransactions: [
        {
          description: 'STRIPE TRANSFER 4829091',
          amount: 5102.87,
          date: '2024-01-10',
          category: 'Sales Revenue',
        },
        {
          description: 'STRIPE TRANSFER 4829078',
          amount: 4891.22,
          date: '2024-01-08',
          category: 'Sales Revenue',
        },
      ],
      alternativeSuggestions: [
        { category: 'Other Income', accountCode: '4900', confidence: 3 },
      ],
    },
  },
  {
    id: 't9',
    date: '2024-01-11',
    description: 'CHECK #1247 - DOWNTOWN PROPERTY MGMT',
    amount: 3200.0,
    type: 'debit',
    bankAccount: 'Chase Business Checking',
    status: 'ai_suggested',
    aiSuggestion: {
      category: 'Rent Expense',
      accountCode: '6100',
      confidence: 95,
      reasoning:
        'Check payment to property management company. Amount matches lease agreement for retail space. Recurring monthly rent payment.',
      similarTransactions: [
        {
          description: 'CHECK #1246 - DOWNTOWN PROPERTY MGMT',
          amount: 3200.0,
          date: '2023-12-11',
          category: 'Rent Expense',
        },
        {
          description: 'CHECK #1245 - DOWNTOWN PROPERTY MGMT',
          amount: 3200.0,
          date: '2023-11-10',
          category: 'Rent Expense',
        },
      ],
      alternativeSuggestions: [
        { category: 'Lease Expense', accountCode: '6110', confidence: 12 },
      ],
    },
  },
  {
    id: 't10',
    date: '2024-01-11',
    description: 'POS DEPOSIT 01/10',
    amount: 1847.5,
    type: 'credit',
    bankAccount: 'Chase Business Checking',
    status: 'ai_suggested',
    aiSuggestion: {
      category: 'Sales Revenue - Cash',
      accountCode: '4000',
      confidence: 94,
      reasoning:
        'Point of sale cash deposit. Represents daily cash register reconciliation. Amount is typical for weekday cash sales ($1,500-$2,500).',
      similarTransactions: [
        {
          description: 'POS DEPOSIT 01/09',
          amount: 2103.25,
          date: '2024-01-10',
          category: 'Sales Revenue - Cash',
        },
        {
          description: 'POS DEPOSIT 01/08',
          amount: 1654.0,
          date: '2024-01-09',
          category: 'Sales Revenue - Cash',
        },
      ],
      alternativeSuggestions: [
        { category: 'Other Income', accountCode: '4900', confidence: 5 },
      ],
    },
  },
  {
    id: 't11',
    date: '2024-01-10',
    description: 'WEBFLOW INC 888-913-2809',
    amount: 29.0,
    type: 'debit',
    bankAccount: 'Chase Business Checking',
    status: 'uncategorized',
  },
  {
    id: 't12',
    date: '2024-01-10',
    description: 'STAPLES DIRECT #07294',
    amount: 234.56,
    type: 'debit',
    bankAccount: 'Chase Business Checking',
    status: 'posted',
    approvedCategory: 'Office Supplies',
  },
  {
    id: 't13',
    date: '2024-01-09',
    description: 'WASTE MANAGEMENT 800-963-4776',
    amount: 275.0,
    type: 'debit',
    bankAccount: 'Chase Business Checking',
    status: 'posted',
    approvedCategory: 'Utilities - Waste Disposal',
  },
  {
    id: 't14',
    date: '2024-01-09',
    description: 'ONCOR ELECTRIC DELIVERY',
    amount: 487.32,
    type: 'debit',
    bankAccount: 'Chase Business Checking',
    status: 'posted',
    approvedCategory: 'Utilities - Electric',
  },
  {
    id: 't15',
    date: '2024-01-08',
    description: 'STRIPE TRANSFER 4829078',
    amount: 4891.22,
    type: 'credit',
    bankAccount: 'Chase Business Checking',
    status: 'posted',
    approvedCategory: 'Sales Revenue',
  },
];

// P&L Data
export const profitAndLoss = {
  period: 'January 2024',
  revenue: [
    {
      account: 'Sales Revenue - Credit Card',
      code: '4010',
      amount: 45210.33,
      count: 12,
    },
    {
      account: 'Sales Revenue - Cash',
      code: '4000',
      amount: 18475.0,
      count: 15,
    },
    { account: 'Catering Revenue', code: '4020', amount: 3500.0, count: 2 },
  ],
  cogs: [
    {
      account: 'COGS - Food & Ingredients',
      code: '5010',
      amount: 12847.5,
      count: 8,
    },
    { account: 'COGS - Beverages', code: '5015', amount: 4892.0, count: 6 },
    { account: 'COGS - Packaging', code: '5020', amount: 1234.56, count: 4 },
  ],
  expenses: [
    { account: 'Payroll Expenses', code: '6200', amount: 17849.34, count: 2 },
    { account: 'Rent Expense', code: '6100', amount: 3200.0, count: 1 },
    { account: 'Utilities', code: '6300', amount: 952.31, count: 4 },
    {
      account: 'Software Subscriptions',
      code: '6350',
      amount: 283.98,
      count: 5,
    },
    { account: 'Office Supplies', code: '6010', amount: 362.4, count: 3 },
    { account: 'Payroll Taxes', code: '6210', amount: 1842.18, count: 3 },
    { account: 'Marketing', code: '6400', amount: 450.0, count: 2 },
  ],
};

export function getStats() {
  const total = transactions.length;
  const aiSuggested = transactions.filter(
    (t) => t.status === 'ai_suggested',
  ).length;
  const posted = transactions.filter((t) => t.status === 'posted').length;
  const needsReview = transactions.filter(
    (t) => t.status === 'uncategorized',
  ).length;

  const highConfidence = transactions.filter(
    (t) => t.aiSuggestion && t.aiSuggestion.confidence >= 90,
  ).length;

  return {
    total,
    aiSuggested,
    posted,
    needsReview,
    highConfidence,
    automationRate: Math.round(((aiSuggested + posted) / total) * 100),
  };
}
