import z from 'zod';

export const projectStatus = z.enum([
  'in_draft',
  'in_progress',
  'on_hold',
  'completed',
  'cancelled',
]);
export type ProjectStatus = z.infer<typeof projectStatus>;

export const sortFields = ['created_at', 'name', 'status', 'start_date', 'end_date'] as const;
export type SortField = (typeof sortFields)[number];

const sortOrderEnum = z.enum(['asc', 'desc']);

export const newProject = z.object({
  id: z.uuid().optional(),
  name: z.string().min(2, 'Project name is required').max(256),
  code: z.string().nullable(),
  description: z.string().max(512).nullish(),
  status: projectStatus.prefault('in_draft').optional(),
  searchFields: z
    .array(z.enum(['name', 'code', 'description', 'contactName', 'address']))
    .optional(),
  contactId: z.uuid(),
  startDate: z.date().nullish(),
  endDate: z.date().nullish(),
});
export type NewProject = z.infer<typeof newProject>;

export const fetchProjectsParams = z.object({
  companyId: z.string().nonempty(),
  ids: z.array(z.string()).optional(),
  status: projectStatus.optional(),
  contactIds: z.array(z.string()).optional(),
  search: z.string().optional(),
  page: z.int().min(1),
  limit: z.int().min(1).max(100),
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
  contactId: z.uuid(),
  contactName: z.string().nullish(),
  startDate: z.date().nullish(),
  endDate: z.date().nullish(),
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
