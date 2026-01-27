import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMockConstraintContext,
  createMockEntry,
} from '../__test-helpers__.js';
// Need to import after mock
import { knexClient } from '../../../db/knexClient.js';
import { projectExists } from './project-exists.js';

// Hoist mocks so they're available when vi.mock is hoisted
const { mockQuery, mockKnexTable } = vi.hoisted(() => {
  const query = {
    whereIn: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    select: vi.fn().mockResolvedValue([]),
  };

  const table = vi.fn().mockReturnValue(query);
  return { mockQuery: query, mockKnexTable: table };
});

vi.mock('../../../db/knexClient.js', () => ({
  knexClient: mockKnexTable,
}));

describe('projectExists constraint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset query chain
    mockQuery.whereIn.mockReturnValue(mockQuery);
    mockQuery.where.mockReturnValue(mockQuery);
    mockQuery.select.mockResolvedValue([]);
    mockKnexTable.mockReturnValue(mockQuery);
  });

  describe('valid cases', () => {
    it('should pass when all project IDs exist and belong to company', async () => {
      mockQuery.select.mockResolvedValue([
        { id: '550e8400-e29b-41d4-a716-446655440010' },
        { id: '550e8400-e29b-41d4-a716-446655440011' },
      ]);

      const ctx = createMockConstraintContext({
        entries: [
          createMockEntry({
            id: '1',
            project_id: '550e8400-e29b-41d4-a716-446655440010',
          }),
          createMockEntry({
            id: '2',
            project_id: '550e8400-e29b-41d4-a716-446655440011',
          }),
        ],
      });

      const result = await projectExists.validate(ctx);
      expect(result).toEqual([]);
    });

    it('should pass when no project IDs (all null/undefined)', async () => {
      const ctx = createMockConstraintContext({
        entries: [
          createMockEntry({ id: '1', project_id: null }),
          createMockEntry({ id: '2', project_id: undefined }),
        ],
      });

      const result = await projectExists.validate(ctx);
      expect(result).toEqual([]);
      expect(mockKnexTable).not.toHaveBeenCalled();
    });

    it('should handle duplicate project IDs', async () => {
      mockQuery.select.mockResolvedValue([
        { id: '550e8400-e29b-41d4-a716-446655440010' },
      ]);

      const ctx = createMockConstraintContext({
        entries: [
          createMockEntry({
            id: '1',
            project_id: '550e8400-e29b-41d4-a716-446655440010',
          }),
          createMockEntry({
            id: '2',
            project_id: '550e8400-e29b-41d4-a716-446655440010',
          }),
        ],
      });

      const result = await projectExists.validate(ctx);
      expect(result).toEqual([]);
    });
  });

  describe('invalid cases', () => {
    it('should fail when project ID does not exist', async () => {
      mockQuery.select.mockResolvedValue([]);

      const ctx = createMockConstraintContext({
        entries: [
          createMockEntry({
            id: '1',
            project_id: '550e8400-e29b-41d4-a716-446655440010',
          }),
        ],
      });

      const result = await projectExists.validate(ctx);
      expect(result).toHaveLength(1);
      expect(result[0]?.code).toBe('project_exists');
      expect(result[0]?.severity).toBe('warning');
      expect(result[0]?.message).toContain('does not exist');
    });

    it('should fail when project ID exists but belongs to different company', async () => {
      // Query returns empty (project belongs to different company)
      mockQuery.select.mockResolvedValue([]);

      const ctx = createMockConstraintContext({
        entries: [
          createMockEntry({
            id: '1',
            project_id: '550e8400-e29b-41d4-a716-446655440010',
          }),
        ],
      });

      const result = await projectExists.validate(ctx);
      expect(result).toHaveLength(1);
      expect(result[0]?.message).toContain('does not belong to company');
    });

    it('should fail when project ID exists but is deleted', async () => {
      // Query returns empty (project is deleted, filtered by is_deleted: false)
      mockQuery.select.mockResolvedValue([]);

      const ctx = createMockConstraintContext({
        entries: [
          createMockEntry({
            id: '1',
            project_id: '550e8400-e29b-41d4-a716-446655440010',
          }),
        ],
      });

      const result = await projectExists.validate(ctx);
      expect(result).toHaveLength(1);
    });

    it('should handle mix of valid and invalid projects', async () => {
      mockQuery.select.mockResolvedValue([
        { id: '550e8400-e29b-41d4-a716-446655440010' },
      ]);

      const ctx = createMockConstraintContext({
        entries: [
          createMockEntry({
            id: '1',
            project_id: '550e8400-e29b-41d4-a716-446655440010',
          }),
          createMockEntry({
            id: '2',
            project_id: '550e8400-e29b-41d4-a716-446655440011',
          }),
        ],
      });

      const result = await projectExists.validate(ctx);
      expect(result).toHaveLength(1);
      expect(result[0]?.message).toContain(
        '550e8400-e29b-41d4-a716-446655440011',
      );
    });
  });

  describe('error handling', () => {
    it('should handle database error during query', async () => {
      // Reset mocks first
      mockQuery.whereIn.mockReturnValue(mockQuery);
      mockQuery.where.mockReturnValue(mockQuery);
      mockQuery.select.mockRejectedValue(
        new Error('Database connection failed'),
      );

      const ctx = createMockConstraintContext({
        entries: [
          createMockEntry({
            id: '1',
            project_id: '550e8400-e29b-41d4-a716-446655440010',
          }),
        ],
      });

      // The constraint should catch the error and return a violation, not throw
      const result = await projectExists.validate(ctx);
      expect(result).toHaveLength(1);
      expect(result[0]?.code).toBe('project_exists');
      expect(result[0]?.message).toContain('Database connection failed');
    });
  });
});
