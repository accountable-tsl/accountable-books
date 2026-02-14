import type {
  GetJournalResponse,
  GetRecurringTemplateResponse,
} from '@accountable-books/contracts/schema';
import { describe, expect, it } from 'vitest';

import {
  getAllowedActionsForJournal,
  getAllowedActionsForTemplate,
} from './journal-actions';

const baseJournal: GetJournalResponse['journal'] = {
  id: 'journal-1',
  companyId: 'company-1',
  date: '2026-01-01',
  title: 'Test Journal',
  description: null,
  note: null,
  contactId: null,
  contactName: null,
  currencyId: 'currency-1',
  currencyCode: 'USD',
  currencyName: 'US Dollar',
  currencySymbol: '$',
  exchangeRate: '1',
  metadata: null,
  createdAt: '2026-01-01T00:00:00Z',
  createdById: 'user-1',
  updatedAt: '2026-01-01T00:00:00Z',
  updatedById: null,
  isDeleted: false,
  deletedAt: null,
  totalDebit: '0',
  totalCredit: '0',
  entriesCount: 0,
  kind: 'journal',
  journalSource: 'one_off',
  isFx: false,
  status: 'draft',
  reference: null,
  sequenceMonth: null,
  sequenceNumber: null,
  ledgerTransactionId: null,
  autoReversalDate: null,
  reversalJournalId: null,
  originalJournalId: null,
  reversedAt: null,
  reversalReason: null,
  reversedById: null,
  voidedAt: null,
  generatedFromTemplateId: null,
  generatedAt: null,
  generatedScheduledForDate: null,
};

const baseTemplate: GetRecurringTemplateResponse['template'] = {
  id: 'template-1',
  description: 'Recurring Template',
  title: null,
  note: null,
  status: 'draft',
  companyId: 'company-1',
  autoPost: false,
  templateTimezone: 'America/New_York',
  frequency: 'monthly',
  startDateYMD: '2026-01-01',
  endDateYMD: null,
  nextRunDateYMD: null,
  placeholderVars: null,
  currencyId: null,
  currencyCode: null,
  currencyName: null,
  currencySymbol: null,
  contactId: null,
  contactName: null,
  autoReversalDays: null,
  lastRunAt: null,
  lastFailedAt: null,
  lastError: null,
  failureCount: 0,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const makeJournal = (
  overrides: Partial<GetJournalResponse['journal']>,
): GetJournalResponse['journal'] => ({
  ...baseJournal,
  ...overrides,
});

const makeTemplate = (
  overrides: Partial<GetRecurringTemplateResponse['template']>,
): GetRecurringTemplateResponse['template'] => ({
  ...baseTemplate,
  ...overrides,
});

const getActionKeys = (actions: ReadonlyArray<{ action: string }>): string[] =>
  actions.map((item) => item.action);

describe('getAllowedActionsForJournal', () => {
  it('returns draft actions', () => {
    const journal = makeJournal({ status: 'draft' });
    expect(getActionKeys(getAllowedActionsForJournal(journal))).toEqual([
      'edit',
      'post',
      'void',
      'copy',
    ]);
  });

  it('returns reverse + copy for posted journals that can reverse', () => {
    const journal = makeJournal({
      status: 'posted',
      ledgerTransactionId: 'ledger-1',
      reversalJournalId: null,
      reversedAt: null,
    });
    expect(getActionKeys(getAllowedActionsForJournal(journal))).toEqual([
      'reverse',
      'copy',
    ]);
  });

  it('returns copy for posted journals without ledger transaction', () => {
    const journal = makeJournal({
      status: 'posted',
      ledgerTransactionId: null,
    });
    expect(getActionKeys(getAllowedActionsForJournal(journal))).toEqual([
      'copy',
    ]);
  });

  it('returns copy for reversed posted journals', () => {
    const journal = makeJournal({
      status: 'posted',
      reversalJournalId: 'journal-2',
    });
    expect(getActionKeys(getAllowedActionsForJournal(journal))).toEqual([
      'copy',
    ]);
  });

  it('returns copy for voided journals', () => {
    const journal = makeJournal({ status: 'voided' });
    expect(getActionKeys(getAllowedActionsForJournal(journal))).toEqual([
      'copy',
    ]);
  });

  it('returns metadata for each journal action', () => {
    const journal = makeJournal({ status: 'draft' });
    const voidAction = getAllowedActionsForJournal(journal).find(
      (item) => item.action === 'void',
    );

    expect(voidAction).toMatchObject({
      action: 'void',
      id: 'void',
      key: 'void',
      label: 'Void',
      className: 'text-destructive',
    });
    expect(voidAction?.icon).toBeDefined();
    expect(['function', 'object']).toContain(typeof voidAction?.icon);
  });
});

describe('getAllowedActionsForTemplate', () => {
  it('returns actions for draft template', () => {
    const template = makeTemplate({ status: 'draft' });
    expect(getActionKeys(getAllowedActionsForTemplate(template))).toEqual([
      'edit',
      'activate',
    ]);
  });

  it('returns actions for active template', () => {
    const template = makeTemplate({ status: 'active' });
    expect(getActionKeys(getAllowedActionsForTemplate(template))).toEqual([
      'edit',
      'run_now',
      'pause',
      'close',
    ]);
  });

  it('returns actions for paused template', () => {
    const template = makeTemplate({ status: 'paused' });
    expect(getActionKeys(getAllowedActionsForTemplate(template))).toEqual([
      'edit',
      'resume',
      'close',
    ]);
  });

  it('returns actions for closed template', () => {
    const template = makeTemplate({ status: 'closed' });
    expect(getActionKeys(getAllowedActionsForTemplate(template))).toEqual([
      'copy',
    ]);
  });

  it('returns metadata for each template action', () => {
    const template = makeTemplate({ status: 'active' });
    const runNow = getAllowedActionsForTemplate(template).find(
      (item) => item.action === 'run_now',
    );

    expect(runNow).toMatchObject({
      action: 'run_now',
      id: 'run_now',
      key: 'run_now',
      label: 'Run now',
    });
    expect(runNow?.icon).toBeDefined();
    expect(['function', 'object']).toContain(typeof runNow?.icon);
  });
});
