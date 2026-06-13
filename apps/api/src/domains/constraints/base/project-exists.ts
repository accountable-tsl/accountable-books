import type { Knex } from 'knex';

import { knexClient as db } from '../../../db/knexClient.js';

import type { Constraint, ConstraintBase } from '../constraints-types.js';

const projectExistsBase: ConstraintBase = {
  code: 'project_exists',
  description: 'Project must exist, belong to the company, and not be deleted',
  scope: 'entry',
} as const;

export const projectExists: Constraint = {
  ...projectExistsBase,

  validate: async (ctx) => {
    // Collect all unique project IDs that are not null
    const projectIds = ctx.entries
      .map((e) => e.project_id)
      .filter((id): id is string => id !== null && id !== undefined);

    if (projectIds.length === 0) {
      return [];
    }

    const uniqueProjectIds = Array.from(new Set(projectIds));

    try {
      const queryClient = ctx.trx || db;
      const projects = await queryClient('projects')
        .whereIn('id', uniqueProjectIds)
        .where('company_id', ctx.companyUUID)
        .where('is_deleted', false)
        .select('id');

      const validProjectIds = new Set(projects.map((p) => p.id));
      const invalidProjectIds = uniqueProjectIds.filter(
        (id) => !validProjectIds.has(id),
      );

      if (invalidProjectIds.length === 0) {
        return [];
      }

      return invalidProjectIds.map((projectId) => ({
        code: projectExistsBase.code,
        message: `Project ${projectId} does not exist, is deleted, or does not belong to company`,
        scope: projectExistsBase.scope,
        severity: 'warning' as const,
      }));
    } catch (error) {
      // Handle database errors gracefully
      const err = error instanceof Error ? error : new Error(String(error));
      return [
        {
          code: projectExistsBase.code,
          message: `Failed to validate projects: ${err.message}`,
          scope: projectExistsBase.scope,
          severity: 'warning' as const,
        },
      ];
    }
  },
};
