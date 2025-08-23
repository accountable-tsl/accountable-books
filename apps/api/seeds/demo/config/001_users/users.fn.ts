import type { Knex } from 'knex';
import { createUserDirect } from '../../../../src/domains/users/users.model.js';
import { DemoUser, DEMO_USERS } from './users.data.js';
import { faker } from '@faker-js/faker';
import { DemoFilter } from '../../shared/config.js';
import { resolveFiltersToIds } from '../../shared/utils.js';

export const createDemoUsers = async (trx: Knex.Transaction, filters?: DemoFilter) => {
  // For users, we always create all demo users since they're required for companies
  const users = DEMO_USERS;

  for (const user of users) {
    await createUserDirect({
      input: { ...user, avatar_url: faker.image.avatar(), is_demo_user: true },
      transaction: trx,
    });
  }
};
export const deleteDemoUsers = async (trx: Knex.Transaction, filters?: DemoFilter) => {
  const result = await trx('users').where('is_demo_user', true).delete();
  return result;
};
