import type { ProjectStatus } from '../../../../src/domains/projects/projects.types.js';

export type DemoProject = {
  id: string;
  name: string;
  code?: string;
  description?: string;
  status: ProjectStatus;
  contactId: string;
  startDate?: string;
  endDate?: string;
  companyId: string;
  userId: string;
};

/**
 * Map to store created demo projects by company ID
 * This is populated after projects are inserted into the database
 */
export const demoProjectsByCompanyMap = new Map<string, DemoProject[]>();
