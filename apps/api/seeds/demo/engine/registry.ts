import type { Knex } from 'knex';
import type { DemoFilter } from '../shared/config.js';
import {
  createDemoCompaniesAndUsers,
  deleteDemoCompanies,
} from '../config/002_companies/companies.fn.js';
import {
  createDemoContacts,
  deleteDemoContacts,
} from '../config/010_contacts/contacts.fn.js';
import {
  createDemoProjects,
  deleteDemoProjects,
} from '../config/012_projects/projects.fn.js';
import {
  createDemoBankAccounts,
  deleteDemoBankAccounts,
} from '../config/015_bank_accounts/bank-accounts.fn.js';
import {
  createDemoUsers,
  deleteDemoUsers,
} from '../config/001_users/users.fn.js';
import { createDemoCoa, deleteDemoCoa } from '../config/003_coa/coa.fn.js';

export type SeedStep = {
  name: string;
  order: number;
  createFn?: (trx: Knex.Transaction, filters?: DemoFilter) => Promise<any>;
  deleteFn?: (trx: Knex.Transaction, filters?: DemoFilter) => Promise<any>;
};

export const SEED_STEPS: SeedStep[] = [
  {
    name: 'user',
    order: 1,
    createFn: createDemoUsers,
    deleteFn: deleteDemoUsers,
  },
  {
    name: 'companies',
    order: 2,
    createFn: createDemoCompaniesAndUsers,
    deleteFn: deleteDemoCompanies,
  },
  {
    name: 'chart-of-accounts',
    order: 3,
    createFn: createDemoCoa,
    deleteFn: deleteDemoCoa,
  },

  {
    name: 'contacts',
    order: 4,
    createFn: createDemoContacts,
    deleteFn: deleteDemoContacts,
  },
  {
    name: 'projects',
    order: 5,
    createFn: createDemoProjects,
    deleteFn: deleteDemoProjects,
  },
  {
    name: 'bank-accounts',
    order: 6,
    createFn: createDemoBankAccounts,
    deleteFn: deleteDemoBankAccounts,
  },
];
