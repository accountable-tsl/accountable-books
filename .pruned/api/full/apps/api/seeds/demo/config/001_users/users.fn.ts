import type { Knex } from 'knex';
import { createUserDirect } from '../../../../src/domains/users/users.model.js';
import { DEMO_USERS, NG_USER, US_USER } from './users.data.js';
import { faker } from '@faker-js/faker';
import { DemoFilter } from '../../shared/config.js';

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
  const f = filters?.countryCodes?.length === 1 ? filters.countryCodes[0] : undefined;
  let userId: string | undefined;
  if (f === 'NG') {
    userId = NG_USER.id;
  } else if (f === 'US') {
    userId = US_USER.id;
  }
  const qb = trx('users').where('is_demo_user', true);
  if (userId) {
    qb.andWhere('id', userId);
  }
  await qb.delete();
};
