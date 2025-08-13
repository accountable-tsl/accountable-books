import type { Knex } from 'knex';
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/timestamp';
import { createUserDirect } from '../src/domains/users/users.model';
import { ENV, NODE_ENV } from '../src/config/env';
import { NewUserDirect } from '../src/domains/users/users.types';
import {
  createInitialUserOnboardingState,
  markAllOnboardingStepsComplete,
} from '../src/features/onboarding/onboarding.utils';

const tableName = 'users';

const getAdminUserConfig = (): NewUserDirect => {
  if (NODE_ENV === 'production') {
    return {
      id: ENV.ADMIN_ID,
      firstname: ENV.ADMIN_FIRSTNAME!,
      lastname: ENV.ADMIN_LASTNAME,
      email: ENV.ADMIN_EMAIL!,
      password: ENV.ADMIN_PASSWORD!,
      email_verified_at: new Date(),
    };
  }

  // Default to test admin in non-production environments
  return {
    id: ENV.TEST_ADMIN_ID,
    firstname: ENV.TEST_ADMIN_FIRSTNAME!,
    lastname: ENV.TEST_ADMIN_LASTNAME,
    email: ENV.TEST_ADMIN_EMAIL!,
    password: ENV.TEST_ADMIN_PASSWORD!,
    email_verified_at: new Date(),
  };
};
const currState = createInitialUserOnboardingState();
const completeOnbState = currState && markAllOnboardingStepsComplete(currState);

export const adminUser = {
  ...getAdminUserConfig(),
  onboarding_state: completeOnbState,
};

export const seedAdminUser = async (knex: Knex) => {
  const { password, email, firstname } = adminUser;

  if (!password || !email || !firstname) {
    throw new Error(
      'Admin user configuration is incomplete. Required fields: password, email, firstname',
    );
  }
  return knex.transaction(async (trx) => {
    const existingUser = await trx(tableName).where({ email }).first();

    if (existingUser) {
      console.log(`Admin user ${email} already exists. Skipping insert.`);
      return { success: true, data: existingUser };
    }

    const result = await createUserDirect(trx, adminUser);
    if (!result.success) {
      console.error(`Failed to create admin user: ${result.message}`);
      throw new Error(result.message);
    }

    console.log(`Successfully created admin user: ${email}`);
    return result;
  });
};

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table.string('firstname', 256).notNullable();
    table.string('lastname', 256).nullable();

    table.string('email', 254).unique().notNullable();
    table.string('password', 256).nullable();
    table.string('phone_number', 20).nullable();
    table.string('avatar_url').nullable();
    table.string('avatar_key').nullable();

    table.timestamp('email_verified_at', { useTz: true }).nullable();
    table.jsonb('onboarding_state').nullable();
    table.timestamp('onboarding_completed_at', { useTz: true }).nullable();

    table.uuid('last_active_company_id').nullable();
    // .references("id")
    // .inTable("companies"); // Added foreign key after migrating companies talbe

    table.boolean('is_demo_user').defaultTo(false);

    addStandardColumns(table);
  });

  await createUpdateTimestampTrigger(knex, tableName);
  // await seedAdminUser(knex);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
