import { describe, expect, it } from 'vitest';

import { mapJournalLinesToEntryInput } from './journal-entry-payload';

describe('mapJournalLinesToEntryInput', () => {
  it('preserves the UI line order and does not send backend-owned line numbers', () => {
    const entries = mapJournalLinesToEntryInput({
      journalDescription: 'Fallback journal description',
      journalTitle: 'Fallback journal title',
      lines: [
        {
          description: 'Third row entered first',
          side: 'debit',
          amount: 300,
          coaId: '33333333-3333-4333-8333-333333333333',
          projectId: null,
        },
        {
          description: 'First row entered second',
          side: 'credit',
          amount: 100,
          coaId: '11111111-1111-4111-8111-111111111111',
          projectId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        },
        {
          description: 'Second row entered third',
          side: 'credit',
          amount: 200,
          coaId: '22222222-2222-4222-8222-222222222222',
          projectId: null,
        },
      ],
    });

    expect(entries.map((entry) => entry.description)).toEqual([
      'Third row entered first',
      'First row entered second',
      'Second row entered third',
    ]);
    expect(entries.map((entry) => entry.amount)).toEqual([300, 100, 200]);
    expect(entries).toEqual([
      {
        description: 'Third row entered first',
        side: 'debit',
        amount: 300,
        coaId: '33333333-3333-4333-8333-333333333333',
        projectId: null,
      },
      {
        description: 'First row entered second',
        side: 'credit',
        amount: 100,
        coaId: '11111111-1111-4111-8111-111111111111',
        projectId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      },
      {
        description: 'Second row entered third',
        side: 'credit',
        amount: 200,
        coaId: '22222222-2222-4222-8222-222222222222',
        projectId: null,
      },
    ]);
    expect(entries.some((entry) => 'lineNumber' in entry)).toBe(false);
  });
});
