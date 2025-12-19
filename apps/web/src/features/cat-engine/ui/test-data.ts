import { groupCategorizationTransactions } from '@/modules/accounting/categorization';
import type {
  CategorizationTransaction,
  CategorizationTransactionStatus,
  GroupedTransaction,
} from '@/modules/accounting/categorization/model/types';

// /**
//  * Test data for categorization engine
//  * Includes various scenarios: single transactions, split transactions, different statuses
//  */
// export const testCategorizationTransactions: GroupedTransaction[] = [
//   // 1. Simple posted transaction (no split)
//   {
//     rowType: 'parent',
//     id: 'txn-001',
//     bankTransactionId: 'BT-20240315-001',
//     bankName: 'Chase Bank',
//     bankLogo: 'https://example.com/chase-logo.png',
//     bankAccountName: 'Business Checking',
//     bankAccountCurrencyCode: 'USD',
//     date: '15 Mar 2024',
//     fsDate: '15 Mar 2024',
//     description: 'Office Supplies Purchase',
//     contactName: 'Staples Inc.',
//     reference: 'INV-789012',
//     projectName: 'Office Upgrade',
//     totalBankAmount: -245.5,
//     exchangeRate: '1.0000',
//     spent: 245.5,
//     received: 0,
//     confidence: 0.95,
//     status: 'posted',
//     coaId: 'COA-6100',
//     coaCode: '6100',
//     coaName: 'Office Supplies',
//   },

//   // 2. Split transaction with mixed statuses (parent proposed, some entries posted)
//   {
//     rowType: 'parent',
//     hasMultipleEntries: true,
//     entryCount: 3,
//     id: 'txn-002',
//     bankTransactionId: 'BT-20240314-456',
//     bankName: 'Bank of America',
//     bankLogo: 'https://example.com/boa-logo.png',
//     bankAccountName: 'Operations Account',
//     bankAccountCurrencyCode: 'USD',
//     date: '14 Mar 2024',
//     fsDate: '14 Mar 2024',
//     description: 'Transaction has multiple entries',
//     contactName: 'Multiple contacts',
//     reference: 'Multiple references',
//     projectName: null,
//     totalBankAmount: -1200.0,
//     exchangeRate: '1.0000',
//     spent: 1200.0,
//     received: 0,
//     confidence: 0.84, // Average of 90, 88, 75
//     status: 'proposed', // Lowest status among entries
//     coaId: null,
//     coaCode: null,
//     coaName: null,
//     entries: [
//       {
//         rowType: 'subRow',
//         id: 'entry-002-1',
//         bankTransactionId: 'BT-20240314-456',
//         bankName: 'Bank of America',
//         bankLogo: 'https://example.com/boa-logo.png',
//         bankAccountName: 'Operations Account',
//         bankAccountCurrencyCode: 'USD',
//         date: '14 Mar 2024',
//         fsDate: '14 Mar 2024',
//         description: 'Laptops for new hires',
//         contactName: 'Amazon.com',
//         reference: 'AMZ-456789',
//         projectName: 'IT Expansion',
//         totalBankAmount: -850.0,
//         exchangeRate: '1.0000',
//         spent: 850.0,
//         received: 0,
//         confidence: 0.9,
//         status: 'posted',
//         coaId: 'COA-5050',
//         coaCode: '5050',
//         coaName: 'Computer Equipment',
//       },
//       {
//         rowType: 'subRow',
//         id: 'entry-002-2',
//         bankTransactionId: 'BT-20240314-456',
//         bankName: 'Bank of America',
//         bankLogo: 'https://example.com/boa-logo.png',
//         bankAccountName: 'Operations Account',
//         bankAccountCurrencyCode: 'USD',
//         date: '14 Mar 2024',
//         fsDate: '14 Mar 2024',
//         description: 'Office furniture',
//         contactName: 'Amazon.com',
//         reference: 'AMZ-456789',
//         projectName: null,
//         totalBankAmount: -300.0,
//         exchangeRate: '1.0000',
//         spent: 300.0,
//         received: 0,
//         confidence: 0.88,
//         status: 'posted',
//         coaId: 'COA-1500',
//         coaCode: '1500',
//         coaName: 'Furniture & Fixtures',
//       },
//       {
//         rowType: 'subRow',
//         id: 'entry-002-3',
//         bankTransactionId: 'BT-20240314-456',
//         bankName: 'Bank of America',
//         bankLogo: 'https://example.com/boa-logo.png',
//         bankAccountName: 'Operations Account',
//         bankAccountCurrencyCode: 'USD',
//         date: '14 Mar 2024',
//         fsDate: '14 Mar 2024',
//         description: 'Miscellaneous supplies',
//         contactName: 'Amazon.com',
//         reference: 'AMZ-456789',
//         projectName: null,
//         totalBankAmount: -50.0,
//         exchangeRate: '1.0000',
//         spent: 50.0,
//         received: 0,
//         confidence: 0.75,
//         status: 'proposed', // This one is still proposed
//         coaId: 'COA-6100',
//         coaCode: '6100',
//         coaName: 'Office Supplies',
//       },
//     ],
//   },

//   // 3. Fully uncategorized transaction
//   {
//     rowType: 'parent',
//     id: 'txn-003',
//     bankTransactionId: 'BT-20240313-789',
//     bankName: 'Wells Fargo',
//     bankLogo: null,
//     bankAccountName: 'Business Savings',
//     bankAccountCurrencyCode: 'USD',
//     date: '13 Mar 2024',
//     fsDate: null,
//     description: 'Payment from ABC Client',
//     contactName: 'ABC Corporation',
//     reference: 'PMT-123',
//     projectName: 'Q1 Consulting',
//     totalBankAmount: 5000.0,
//     exchangeRate: '1.0000',
//     spent: 0,
//     received: 5000.0,
//     confidence: null, // No confidence for uncategorized
//     status: 'uncategorized',
//     coaId: null,
//     coaCode: null,
//     coaName: null,
//   },

//   // 4. Proposed transaction (single entry, awaiting review)
//   {
//     rowType: 'parent',
//     id: 'txn-004',
//     bankTransactionId: 'BT-20240312-345',
//     bankName: 'Citibank',
//     bankLogo: 'https://example.com/citi-logo.png',
//     bankAccountName: 'Credit Card',
//     bankAccountCurrencyCode: 'USD',
//     date: '12 Mar 2024',
//     fsDate: '12 Mar 2024',
//     description: 'Uber Ride to client meeting',
//     contactName: 'Uber Technologies',
//     reference: 'UBER*RIDE*3/10',
//     projectName: 'Client Meeting Travel',
//     totalBankAmount: -32.75,
//     exchangeRate: '1.0000',
//     spent: 32.75,
//     received: 0,
//     confidence: 0.6,
//     status: 'proposed',
//     coaId: 'COA-6700',
//     coaCode: '6700',
//     coaName: 'Travel Expense',
//   },

//   // 5. Split transaction where all entries are proposed
//   {
//     rowType: 'parent',
//     hasMultipleEntries: true,
//     entryCount: 2,
//     id: 'txn-005',
//     bankTransactionId: 'BT-20240311-678',
//     bankName: 'HSBC',
//     bankLogo: 'https://example.com/hsbc-logo.png',
//     bankAccountName: 'Euro Account',
//     bankAccountCurrencyCode: 'EUR',
//     date: '11 Mar 2024',
//     fsDate: '11 Mar 2024',
//     description: 'Transaction has multiple entries',
//     contactName: 'Multiple contacts',
//     reference: 'Multiple references',
//     projectName: 'Employee Training',
//     totalBankAmount: -2000.0,
//     exchangeRate: '1.0850',
//     spent: 2170.0,
//     received: 0,
//     confidence: 0.875, // Average of 90 and 85
//     status: 'proposed', // All entries are proposed
//     coaId: null,
//     coaCode: null,
//     coaName: null,
//     entries: [
//       {
//         rowType: 'subRow',
//         id: 'entry-005-1',
//         bankTransactionId: 'BT-20240311-678',
//         bankName: 'HSBC',
//         bankLogo: 'https://example.com/hsbc-logo.png',
//         bankAccountName: 'Euro Account',
//         bankAccountCurrencyCode: 'EUR',
//         date: '11 Mar 2024',
//         fsDate: '11 Mar 2024',
//         description: 'Conference Ticket - TechConf EU',
//         contactName: 'Tech Conference EU',
//         reference: 'CONF-2024-TICKET',
//         projectName: 'Employee Training',
//         totalBankAmount: -1200.0,
//         exchangeRate: '1.0850',
//         spent: 1302.0,
//         received: 0,
//         confidence: 0.9,
//         status: 'proposed',
//         coaId: 'COA-6800',
//         coaCode: '6800',
//         coaName: 'Training & Development',
//       },
//       {
//         rowType: 'subRow',
//         id: 'entry-005-2',
//         bankTransactionId: 'BT-20240311-678',
//         bankName: 'HSBC',
//         bankLogo: 'https://example.com/hsbc-logo.png',
//         bankAccountName: 'Euro Account',
//         bankAccountCurrencyCode: 'EUR',
//         date: '11 Mar 2024',
//         fsDate: '11 Mar 2024',
//         description: 'Hotel Accommodation',
//         contactName: 'Grand Hotel Paris',
//         reference: 'HOTEL-EU123',
//         projectName: 'Employee Training',
//         totalBankAmount: -800.0,
//         exchangeRate: '1.0850',
//         spent: 868.0,
//         received: 0,
//         confidence: 0.85,
//         status: 'proposed',
//         coaId: 'COA-6750',
//         coaCode: '6750',
//         coaName: 'Accommodation',
//       },
//     ],
//   },

//   // 6. Posted income transaction
//   {
//     rowType: 'parent',
//     id: 'txn-006',
//     bankTransactionId: 'BT-20240310-901',
//     bankName: 'Chase Bank',
//     bankLogo: 'https://example.com/chase-logo.png',
//     bankAccountName: 'Business Checking',
//     bankAccountCurrencyCode: 'USD',
//     date: '10 Mar 2024',
//     fsDate: '10 Mar 2024',
//     description: 'Consulting Services - Q1',
//     contactName: 'XYZ Corporation',
//     reference: 'INV-987654',
//     projectName: 'Q1 Consulting Project',
//     totalBankAmount: 7500.0,
//     exchangeRate: '1.0000',
//     spent: 0,
//     received: 7500.0,
//     confidence: 0.98,
//     status: 'posted',
//     coaId: 'COA-4100',
//     coaCode: '4100',
//     coaName: 'Consulting Revenue',
//   },

//   // 7. Split transaction where parent has uncategorized status (one entry uncategorized)
//   {
//     rowType: 'parent',
//     hasMultipleEntries: true,
//     entryCount: 2,
//     id: 'txn-007',
//     bankTransactionId: 'BT-20240309-234',
//     bankName: 'Bank of America',
//     bankLogo: 'https://example.com/boa-logo.png',
//     bankAccountName: 'Operations Account',
//     bankAccountCurrencyCode: 'USD',
//     date: '09 Mar 2024',
//     fsDate: null,
//     description: 'Transaction has multiple entries',
//     contactName: 'Multiple contacts',
//     reference: 'Multiple references',
//     projectName: null,
//     totalBankAmount: -550.0,
//     exchangeRate: '1.0000',
//     spent: 550.0,
//     received: 0,
//     confidence: null, // Average of 90 and 10 (or null as 0)
//     status: 'uncategorized', // One entry is uncategorized
//     coaId: null,
//     coaCode: null,
//     coaName: null,
//     entries: [
//       {
//         rowType: 'subRow',
//         id: 'entry-007-1',
//         bankTransactionId: 'BT-20240309-234',
//         bankName: 'Bank of America',
//         bankLogo: 'https://example.com/boa-logo.png',
//         bankAccountName: 'Operations Account',
//         bankAccountCurrencyCode: 'USD',
//         date: '09 Mar 2024',
//         fsDate: '09 Mar 2024',
//         description: 'Software Subscription Renewal',
//         contactName: 'Adobe Inc.',
//         reference: 'ADOBE-2024-Q1',
//         projectName: 'Software Licenses',
//         totalBankAmount: -450.0,
//         exchangeRate: '1.0000',
//         spent: 450.0,
//         received: 0,
//         confidence: 0.9,
//         status: 'posted',
//         coaId: 'COA-6300',
//         coaCode: '6300',
//         coaName: 'Software Subscriptions',
//       },
//       {
//         rowType: 'subRow',
//         id: 'entry-007-2',
//         bankTransactionId: 'BT-20240309-234',
//         bankName: 'Bank of America',
//         bankLogo: 'https://example.com/boa-logo.png',
//         bankAccountName: 'Operations Account',
//         bankAccountCurrencyCode: 'USD',
//         date: '09 Mar 2024',
//         fsDate: null,
//         description: 'Miscellaneous expense',
//         contactName: null,
//         reference: null,
//         projectName: null,
//         totalBankAmount: -100.0,
//         exchangeRate: '1.0000',
//         spent: 100.0,
//         received: 0,
//         confidence: 0.1,
//         status: 'uncategorized', // This makes parent uncategorized
//         coaId: null,
//         coaCode: null,
//         coaName: null,
//       },
//     ],
//   },

//   // 8. Recently imported transaction (uncategorized with no confidence)
//   {
//     rowType: 'parent',
//     id: 'txn-008',
//     bankTransactionId: 'BT-20240308-567',
//     bankName: 'Wells Fargo',
//     bankLogo: null,
//     bankAccountName: 'Business Checking',
//     bankAccountCurrencyCode: 'USD',
//     date: '08 Mar 2024',
//     fsDate: null,
//     description: 'Wire Transfer Fee',
//     contactName: 'Wells Fargo',
//     reference: 'WF-WIRE-FEE-001',
//     projectName: null,
//     totalBankAmount: -25.0,
//     exchangeRate: '1.0000',
//     spent: 25.0,
//     received: 0,
//     confidence: null,
//     status: 'uncategorized',
//     coaId: null,
//     coaCode: null,
//     coaName: null,
//   },

//   // // 9. Split transaction all posted (fully categorized)
//   {
//     rowType: 'parent',
//     hasMultipleEntries: true,
//     entryCount: 2,
//     id: 'txn-009',
//     bankTransactionId: 'BT-20240307-890',
//     bankName: 'Chase Bank',
//     bankLogo: 'https://example.com/chase-logo.png',
//     bankAccountName: 'Business Checking',
//     bankAccountCurrencyCode: 'USD',
//     date: '07 Mar 2024',
//     fsDate: '07 Mar 2024',
//     description: 'Transaction has multiple entries',
//     contactName: 'Multiple contacts',
//     reference: 'Multiple references',
//     projectName: 'Team Building',
//     totalBankAmount: -300.0,
//     exchangeRate: '1.0000',
//     spent: 300.0,
//     received: 0,
//     confidence: 0.925, // Average of 95 and 90
//     status: 'posted', // All entries posted
//     coaId: null,
//     coaCode: null,
//     coaName: null,
//     entries: [
//       {
//         rowType: 'subRow',
//         id: 'entry-009-1',
//         bankTransactionId: 'BT-20240307-890',
//         bankName: 'Chase Bank',
//         bankLogo: 'https://example.com/chase-logo.png',
//         bankAccountName: 'Business Checking',
//         bankAccountCurrencyCode: 'USD',
//         date: '07 Mar 2024',
//         fsDate: '07 Mar 2024',
//         description: 'Team Lunch at Italian Restaurant',
//         contactName: "Mario's Italian",
//         reference: 'REST-7890',
//         projectName: 'Team Building',
//         totalBankAmount: -200.0,
//         exchangeRate: '1.0000',
//         spent: 200.0,
//         received: 0,
//         confidence: 0.95,
//         status: 'posted',
//         coaId: 'COA-6600',
//         coaCode: '6600',
//         coaName: 'Meals & Entertainment',
//       },
//       {
//         rowType: 'subRow',
//         id: 'entry-009-2',
//         bankTransactionId: 'BT-20240307-890',
//         bankName: 'Chase Bank',
//         bankLogo: 'https://example.com/chase-logo.png',
//         bankAccountName: 'Business Checking',
//         bankAccountCurrencyCode: 'USD',
//         date: '07 Mar 2024',
//         fsDate: '07 Mar 2024',
//         description: 'Transportation for team event',
//         contactName: 'City Cab Co.',
//         reference: 'CAB-4567',
//         projectName: 'Team Building',
//         totalBankAmount: -100.0,
//         exchangeRate: '1.0000',
//         spent: 100.0,
//         received: 0,
//         confidence: 0.9,
//         status: 'posted',
//         coaId: 'COA-6700',
//         coaCode: '6700',
//         coaName: 'Travel Expense',
//       },
//     ],
//   },
// ];

const banks = [
  {
    id: '9831f582-db5a-4705-ab10-2a54fd8a2b8c',
    name: 'Kuda Bank',
    logo: 'https://nigerianbanks.xyz/logo/kuda-bank.png',
  },
  {
    id: 'ee339814-5e7f-4408-93b7-588049e0ce30',
    name: 'Polaris Bank',
    logo: 'https://nigerianbanks.xyz/logo/polaris-bank.png',
  },
];

const coa = [
  {
    id: '019b0845-7156-7867-b39e-a0cbb463714a',
    code: '70301',
    name: 'Office Rent',
  },
  {
    id: '019b0845-7156-7469-b0c2-9f1ab6a00ab5',
    code: '10705',
    name: 'VAT Receivable',
  },
  {
    id: '019b0845-7156-728b-ae86-6fbfb3775be4',
    code: '70501',
    name: 'Telephone & Internet',
  },
  {
    id: '019b0845-7156-7712-b106-d4c05b34b9da',
    code: '30898',
    name: 'Suspense',
  },
  {
    id: '019b0845-7156-7401-96a9-cd59db02a4a9',
    code: '60007',
    name: 'Revenue - Retainers',
  },
];

const uuid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

export function generateCategorizationTransactions(
  count: number,
): CategorizationTransaction[] {
  const rows: CategorizationTransaction[] = [];

  while (rows.length < count) {
    const bankTxId = `bt_${uuid()}`;
    const split = Math.random() < 0.35; // 35% split
    const legs = split ? 2 : 1;

    const bankAmount =
      Math.random() < 0.5
        ? -1 * (5000 + Math.floor(Math.random() * 50000))
        : 50000 + Math.floor(Math.random() * 200000);

    const statusRoll = Math.random();
    const status: CategorizationTransactionStatus =
      statusRoll < 0.3
        ? 'uncategorized'
        : statusRoll < 0.6
          ? 'proposed'
          : 'posted';

    for (let i = 0; i < legs && rows.length < count; i++) {
      const account = coa[Math.floor(Math.random() * coa.length)];
      const amount = legs === 1 ? bankAmount : Math.round(bankAmount / legs);

      rows.push({
        id: bankTxId,
        date: new Date(),
        fs_date: new Date(),
        bank_amount: bankAmount,
        description: 'Auto-generated transaction',
        reference: null,
        contact_name:
          status === 'posted' && Math.random() < 0.5 ? null : 'Whogohost',
        contact_id:
          status === 'posted' && Math.random() < 0.5
            ? null
            : '019b0845-7168-7b7a-a878-dee7a129267e',
        contact_type: 'vendor',
        bank_account_id: '019b0845-718b-7528-91f1-42a42106a44f',
        bank_account_display_name: 'Professional Services Operating Account',
        bank_currency_id: 'NGN',
        bank_currency_code: 'NGN',
        bank_id: banks[0].id,
        bank_display_name: banks[0].name,
        bank_logo: banks[0].logo,
        coa_id: status === 'uncategorized' ? null : account.id,
        coa_name: status === 'uncategorized' ? null : account.name,
        coa_code: status === 'uncategorized' ? null : account.code,
        project_id:
          Math.random() < 0.2 ? null : '019b0845-7179-72c4-a76a-9c75e2fae942',
        project_name: Math.random() < 0.2 ? null : 'Tax Filing 2024',
        system_exchange_rate: 1,
        custom_exchange_rate: 1,
        native_amount: amount,
        reporting_amount: amount,
        ledger_transaction_id: status === 'posted' ? `lt_${uuid()}` : null,
        candidate_id: status === 'proposed' ? `cand_${uuid()}` : null,
        confidence:
          status === 'proposed'
            ? Number((0.6 + Math.random() * 0.35).toFixed(2))
            : null,
        explanation:
          status === 'proposed'
            ? 'Auto-generated categorization suggestion'
            : null,
        human_reviewed: status === 'proposed' ? Math.random() < 0.3 : null,
        categorization_candidate_id:
          status === 'proposed' ? `catcand_${uuid()}` : null,
        categorization_status: status,
        company_id: 'company_001',
        is_editable: status !== 'posted',
      });
    }
  }

  return rows;
}

export const testCategorizationTransactions = groupCategorizationTransactions(
  generateCategorizationTransactions(10),
);
