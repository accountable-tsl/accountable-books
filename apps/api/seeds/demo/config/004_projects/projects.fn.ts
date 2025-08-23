import type { Knex } from 'knex';
import type { DemoFilter } from '../../shared/config';
import { addNewProjects } from '../../../../src/domains/projects/projects.model';
import { deleteDemoData } from '../../shared/utils';
import { generateDemoProjectsMap } from './projects.data';

export const createDemoProjects = async (trx: Knex.Transaction, filters?: DemoFilter) => {
  const projectsMap = generateDemoProjectsMap(filters);
  for (const item of projectsMap) {
    const { projects, user, company } = item;
    if (!projects) continue;

    const res = await addNewProjects({
      input: projects,
      trx,
      companyId: company.id,
      userId: user.id,
    });
    if (!res.success) {
      throw new Error(res.message || `Failed to create demo projects for ${company.name}`);
    }
  }
};

export const deleteDemoProjects = async (trx: Knex.Transaction, filters?: DemoFilter) => {
  return await deleteDemoData({
    trx,
    table: 'projects',
    filters,
  });
};
