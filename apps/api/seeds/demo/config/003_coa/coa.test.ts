import type { Knex } from 'knex';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { createDemoCoa, deleteDemoCoa } from './coa.fn.js';

vi.mock('../../shared/utils.js', () => ({
  deleteDemoData: vi.fn().mockResolvedValue(undefined),
}));

const createMockTransaction = (): Knex.Transaction => {
  return vi.fn() as any as Knex.Transaction;
};

describe('createDemoCoa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  test('logs that the demo COA step is now handled during company provisioning', async () => {
    const mockTransaction = createMockTransaction();

    await createDemoCoa(mockTransaction);

    expect(console.log).toHaveBeenCalledWith(
      'Skipping demo COA step because demo company provisioning already ensures chart of accounts',
    );
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});

describe('deleteDemoCoa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('should delete COA entries', async () => {
    const mockTransaction = createMockTransaction();

    await deleteDemoCoa(mockTransaction);

    // Should call shared deletion utility
    const { deleteDemoData } = await import('../../shared/utils.js');
    expect(deleteDemoData).toHaveBeenCalledWith({
      trx: mockTransaction,
      table: 'coa',
      filters: undefined,
    });
  });

  test('should delete COA entries with filters', async () => {
    const mockTransaction = createMockTransaction();
    const filters = { companyIds: ['bizDemoUS'] };

    await deleteDemoCoa(mockTransaction, filters);

    // Should pass filters to deletion utility
    const { deleteDemoData } = await import('../../shared/utils.js');
    expect(deleteDemoData).toHaveBeenCalledWith({
      trx: mockTransaction,
      table: 'coa',
      filters: filters,
    });
  });
});
