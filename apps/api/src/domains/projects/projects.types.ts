import type { Knex } from 'knex';
import z from 'zod';

import { zDateYMD } from '../../core/types/core.js';
import { type Pagination } from '../../shared/types/random.js';
import { createCamelCaseSchema } from '../../shared/utils/formatting.utils.js';

import type { SnakeToCamelCaseObject } from '../../shared/utils/formatting.utils.js';

export const projectStatus = z.enum([
  'in_draft',
  'in_progress',
  'on_hold',
  'completed',
  'cancelled',
]);
export type ProjectStatus = z.infer<typeof projectStatus>;

const hasValidDateRange = (project: {
  start_date?: string | null;
  end_date?: string | null;
}) =>
  !project.start_date ||
  !project.end_date ||
  project.start_date <= project.end_date;

const newProjectBase = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2, 'Project name is required').max(256),
  code: z.string().trim().min(1).max(64).nullish(),
  description: z.string().trim().min(1).max(512).nullish(),
  status: projectStatus.prefault('in_draft'),
  contact_id: z.uuid().nullish(),
  start_date: zDateYMD.nullish(),
  end_date: zDateYMD.nullish(),
});

export const newProjectInput = createCamelCaseSchema(
  newProjectBase.refine(hasValidDateRange, {
    message: 'Project end date cannot be before start date',
    path: ['end_date'],
  }),
);
export type NewProjectInput = SnakeToCamelCaseObject<
  z.infer<typeof newProjectInput>
>;

const newProjectRecord = newProjectBase.extend({
  company_id: z.uuid(),
  created_by_id: z.uuid(),
  updated_by_id: z.uuid().nullish(),
  deleted_by_id: z.uuid().nullish(),
  is_deleted: z.boolean().optional(),
  deleted_at: z.date().nullish(),
});

const newProject = newProjectRecord.refine(hasValidDateRange, {
  message: 'Project end date cannot be before start date',
  path: ['end_date'],
});
export type NewProject = z.infer<typeof newProject>;

const updateProjectBase = newProjectBase.partial().extend({
  id: z.uuid(),
});
export const updateProjectInput = createCamelCaseSchema(updateProjectBase);
export type UpdateProjectInput = SnakeToCamelCaseObject<
  z.infer<typeof updateProjectBase>
>;

export const deleteProjectInput = z.object({
  id: z.uuid(),
});
export type DeleteProjectInput = z.infer<typeof deleteProjectInput>;

export const project = newProjectRecord
  .extend({
    id: z.uuid(),
    created_at: z.date(),
    updated_at: z.date(),
  })
  .refine(hasValidDateRange, {
    message: 'Project end date cannot be before start date',
    path: ['end_date'],
  });
export type Project = z.infer<typeof project>;

export type ProjectResponse = {
  projects: Array<
    NewProjectInput & {
      id: string;
      contactName: string | null;
      createdAt: string;
      updatedAt: string;
      isDeleted: boolean;
      deletedAt: string | null;
      deletedById: string | null;
    }
  >;
  pagination: Pagination;
};

export const sortFields = [
  'created_at',
  'name',
  'status',
  'start_date',
  'end_date',
] as const;
export type SortField = (typeof sortFields)[number];

const sortOrderEnum = z.enum(['asc', 'desc']);

export const getProjectsParams = z.object({
  companyId: z.string().nonempty(),
  ids: z.array(z.string()).optional(),
  status: projectStatus.optional(),
  contactIds: z.array(z.string()).optional(),
  search: z.string().optional(),
  page: z.int().min(1).optional(),
  limit: z.int().min(1).max(100).prefault(30).optional(),
  includeDeleted: z.boolean().optional().default(false),
  searchFields: z
    .array(z.enum(['name', 'code', 'description', 'contactName']))
    .optional(),
  sortBy: z.enum(sortFields).optional(),
  sortOrder: sortOrderEnum.optional(),
  trx: z.any().optional(),
});

export type GetProjectsParams = z.infer<typeof getProjectsParams> & {
  trx?: Knex.Transaction;
};
