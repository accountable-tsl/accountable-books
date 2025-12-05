import bcrypt from 'bcrypt';
import crypto from 'crypto';
import type { Knex } from 'knex';

import { ENV, isProd } from '../config/env-loader.js';
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

export async function createUser({
  user: input,
  trx,
}: {
  user: {
    id?: string;
    email: string;
    password: string;
    firstname: string;
    lastname?: string | null;
    is_demo_user?: boolean;
    onboarding_state?: Record<string, unknown> | null;
    avatar_url?: string;
    email_verified_at: Date;
  };
  trx: Knex.Transaction;
}) {
  const sanitizedEmail = input.email.trim().toLowerCase();
  const hashedPassword = await bcrypt.hash(input.password, 12);
  const verificationToken = crypto.randomBytes(32).toString('hex');
  const hashedVerificationToken = await bcrypt.hash(verificationToken, 12);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const existingUser = await trx(tableName)
    .where({ email: sanitizedEmail })
    .select([
      'id',
      'firstname',
      'lastname',
      'email',
      'onboarding_state as onboardingState',
    ])
    .first();

  if (existingUser) {
    console.log(`User ${sanitizedEmail} already exists. Skipping insert.`);
    return { ...existingUser, verificationToken };
  }

  const [user] = await trx('users')
    .insert({
      ...input,
      email: sanitizedEmail,
      password: hashedPassword,
      email_verified_at: input.email_verified_at ?? new Date(),
    })
    .returning(['id', 'firstname', 'lastname', 'email', 'onboarding_state'])
    .onConflict('email')
    .ignore();

  if (!user || !user?.id) {
    console.log('User with this email already exists');
    return;
  }

  await trx('tokens')
    .insert({
      user_id: user.id,
      token_hash: hashedVerificationToken,
      expires_at: expiresAt,
      token_type: 'email_verification',
    })
    .returning('*');

  return {
    id: user.id,
    email: user.email,
    firstname: user.firstname,
    lastname: user.lastname,
    onboardingState: user.onboarding_state,
    verificationToken,
  };
}

const tableName = 'users';

const getAdminUserConfig = () => {
  if (isProd) {
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
const completeOnbState = {
  steps: {
    email_verified: true,
  },
  completed_at: {
    email_verified: new Date(),
  },
};

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
    const result = await createUser({
      user: adminUser,
      trx,
    });

    if (!result) {
      console.error(`Failed to create admin user`);
      throw new Error('Failed to create admin user');
    }

    console.log(`Successfully created admin user: ${email}`);
    return result;
  });
};

export const seedSystemUser = async (knex: Knex) => {
  const systemUserEmail = 'system@getaccountable.com';

  return knex.transaction(async (trx) => {
    const result = await createUser({
      user: {
        id: '4324386b-1481-46f4-a63a-1d3ed515c2df',
        firstname: 'System',
        lastname: 'User',
        email: systemUserEmail,
        password: await bcrypt.hash('system', 12),
        email_verified_at: new Date(),
        onboarding_state: completeOnbState,
      },
      trx,
    });

    if (!result) {
      console.error(`Failed to create system user`);
      throw new Error('Failed to create system user');
    }

    console.log(`Successfully created system user: ${systemUserEmail}`);
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

    addStandardColumns(knex, table);
  });

  await createUpdateTimestampTrigger(knex, tableName);
  // await seedAdminUser(knex);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
