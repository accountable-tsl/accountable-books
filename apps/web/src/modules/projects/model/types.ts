import z from 'zod';

export const projectStatus = z.enum([
  'in_draft',
  'in_progress',
  'on_hold',
  'completed',
  'cancelled',
]);
export type ProjectStatus = z.infer<typeof projectStatus>;

export const sortFields = [
  'created_at',
  'name',
  'status',
  'start_date',
  'end_date',
] as const;
export type SortField = (typeof sortFields)[number];

const sortOrderEnum = z.enum(['asc', 'desc']);

export const newProject = z
  .object({
    id: z.uuid().optional(),
    name: z.string().trim().min(2, 'Project name is required').max(256),
    code: z.string().trim().min(1).max(64).nullish(),
    description: z.string().trim().min(1).max(512).nullish(),
    status: projectStatus.prefault('in_draft').optional(),
    searchFields: z
      .array(z.enum(['name', 'code', 'description', 'contactName', 'address']))
      .optional(),
    contactId: z.uuid().nullish(),
    startDate: z.date().nullish(),
    endDate: z.date().nullish(),
  })
  .refine(
    (project) =>
      !project.startDate ||
      !project.endDate ||
      project.startDate <= project.endDate,
    {
      message: 'Project end date cannot be before start date',
      path: ['endDate'],
    },
  );
export type NewProject = z.infer<typeof newProject>;
export type NewProjectFormInput = z.input<typeof newProject>;

export const updateProject = newProject.partial().extend({
  id: z.uuid(),
});
export type UpdateProject = z.infer<typeof updateProject>;

export const fetchProjectsParams = z.object({
  companyId: z.string().nonempty(),
  ids: z.array(z.string()).optional(),
  status: projectStatus.optional(),
  contactIds: z.array(z.string()).optional(),
  search: z.string().optional(),
  page: z.int().min(1),
  limit: z.int().min(1).max(100),
  includeDeleted: z.boolean().optional(),
  sortBy: z.enum(sortFields).optional(),
  sortOrder: sortOrderEnum.optional(),
});
export type FetchProjectsParams = z.infer<typeof fetchProjectsParams>;

export const projects = z.object({
  id: z.uuid().optional(),
  name: z.string().min(2, 'Project name is required').max(256),
  code: z.string().nullable(),
  description: z.string().max(512).nullish(),
  status: projectStatus.prefault('in_draft'),
  contactId: z.uuid().nullable(),
  contactName: z.string().nullish(),
  startDate: z.union([z.date(), z.string().min(1)]).nullish(),
  endDate: z.union([z.date(), z.string().min(1)]).nullish(),
  createdAt: z.union([z.date(), z.string().min(1)]).nullish(),
  updatedAt: z.union([z.date(), z.string().min(1)]).nullish(),
  isDeleted: z.boolean().optional(),
  deletedAt: z
    .union([z.date(), z.string().min(1)])
    .nullable()
    .optional(),
  deletedById: z.uuid().nullable().optional(),
});
export type Project = z.infer<typeof projects>;

interface Pagination {
  currentPage: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export type ProjectsResponse = {
  projects: Project[];
  pagination: Pagination;
};
