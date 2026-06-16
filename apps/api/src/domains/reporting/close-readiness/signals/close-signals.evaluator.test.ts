import { randomUUID } from 'node:crypto';
import type { AccountingBasis } from '@accountable-books/contracts/schema';
import { describe, expect, it } from 'vitest';

import { evaluateLedgerTransactionSignals } from './close-signals.evaluator.js';

import type { AccountElementKey } from '../../../../bootstrap/catalogs/accounting/account-elements.js';
import type {
  SignalLedgerEntry,
  SignalLedgerTransaction,
} from './close-signals.types.js';

function makeEntry(
  overrides: Partial<SignalLedgerEntry> = {},
): SignalLedgerEntry {
  return {
    ledgerEntryId: randomUUID(),
    coaId: randomUUID(),
    accountTypeKey: 'exp_opex_other',
    accountElementKey: 'operating_expenses',
    labelRole: 'semantic',
    isBankLeg: false,
    isMonetary: false,
    humanReviewed: false,
    contactId: randomUUID(),
    amount: 100,
    ...overrides,
  };
}

function makeBankLeg(
  overrides: Partial<SignalLedgerEntry> = {},
): SignalLedgerEntry {
  return makeEntry({
    accountTypeKey: 'ca_bank',
    accountElementKey: 'current_asset',
    isBankLeg: true,
    amount: 100,
    ...overrides,
  });
}

function makeTxn(
  overrides: Partial<SignalLedgerTransaction> = {},
): SignalLedgerTransaction {
  return {
    ledgerTransactionId: randomUUID(),
    companyId: randomUUID(),
    fiscalYear: 2026,
    periodNumber: 6,
    periodType: 'monthly',
    transactionSource: 'bank_transaction',
    categorizationSource: 'manual',
    hasSupportingDocument: true,
    ...overrides,
  };
}

const ACCRUAL: AccountingBasis = 'modified_accrual_basis';
const CASH: AccountingBasis = 'modified_cash_basis';

function codesFor(
  txn: SignalLedgerTransaction,
  entries: SignalLedgerEntry[],
  basis: AccountingBasis,
): string[] {
  return evaluateLedgerTransactionSignals(txn, entries, {
    accountingBasis: basis,
  }).map((signal) => signal.code);
}

describe('bank-sourced structural signals', () => {
  it('flags an accrual bank receipt posted directly to revenue', () => {
    const entries = [
      makeBankLeg(),
      makeEntry({
        accountElementKey: 'revenue',
        accountTypeKey: 'rev_revenue',
      }),
    ];

    expect(codesFor(makeTxn(), entries, ACCRUAL)).toContain(
      'bank_offset_direct_to_revenue',
    );
  });

  it('does not flag direct-to-P&L for a cash company', () => {
    const entries = [
      makeBankLeg(),
      makeEntry({
        accountElementKey: 'revenue',
        accountTypeKey: 'rev_revenue',
      }),
    ];

    expect(codesFor(makeTxn(), entries, CASH)).toHaveLength(0);
  });

  it('flags an accrual bank payment posted directly to expense', () => {
    const entries = [
      makeBankLeg({ amount: 250 }),
      makeEntry({
        accountElementKey: 'operating_expenses',
        accountTypeKey: 'exp_opex_rent',
        amount: 250,
      }),
    ];

    expect(codesFor(makeTxn(), entries, ACCRUAL)).toContain(
      'bank_offset_direct_to_expense',
    );
  });

  it('does not flag direct-to-expense for excluded low-risk expense types', () => {
    const bankFees = [
      makeBankLeg(),
      makeEntry({
        accountElementKey: 'operating_expenses',
        accountTypeKey: 'exp_opex_bank_fees',
      }),
    ];
    const financeCosts = [
      makeBankLeg(),
      makeEntry({
        accountElementKey: 'non_operating_expenses',
        accountTypeKey: 'exp_nopex_finance_costs',
      }),
    ];

    expect(codesFor(makeTxn(), bankFees, ACCRUAL)).not.toContain(
      'bank_offset_direct_to_expense',
    );
    expect(codesFor(makeTxn(), financeCosts, ACCRUAL)).not.toContain(
      'bank_offset_direct_to_expense',
    );
  });

  it('respects an optional direct-expense amount gate', () => {
    const entries = [
      makeBankLeg({ amount: 30 }),
      makeEntry({
        accountElementKey: 'operating_expenses',
        accountTypeKey: 'exp_opex_rent',
        amount: 30,
      }),
    ];

    const signals = evaluateLedgerTransactionSignals(makeTxn(), entries, {
      accountingBasis: ACCRUAL,
      directExpenseMinAmount: 100,
    });

    expect(signals.map((s) => s.code)).not.toContain(
      'bank_offset_direct_to_expense',
    );
  });

  it('flags capex for both accounting bases', () => {
    const entries = [
      makeBankLeg({ amount: 5000 }),
      makeEntry({
        accountElementKey: 'non_current_asset',
        accountTypeKey: 'nca_ppe',
        amount: 5000,
      }),
    ];

    expect(codesFor(makeTxn(), entries, ACCRUAL)).toContain(
      'bank_offset_to_capex',
    );
    expect(codesFor(makeTxn(), entries, CASH)).toContain(
      'bank_offset_to_capex',
    );
  });

  it('flags fallback usage ahead of the element-based signal', () => {
    const entries = [
      makeBankLeg(),
      makeEntry({
        accountElementKey: 'operating_expenses',
        labelRole: 'fallback',
      }),
    ];

    const codes = codesFor(makeTxn(), entries, ACCRUAL);
    expect(codes).toContain('posted_to_fallback_account');
    expect(codes).not.toContain('bank_offset_direct_to_expense');
  });

  it('flags a monetary offset leg', () => {
    const entries = [
      makeBankLeg(),
      makeEntry({
        accountElementKey: 'current_asset',
        accountTypeKey: 'ca_other',
        isMonetary: true,
      }),
    ];

    expect(codesFor(makeTxn(), entries, ACCRUAL)).toContain('monetary_fx_leg');
  });

  it('produces multiple signals for a split posting', () => {
    const entries = [
      makeBankLeg({ amount: 5100 }),
      makeEntry({
        accountElementKey: 'non_current_asset',
        accountTypeKey: 'nca_ppe',
        amount: 5000,
      }),
      makeEntry({
        accountElementKey: 'operating_expenses',
        accountTypeKey: 'exp_opex_rent',
        amount: 100,
      }),
    ];

    const codes = codesFor(makeTxn(), entries, ACCRUAL);
    expect(codes).toContain('bank_offset_to_capex');
    expect(codes).toContain('bank_offset_direct_to_expense');
  });
});

describe('non-cash destination signals (basis-agnostic)', () => {
  it.each([
    [
      'depreciation expense',
      'exp_opex_depreciation_amortization',
      'operating_expenses',
    ],
    ['accumulated depreciation', 'nca_ppe_contra', 'contra_asset'],
    ['retained earnings', 'eq_retained_earnings', 'reserves'],
    ['contributed capital', 'eq_contributed_capital', 'contributed_capital'],
  ])(
    'flags a bank posting to %s for both bases',
    (_label, accountTypeKey, accountElementKey) => {
      const entries = [
        makeBankLeg(),
        makeEntry({
          accountTypeKey,
          accountElementKey: accountElementKey as AccountElementKey,
        }),
      ];

      expect(codesFor(makeTxn(), entries, ACCRUAL)).toContain(
        'bank_offset_to_non_cash_account',
      );
      expect(codesFor(makeTxn(), entries, CASH)).toContain(
        'bank_offset_to_non_cash_account',
      );
    },
  );
});

describe('metadata-completeness: missing contact (per-leg, any source)', () => {
  it('flags a bank receivable posting with no contact', () => {
    const entries = [
      makeBankLeg(),
      makeEntry({
        accountTypeKey: 'ca_trade_receivable',
        accountElementKey: 'current_asset',
        contactId: null,
      }),
    ];

    expect(codesFor(makeTxn(), entries, ACCRUAL)).toContain(
      'posting_missing_required_contact',
    );
  });

  it('emits one missing-contact signal per qualifying leg without a contact', () => {
    const txn = makeTxn({ transactionSource: 'manual_journal' });
    const entries = [
      makeEntry({
        accountTypeKey: 'ca_trade_receivable',
        accountElementKey: 'current_asset',
        contactId: null,
      }),
      makeEntry({
        accountTypeKey: 'cl_trade_payable',
        accountElementKey: 'current_liabilities',
        contactId: null,
      }),
    ];

    const contactSignals = codesFor(txn, entries, ACCRUAL).filter(
      (code) => code === 'posting_missing_required_contact',
    );
    expect(contactSignals).toHaveLength(2);
  });

  it('does not flag a counterparty posting that has a contact', () => {
    const entries = [
      makeBankLeg(),
      makeEntry({
        accountTypeKey: 'ca_trade_receivable',
        accountElementKey: 'current_asset',
        contactId: randomUUID(),
      }),
    ];

    expect(codesFor(makeTxn(), entries, ACCRUAL)).not.toContain(
      'posting_missing_required_contact',
    );
  });
});

describe('metadata-completeness: missing document (journal-only, per-transaction)', () => {
  it('flags a manual journal to payables with no supporting document', () => {
    const txn = makeTxn({
      transactionSource: 'manual_journal',
      hasSupportingDocument: false,
    });
    const entries = [
      makeEntry({
        accountTypeKey: 'cl_trade_payable',
        accountElementKey: 'current_liabilities',
      }),
      makeEntry({ accountTypeKey: 'exp_opex_rent' }),
    ];

    expect(codesFor(txn, entries, ACCRUAL)).toContain(
      'posting_missing_supporting_doc',
    );
  });

  it('emits the missing-doc signal once even with several counterparty legs', () => {
    const txn = makeTxn({
      transactionSource: 'manual_journal',
      hasSupportingDocument: false,
    });
    const entries = [
      makeEntry({
        accountTypeKey: 'ca_trade_receivable',
        accountElementKey: 'current_asset',
      }),
      makeEntry({
        accountTypeKey: 'ca_other_receivable',
        accountElementKey: 'current_asset',
      }),
    ];

    const docSignals = codesFor(txn, entries, ACCRUAL).filter(
      (code) => code === 'posting_missing_supporting_doc',
    );
    expect(docSignals).toHaveLength(1);
  });

  it('does not flag a missing document on a bank-sourced posting (noise)', () => {
    const txn = makeTxn({
      transactionSource: 'bank_transaction',
      hasSupportingDocument: false,
    });
    const entries = [
      makeBankLeg(),
      makeEntry({
        accountTypeKey: 'ca_trade_receivable',
        accountElementKey: 'current_asset',
      }),
    ];

    expect(codesFor(txn, entries, ACCRUAL)).not.toContain(
      'posting_missing_supporting_doc',
    );
  });

  it('does not flag a journal that has a supporting document', () => {
    const txn = makeTxn({
      transactionSource: 'manual_journal',
      hasSupportingDocument: true,
    });
    const entries = [
      makeEntry({
        accountTypeKey: 'cl_trade_payable',
        accountElementKey: 'current_liabilities',
      }),
      makeEntry({ accountTypeKey: 'exp_opex_rent' }),
    ];

    expect(codesFor(txn, entries, ACCRUAL)).not.toContain(
      'posting_missing_supporting_doc',
    );
  });
});

describe('journal-sourced signals', () => {
  it('flags a manual journal posting to a bank account', () => {
    const txn = makeTxn({ transactionSource: 'manual_journal' });
    const entries = [
      makeEntry({
        accountTypeKey: 'ca_bank',
        accountElementKey: 'current_asset',
      }),
      makeEntry({ accountTypeKey: 'exp_opex_other' }),
    ];

    expect(codesFor(txn, entries, ACCRUAL)).toContain(
      'journal_to_bank_account',
    );
  });

  it('flags a depreciation pairing mismatch', () => {
    const txn = makeTxn({ transactionSource: 'manual_journal' });
    const entries = [
      makeEntry({
        accountTypeKey: 'nca_ppe_contra',
        accountElementKey: 'contra_asset',
      }),
      makeEntry({
        accountTypeKey: 'exp_opex_rent',
        accountElementKey: 'operating_expenses',
      }),
    ];

    expect(codesFor(txn, entries, ACCRUAL)).toContain(
      'journal_depreciation_pairing_mismatch',
    );
  });

  it('does not flag a well-formed depreciation journal', () => {
    const txn = makeTxn({ transactionSource: 'manual_journal' });
    const entries = [
      makeEntry({
        accountTypeKey: 'nca_ppe_contra',
        accountElementKey: 'contra_asset',
      }),
      makeEntry({
        accountTypeKey: 'exp_opex_depreciation_amortization',
        accountElementKey: 'operating_expenses',
      }),
    ];

    expect(codesFor(txn, entries, ACCRUAL)).not.toContain(
      'journal_depreciation_pairing_mismatch',
    );
  });

  it('does not emit bank-only structural signals for an ordinary journal', () => {
    const txn = makeTxn({ transactionSource: 'manual_journal' });
    const entries = [
      makeEntry({
        accountTypeKey: 'rev_revenue',
        accountElementKey: 'revenue',
      }),
      makeEntry({
        accountTypeKey: 'exp_opex_rent',
        accountElementKey: 'operating_expenses',
      }),
    ];

    expect(codesFor(txn, entries, ACCRUAL)).toHaveLength(0);
  });
});

describe('signal identity and invalidation', () => {
  it('produces a stable fingerprint across evaluations', () => {
    const txn = makeTxn();
    const entries = [
      makeBankLeg(),
      makeEntry({
        accountElementKey: 'revenue',
        accountTypeKey: 'rev_revenue',
      }),
    ];

    const first = evaluateLedgerTransactionSignals(txn, entries, {
      accountingBasis: ACCRUAL,
    });
    const second = evaluateLedgerTransactionSignals(txn, entries, {
      accountingBasis: ACCRUAL,
    });

    expect(first[0]?.fingerprint).toBe(second[0]?.fingerprint);
    expect(first[0]?.factsHash).toBe(second[0]?.factsHash);
  });

  it('keeps the fingerprint stable but changes factsHash when amount changes', () => {
    const txn = makeTxn();
    const baseLeg = makeEntry({
      accountElementKey: 'revenue',
      accountTypeKey: 'rev_revenue',
      amount: 100,
    });

    const [before] = evaluateLedgerTransactionSignals(
      txn,
      [makeBankLeg(), baseLeg],
      { accountingBasis: ACCRUAL },
    );
    const [after] = evaluateLedgerTransactionSignals(
      txn,
      [makeBankLeg(), { ...baseLeg, amount: 175 }],
      { accountingBasis: ACCRUAL },
    );

    // Amount is material state, not identity: same finding, changed facts.
    expect(after?.fingerprint).toBe(before?.fingerprint);
    expect(after?.factsHash).not.toBe(before?.factsHash);
  });

  it('distinguishes split legs to the same account by ledger entry id', () => {
    const txn = makeTxn();
    const coaId = randomUUID();
    const sharedLeg = {
      accountTypeKey: 'rev_revenue',
      accountElementKey: 'revenue' as const,
      coaId,
      amount: 100,
    };
    const signals = evaluateLedgerTransactionSignals(
      txn,
      [
        makeBankLeg({ amount: 200 }),
        makeEntry(sharedLeg),
        makeEntry(sharedLeg),
      ],
      { accountingBasis: ACCRUAL },
    ).filter((s) => s.code === 'bank_offset_direct_to_revenue');

    expect(signals).toHaveLength(2);
    expect(signals[0]?.fingerprint).not.toBe(signals[1]?.fingerprint);
  });
});
