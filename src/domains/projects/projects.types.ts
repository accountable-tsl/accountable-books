import z from "zod";
import {
  createCamelCaseSchema,
  SnakeToCamelCaseObject,
} from "../../shared/utils/formatting.utils";
import { dbBaseFields } from "../../core/types/core";
import type { Knex } from "knex";
import { Pagination } from "../../shared/types/random";

export const projectStatus = z.enum([
  "in_draft",
  "in_progress",
  "on_hold",
  "completed",
  "cancelled",
]);
export type ProjectStatus = z.infer<typeof projectStatus>;

const newProjectBase = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2, "Project name is required").max(256),
  code: z.string().nullable(),
  description: z.string().max(512).nullish(),
  status: projectStatus.default("in_draft"),
  contact_id: z.string().uuid(),
  start_date: z.date().nullish(),
  end_date: z.date().nullish(),
});

export const newProjectInput = createCamelCaseSchema(newProjectBase);
export type NewProjectInput = SnakeToCamelCaseObject<
  z.infer<typeof newProjectInput>
>;

const newProject = newProjectBase.extend({
  company_id: z.string().uuid(),
  created_by_id: z.string().uuid(),
  updated_by_id: z.string().uuid().optional(),
});
export type NewProject = z.infer<typeof newProject>;

export const updateProjectInput = createCamelCaseSchema(
  newProjectBase.partial()
);
export type UpdateProjectInput = SnakeToCamelCaseObject<
  z.infer<typeof updateProjectInput>
>;

export const project = newProject.merge(dbBaseFields);
export type Project = z.infer<typeof project>;

export type ProjectResponse = {
  projects: (NewProjectInput & { contactName: string; createdAt: string })[];
  pagination: Pagination;
};

export const sortFields = [
  "created_at",
  "name",
  "status",
  "start_date",
  "end_date",
] as const;
export type SortField = (typeof sortFields)[number];

const sortOrderEnum = z.enum(["asc", "desc"]);

export const getProjectsParams = z.object({
  companyId: z.string().nonempty(),
  ids: z.array(z.string()).optional(),
  status: projectStatus.optional(),
  contactIds: z.array(z.string()).optional(),
  search: z.string().optional(),
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(100).default(30).optional(),
  sortBy: z.enum(sortFields).optional(),
  sortOrder: sortOrderEnum.optional(),
  trx: z.any().optional(),
});

export type GetProjectsParams = z.infer<typeof getProjectsParams> & {
  trx?: Knex.Transaction;
};
