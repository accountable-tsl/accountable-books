import type { Knex } from 'knex';
import { DemoFilter } from '../shared/config.js';
import { createDemoUsers, deleteDemoUsers } from '../config/001_users/users.fn.js';
import { createDemoCompanies, deleteDemoCompanies } from '../config/002_companies/companies.fn.js';
import { createDemoContacts, deleteDemoContacts } from '../config/003_contacts/contacts.fn.js';
// import { createDemoProjects, deleteDemoProjects } from '../config/004_projects/projects.fn.js';

export type SeedStep = {
  name: string;
  order: number;
  createFn: (trx: Knex.Transaction, filters?: DemoFilter) => Promise<void>;
  deleteFn: (trx: Knex.Transaction, filters?: DemoFilter) => Promise<any>;
};

export const SEED_STEPS: SeedStep[] = [
  { name: 'users', order: 1, createFn: createDemoUsers, deleteFn: deleteDemoUsers },
  { name: 'companies', order: 2, createFn: createDemoCompanies, deleteFn: deleteDemoCompanies },
  { name: 'contacts', order: 3, createFn: createDemoContacts, deleteFn: deleteDemoContacts },
  // { name: 'projects', order: 4, createFn: createDemoProjects, deleteFn: deleteDemoProjects },
];
