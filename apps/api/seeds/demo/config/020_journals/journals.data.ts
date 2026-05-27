export type JournalSeedScenario = {
  key: string;
  title: string;
  description?: string;
  note?: string;
  status: 'draft' | 'posted';
  daysAgo: number;
  amount: number;
  debitHints: string[];
  creditHints: string[];
  splitDebit?: boolean;
  useProject?: boolean;
  useContact?: boolean;
  reference?: string;
  autoReversalDays?: number;
  fx?: boolean;
  action?: 'void' | 'reverse';
};

export type RecurringTemplateSeed = {
  key: string;
  description: string;
  title?: string;
  note?: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  status?: 'draft' | 'active' | 'paused' | 'closed';
  startOffsetDays: number;
  sampleRunOffsetDays: number;
  autoPost?: boolean;
  autoReversalDays?: number;
  amount: number;
  debitHints: string[];
  creditHints: string[];
  useContact?: boolean;
  entryDescriptionDebit?: string;
  entryDescriptionCredit?: string;
};

export const JOURNAL_SEED_SCENARIOS: JournalSeedScenario[] = [
  {
    key: 'rent-accrual',
    title: 'Rent accrual',
    description: 'Monthly office rent accrual for HQ',
    note: 'Accrued at month end.',
    status: 'posted',
    daysAgo: 32,
    amount: 4200,
    debitHints: ['rent', 'lease', 'occupancy'],
    creditHints: ['accrued', 'payable', 'liability'],
    splitDebit: true,
    useContact: true,
  },
  {
    key: 'payroll-accrual',
    title: 'Payroll accrual',
    description: 'Bi-weekly payroll accrual',
    status: 'posted',
    daysAgo: 10,
    amount: 9800,
    debitHints: ['payroll', 'wages', 'salary'],
    creditHints: ['payable', 'liability'],
    useContact: true,
    useProject: true,
  },
  {
    key: 'depreciation',
    title: 'Depreciation',
    description: 'Monthly depreciation',
    note: 'Straight-line depreciation.',
    status: 'posted',
    daysAgo: 75,
    amount: 1500,
    debitHints: ['depreciation'],
    creditHints: ['accumulated', 'depr'],
  },
  {
    key: 'prepaid-amortization',
    title: 'Prepaid expense amortization',
    description: 'Amortize prepaid software subscription',
    status: 'draft',
    daysAgo: 20,
    amount: 1200,
    debitHints: ['amortization', 'expense'],
    creditHints: ['prepaid'],
  },
  {
    key: 'revenue-recognition',
    title: 'Revenue recognition',
    description: 'Recognize deferred revenue',
    status: 'draft',
    daysAgo: 5,
    amount: 7600,
    debitHints: ['deferred', 'unearned'],
    creditHints: ['revenue', 'sales'],
    useContact: true,
    reference: 'DRAFT-REV-{{COMPANY}}',
  },
  {
    key: 'fx-revaluation',
    title: 'FX revaluation',
    description: 'Period-end FX revaluation',
    note: 'Foreign currency revaluation.',
    status: 'posted',
    daysAgo: 40,
    amount: 3000,
    debitHints: ['cash', 'bank', 'receivable'],
    creditHints: ['gain', 'loss', 'revaluation', 'income'],
    fx: true,
  },
  {
    key: 'auto-reversal',
    title: 'Accrual with auto-reversal',
    description: 'Accrual that auto-reverses next period',
    note: 'Auto-reverses next period.',
    status: 'posted',
    daysAgo: 2,
    amount: 2200,
    debitHints: ['expense', 'consulting', 'services'],
    creditHints: ['accrued', 'payable'],
    autoReversalDays: 14,
  },
  {
    key: 'voided-draft',
    title: 'Draft correction',
    description: 'Draft corrected and voided',
    status: 'draft',
    daysAgo: 3,
    amount: 500,
    debitHints: ['office', 'supplies'],
    creditHints: ['payable', 'liability'],
    action: 'void',
    reference: 'DRAFT-VOID-{{COMPANY}}',
  },
  {
    key: 'reversal-source',
    title: 'Bank fee reclass',
    description: 'Reclass bank fees',
    note: 'Reversal example.',
    status: 'posted',
    daysAgo: 15,
    amount: 1800,
    debitHints: ['fees', 'bank'],
    creditHints: ['cash', 'bank'],
    action: 'reverse',
  },
];

export const RECURRING_TEMPLATE_SEEDS: RecurringTemplateSeed[] = [
  {
    key: 'monthly-rent',
    description: 'Monthly office rent',
    title: 'Office rent - [Month Year]',
    note: 'Recurring rent accrual for [Month Year]',
    frequency: 'monthly',
    status: 'active',
    startOffsetDays: -120,
    sampleRunOffsetDays: -7,
    autoPost: true,
    autoReversalDays: 15,
    amount: 4500,
    debitHints: ['rent', 'lease', 'occupancy'],
    creditHints: ['accrued', 'payable', 'liability'],
    useContact: true,
    entryDescriptionDebit: 'Rent expense - [Month Year]',
    entryDescriptionCredit: 'Accrued rent - [Month Year]',
  },
  {
    key: 'saas-subscriptions',
    description: 'SaaS subscriptions',
    title: 'SaaS subscriptions - [Month Year]',
    note: 'Monthly SaaS amortization',
    frequency: 'monthly',
    status: 'paused',
    startOffsetDays: -90,
    sampleRunOffsetDays: -25,
    autoPost: false,
    amount: 900,
    debitHints: ['software', 'subscription', 'expense'],
    creditHints: ['prepaid', 'asset'],
    entryDescriptionDebit: 'SaaS expense - [Month Year]',
    entryDescriptionCredit: 'Prepaid SaaS - [Month Year]',
  },
];
