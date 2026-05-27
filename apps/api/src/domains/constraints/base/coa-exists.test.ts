import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMockConstraintContext,
  createMockEntry,
} from '../__test-helpers__.js';
// Import after mock setup
import { validateCoaIds } from '../../chart-of-accounts/index.js';
import { coaExistsAndActive } from './coa-exists.js';

// Mock the validateCoaIds function
vi.mock('../../chart-of-accounts/index.js', () => ({
  validateCoaIds: vi.fn(),
}));

const mockedValidateCoaIds = vi.mocked(validateCoaIds);

describe('coaExistsAndActive constraint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('valid cases', () => {
    it('should pass when all COA IDs exist and are active', async () => {
      mockedValidateCoaIds.mockResolvedValue({
        success: true,
        message: 'ok',
        data: {
          allValid: true,
          valid: [
            {
              id: '550e8400-e29b-41d4-a716-446655440001',
              exists: true,
              status: 'active' as const,
            },
          ],
          invalid: [],
        },
      });

      const ctx = createMockConstraintContext({
        entries: [
          createMockEntry({
            id: '1',
            coa_id: '550e8400-e29b-41d4-a716-446655440001',
          }),
        ],
      });

      const result = await coaExistsAndActive.validate(ctx);
      expect(result).toEqual([]);
      expect(mockedValidateCoaIds).toHaveBeenCalledWith({
        coaIds: ['550e8400-e29b-41d4-a716-446655440001'],
        companyId: ctx.companyUUID,
      });
    });

    it('should handle duplicate COA IDs in entries', async () => {
      mockedValidateCoaIds.mockResolvedValue({
        success: true,
        message: 'ok',
        data: {
          allValid: true,
          valid: [
            {
              id: '550e8400-e29b-41d4-a716-446655440001',
              exists: true,
              status: 'active' as const,
            },
          ],
          invalid: [],
        },
      });

      const ctx = createMockConstraintContext({
        entries: [
          createMockEntry({
            id: '1',
            coa_id: '550e8400-e29b-41d4-a716-446655440001',
          }),
          createMockEntry({
            id: '2',
            coa_id: '550e8400-e29b-41d4-a716-446655440001',
          }),
        ],
      });

      const result = await coaExistsAndActive.validate(ctx);
      expect(result).toEqual([]);
      // Should only call with unique COA IDs
      expect(mockedValidateCoaIds).toHaveBeenCalledWith({
        coaIds: ['550e8400-e29b-41d4-a716-446655440001'],
        companyId: ctx.companyUUID,
      });
    });

    it('should return empty array when no entries', async () => {
      const ctx = createMockConstraintContext({
        entries: [],
      });

      const result = await coaExistsAndActive.validate(ctx);
      expect(result).toEqual([]);
      expect(mockedValidateCoaIds).not.toHaveBeenCalled();
    });
  });

  describe('invalid cases', () => {
    it('should fail when COA ID does not exist', async () => {
      mockedValidateCoaIds.mockResolvedValue({
        success: true,
        message: 'ok',
        data: {
          allValid: false,
          valid: [],
          invalid: [
            {
              id: '550e8400-e29b-41d4-a716-446655440001',
              exists: false,
              status: 'not_found' as const,
            },
          ],
        },
      });

      const ctx = createMockConstraintContext({
        entries: [
          createMockEntry({
            id: '1',
            coa_id: '550e8400-e29b-41d4-a716-446655440001',
          }),
        ],
      });

      const result = await coaExistsAndActive.validate(ctx);
      expect(result).toHaveLength(1);
      expect(result[0]?.code).toBe('invalid_account');
      expect(result[0]?.severity).toBe('error');
      expect(result[0]?.message).toContain(
        '550e8400-e29b-41d4-a716-446655440001',
      );
      expect(result[0]?.message).toContain('not_found');
    });

    it('should fail when COA ID is archived/deleted', async () => {
      mockedValidateCoaIds.mockResolvedValue({
        success: true,
        message: 'ok',
        data: {
          allValid: false,
          valid: [],
          invalid: [
            {
              id: '550e8400-e29b-41d4-a716-446655440001',
              exists: true,
              status: 'deleted' as const,
            },
          ],
        },
      });

      const ctx = createMockConstraintContext({
        entries: [
          createMockEntry({
            id: '1',
            coa_id: '550e8400-e29b-41d4-a716-446655440001',
          }),
        ],
      });

      const result = await coaExistsAndActive.validate(ctx);
      expect(result).toHaveLength(1);
      expect(result[0]?.message).toContain('deleted');
    });

    it('should fail when COA ID belongs to different company', async () => {
      // When COA belongs to different company, it won't be found in the query
      mockedValidateCoaIds.mockResolvedValue({
        success: true,
        message: 'ok',
        data: {
          allValid: false,
          valid: [],
          invalid: [
            {
              id: '550e8400-e29b-41d4-a716-446655440001',
              exists: false,
              status: 'not_found' as const,
            },
          ],
        },
      });

      const ctx = createMockConstraintContext({
        entries: [
          createMockEntry({
            id: '1',
            coa_id: '550e8400-e29b-41d4-a716-446655440001',
          }),
        ],
      });

      const result = await coaExistsAndActive.validate(ctx);
      expect(result).toHaveLength(1);
      expect(result[0]?.message).toContain('not_found');
    });
  });

  describe('error handling', () => {
    it('should handle database error during validation', async () => {
      mockedValidateCoaIds.mockResolvedValue({
        success: false,
        message: 'Database connection error',
      });

      const ctx = createMockConstraintContext({
        entries: [
          createMockEntry({
            id: '1',
            coa_id: '550e8400-e29b-41d4-a716-446655440001',
          }),
        ],
      });

      const result = await coaExistsAndActive.validate(ctx);
      expect(result).toHaveLength(1);
      expect(result[0]?.code).toBe('invalid_account');
      expect(result[0]?.severity).toBe('error');
      expect(result[0]?.message).toContain('Failed to validate accounts');
      expect(result[0]?.message).toContain('Database connection error');
    });
  });
});
