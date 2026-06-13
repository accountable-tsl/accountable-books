import type { Knex } from 'knex';
import z from 'zod';

import { knexClient } from '../../db/knexClient.js';
import { getCompanyUUID } from '../../shared/utils/random.utils.js';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../shared/utils/response.utils.js';
import {
  createHybridSearch,
  defineSearchableColumns,
} from '../../shared/utils/search.utils.js';
import {
  deleteProjectInput,
  getProjectsParams,
  newProjectInput,
  updateProjectInput,
} from './projects.types.js';

import type { ApiResponse } from '../../core/types/api.types.js';
import type {
  GetProjectsParams,
  NewProjectInput,
  ProjectResponse,
  UpdateProjectInput,
} from './projects.types.js';

export async function getProjects(
  input: GetProjectsParams,
): Promise<ApiResponse<ProjectResponse>> {
  const parseInput = getProjectsParams.safeParse(input);
  if (!parseInput.success) {
    return errorResponse(
      'Invalid request parameters',
      z.treeifyError(parseInput.error),
    );
  }

  const {
    companyId,
    ids,
    status,
    contactIds,
    search,
    page = 1,
    limit = 30,
    includeDeleted = false,
    sortBy = 'created_at',
    sortOrder = 'desc',
    trx,
  } = parseInput.data;

  const searchableColumns = defineSearchableColumns('p', [
    { column: 'name', weight: 2.0 },
    { column: 'code', weight: 1.5 },
    { column: 'description' },
    { column: 'display_name', table: 'c', name: 'contactName', weight: 1.2 },
  ]);

  const { applySearchFilter, rankFields, rankOrder } = createHybridSearch({
    search,
    searchableColumns,
    trx,
    options: {
      minSimilarityThreshold: 0.25,
      fuzzyMinLength: 2,
    },
  });

  const query = async (tx: Knex.Transaction) => {
    const companyUUID = await getCompanyUUID(companyId, tx);
    if (!companyUUID) return errorResponse('Company not found');

    let baseQuery = tx('projects as p')
      .leftJoin('contacts as c', function () {
        this.on('p.contact_id', '=', 'c.id').andOn(
          'p.company_id',
          '=',
          'c.company_id',
        );
      })
      .where('p.company_id', companyUUID);

    if (!includeDeleted) {
      baseQuery = baseQuery.andWhere('p.is_deleted', false);
    }

    if (ids && ids.length > 0) {
      baseQuery = baseQuery.whereIn('p.id', ids);
    }

    if (status) {
      baseQuery = baseQuery.andWhere('p.status', status);
    }

    if (contactIds && contactIds.length > 0) {
      baseQuery = baseQuery.whereIn('p.contact_id', contactIds);
    }

    if (search?.trim()) baseQuery = applySearchFilter(baseQuery);

    const countResult = await baseQuery.clone().count('* as count').first();
    const total = Number(countResult?.count ?? 0);

    const offset = Math.max(0, (page - 1) * limit);
    const totalPages = Math.max(1, Math.ceil(total / limit));

    if (page > totalPages) {
      return errorResponse(
        `Page ${page} exceeds maximum pages (${totalPages})`,
      );
    }

    const selectFields: (string | Knex.Raw)[] = [
      'p.id',
      'p.name',
      'p.code',
      'p.description',
      'p.status',
      'p.contact_id as contactId',
      'c.display_name as contactName',
      'p.start_date as startDate',
      'p.end_date as endDate',
      'p.created_at as createdAt',
      'p.updated_at as updatedAt',
      'p.is_deleted as isDeleted',
      'p.deleted_at as deletedAt',
      'p.deleted_by_id as deletedById',
      ...rankFields,
    ];
    const orderByField = sortBy ?? 'created_at';
    const sortFieldQualified = search ? 'rank' : `p.${orderByField}`;
    const sortDirection = search ? 'desc' : sortOrder;

    const orderClause = rankOrder ?? [sortFieldQualified, sortDirection];
    const projects = await baseQuery
      .select(selectFields)
      .orderBy(...orderClause)
      .limit(limit)
      .offset(offset);

    const pagination = {
      currentPage: page,
      pageSize: limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };

    if (total === 0 && page === 1) {
      return successResponse('No projects found', {
        projects: [],
        pagination: {
          ...pagination,
          hasNext: false,
          hasPrev: false,
        },
      });
    }

    return successResponse('Project(s) successfully fetched', {
      projects,
      pagination,
    });
  };

  try {
    const result = trx ? await query(trx) : await knexClient.transaction(query);
    return result as ApiResponse<ProjectResponse>;
  } catch (error) {
    return errorResponse('Failed to fetch project(s)', error);
  }
}

export async function addNewProjects({
  input,
  companyId,
  userId,
  trx,
}: {
  input: NewProjectInput[];
  companyId: string;
  userId: string;
  trx?: Knex.Transaction;
}): Promise<ApiResponse<{ id: string; name: string }[]>> {
  const validate = newProjectInput
    .array()
    .safeParse(Array.isArray(input) ? input : [input]);

  if (!validate.success) {
    return errorResponse('Invalid input', z.treeifyError(validate.error));
  }

  const data = validate.data;

  const query = async (tx: Knex.Transaction) => {
    const companyUUID = await getCompanyUUID(companyId, tx);
    if (!companyUUID) return errorResponse('Company not found');

    const contactIds = data
      .map((p) => p.contact_id)
      .filter((id): id is string => Boolean(id));

    const validContactRows =
      contactIds.length > 0
        ? await tx('contacts')
            .whereIn('id', contactIds)
            .andWhere('company_id', companyUUID)
            .andWhere('status', 'active')
            .andWhere('is_deleted', false)
            .select('id')
        : [];

    const validContactIds = new Set(validContactRows.map((c) => c.id));

    const invalidContacts = data.flatMap((project) => {
      const contactId = project.contact_id;
      if (!contactId || validContactIds.has(contactId)) return [];
      return [{ contactId, projectName: project.name }];
    });

    if (invalidContacts.length > 0) {
      const errorDetails = invalidContacts
        .map(
          (c: { contactId: string; projectName: string }) =>
            `Contact ${c.contactId} for project "${c.projectName}"`,
        )
        .join(', ') as string;

      return errorResponse(`Invalid contact(s): ${errorDetails}`);
    }

    const projects = data.map((project) => ({
      ...project,
      company_id: companyUUID,
      created_by_id: userId,
      updated_by_id: userId,
    }));

    const inserted = await tx('projects')
      .insert(projects)
      .returning(['id', 'name']);

    return successResponse(
      `Project${data.length > 1 ? 's' : ''} successfully created`,
      inserted,
    );
  };

  try {
    const result = trx ? await query(trx) : await knexClient.transaction(query);
    return result as ApiResponse<{ id: string; name: string }[]>;
  } catch (error: any) {
    return errorResponse('Failed to create project(s)', error);
  }
}

export async function updateProjects({
  updates,
  companyId,
  userId,
  trx,
}: {
  updates: UpdateProjectInput[];
  companyId: string;
  userId: string;
  trx?: Knex.Transaction;
}) {
  const validate = updateProjectInput
    .array()
    .safeParse(Array.isArray(updates) ? updates : [updates]);
  if (!validate.success) {
    return errorResponse('Invalid input', z.treeifyError(validate.error), {
      code: ErrorCode.INVALID_INPUT,
    });
  }

  const query = async (tx: Knex.Transaction) => {
    const companyUUID = await getCompanyUUID(companyId, tx);
    if (!companyUUID) return errorResponse('Company not found');

    const projectIds = validate.data.map((project) => project.id);
    const existingProjects = await tx('projects')
      .whereIn('id', projectIds)
      .andWhere('company_id', companyUUID)
      .andWhere('is_deleted', false)
      .select('id');

    if (existingProjects.length !== projectIds.length) {
      const existingIds = new Set(
        existingProjects.map((project) => project.id),
      );
      const missingIds = projectIds.filter((id) => !existingIds.has(id));
      return errorResponse(
        `Project(s) with these IDs do not exist: ${missingIds.join(', ')}`,
        undefined,
        { code: ErrorCode.NOT_FOUND },
      );
    }

    const contactIds = validate.data
      .map((project) => project.contact_id)
      .filter((id): id is string => Boolean(id));

    const validContactRows =
      contactIds.length > 0
        ? await tx('contacts')
            .whereIn('id', contactIds)
            .andWhere('company_id', companyUUID)
            .andWhere('status', 'active')
            .andWhere('is_deleted', false)
            .select('id')
        : [];

    const validContactIds = new Set(
      validContactRows.map((contact) => contact.id),
    );
    const invalidContactIds = contactIds.filter(
      (id) => !validContactIds.has(id),
    );

    if (invalidContactIds.length > 0) {
      return errorResponse(
        `Invalid, archived, or deleted contact IDs: ${invalidContactIds.join(', ')}`,
        undefined,
        { code: ErrorCode.INVALID_INPUT },
      );
    }

    const updatedProjects = await Promise.all(
      validate.data.map(async (project) => {
        const updateData: Record<string, unknown> = {
          updated_by_id: userId,
          updated_at: tx.fn.now(),
        };

        if (project.name !== undefined) updateData.name = project.name;
        if (project.code !== undefined) updateData.code = project.code;
        if (project.description !== undefined) {
          updateData.description = project.description;
        }
        if (project.status !== undefined) updateData.status = project.status;
        if (project.contact_id !== undefined) {
          updateData.contact_id = project.contact_id;
        }
        if (project.start_date !== undefined) {
          updateData.start_date = project.start_date;
        }
        if (project.end_date !== undefined)
          updateData.end_date = project.end_date;

        const [updatedProject] = await tx('projects')
          .where({
            id: project.id,
            company_id: companyUUID,
            is_deleted: false,
          })
          .update(updateData)
          .returning([
            'id',
            'name',
            'code',
            'description',
            'status',
            'contact_id as contactId',
            'start_date as startDate',
            'end_date as endDate',
            'created_at as createdAt',
            'updated_at as updatedAt',
            'is_deleted as isDeleted',
            'deleted_at as deletedAt',
            'deleted_by_id as deletedById',
          ]);

        return updatedProject;
      }),
    );

    return successResponse('Project(s) updated successfully', updatedProjects);
  };

  try {
    const result = trx ? await query(trx) : await knexClient.transaction(query);
    return result;
  } catch (error) {
    return errorResponse('Failed to update project(s)', error);
  }
}

export async function deleteProject({
  input,
  companyId,
  userId,
}: {
  input: { id: string };
  companyId: string;
  userId: string;
}) {
  const validate = deleteProjectInput.safeParse(input);
  if (!validate.success) {
    return errorResponse('Invalid input', z.treeifyError(validate.error), {
      code: ErrorCode.INVALID_INPUT,
    });
  }

  try {
    const result = await knexClient.transaction(async (tx) => {
      const companyUUID = await getCompanyUUID(companyId, tx);
      if (!companyUUID) return errorResponse('Company not found');

      const project = await tx('projects')
        .where({
          id: validate.data.id,
          company_id: companyUUID,
          is_deleted: false,
        })
        .first('id', 'name');

      if (!project) {
        return errorResponse('Project not found', undefined, {
          code: ErrorCode.NOT_FOUND,
        });
      }

      const referenceCounts = await getProjectReferenceCounts({
        trx: tx,
        companyId: companyUUID,
        projectId: validate.data.id,
      });
      const totalReferences = Object.values(referenceCounts).reduce(
        (sum, count) => sum + count,
        0,
      );

      if (totalReferences > 0) {
        return errorResponse(
          'Project is linked to accounting or categorization records and cannot be deleted. Use a lifecycle status such as cancelled or completed instead.',
          { referenceCounts },
          { code: ErrorCode.OPERATION_NOT_ALLOWED },
        );
      }

      await tx('projects')
        .where({
          id: validate.data.id,
          company_id: companyUUID,
          is_deleted: false,
        })
        .update({
          is_deleted: true,
          deleted_at: tx.fn.now(),
          deleted_by_id: userId,
          updated_by_id: userId,
          updated_at: tx.fn.now(),
        });

      return successResponse('Project deleted successfully', {
        projectId: validate.data.id,
        name: project.name,
      });
    });

    return result;
  } catch (error) {
    return errorResponse('Failed to delete project', error);
  }
}

async function getProjectReferenceCounts({
  trx,
  companyId,
  projectId,
}: {
  trx: Knex.Transaction;
  companyId: string;
  projectId: string;
}): Promise<Record<string, number>> {
  const countLedgerEntries = async () => {
    const row = await trx('ledger_entries as le')
      .join('ledger_transactions as lt', 'lt.id', 'le.ledger_transaction_id')
      .where({
        'lt.company_id': companyId,
        'le.project_id': projectId,
      })
      .count('* as count')
      .first();
    return Number(row?.count ?? 0);
  };

  const countJournalEntries = async () => {
    const row = await trx('journal_entries as je')
      .join('journal_batches as jb', 'jb.id', 'je.journal_batch_id')
      .where({
        'jb.company_id': companyId,
        'je.project_id': projectId,
      })
      .count('* as count')
      .first();
    return Number(row?.count ?? 0);
  };

  const countCategorizationCandidateLines = async () => {
    const row = await trx('categorization_candidate_lines as ccl')
      .join('categorization_candidates as cc', 'cc.id', 'ccl.candidate_id')
      .where({
        'cc.company_id': companyId,
        'ccl.project_id': projectId,
      })
      .count('* as count')
      .first();
    return Number(row?.count ?? 0);
  };

  const countCategorizationPredictionLines = async () => {
    const row = await trx('categorization_prediction_lines as cpl')
      .join('categorization_predictions as cp', 'cp.id', 'cpl.prediction_id')
      .where({
        'cp.company_id': companyId,
        'cpl.project_id': projectId,
      })
      .count('* as count')
      .first();
    return Number(row?.count ?? 0);
  };

  return {
    ledgerEntries: await countLedgerEntries(),
    journalEntries: await countJournalEntries(),
    categorizationCandidateLines: await countCategorizationCandidateLines(),
    categorizationPredictionLines: await countCategorizationPredictionLines(),
  };
}
