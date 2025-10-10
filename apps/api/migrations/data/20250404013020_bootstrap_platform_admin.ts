import type { Knex } from 'knex';
import bcrypt from 'bcrypt';
import { ENV, isProd } from '../../config/env-loader';
import { createUser } from '../20250403184441_users';

export async function up(knex: Knex.Transaction): Promise<void> {
  if (isProd && (!ENV.ADMIN_PASSWORD || !ENV.ADMIN_EMAIL)) {
    throw new Error('ADMIN_PASSWORD must be set in production');
  } else if (ENV.ADMIN_PASSWORD && ENV.ADMIN_EMAIL) {
    const hashedPassword = await bcrypt.hash(ENV.ADMIN_PASSWORD, 12);
    const adminUser = {
      firstname: ENV.ADMIN_FIRSTNAME || 'Admin',
      email: ENV.ADMIN_EMAIL,
      password: hashedPassword,
      email_verified_at: new Date(),
    };

    await createUser({
      user: adminUser,
      trx: knex,
    });
  }

  if (
    (!isProd && !ENV.TEST_ADMIN_PASSWORD) ||
    !ENV.TEST_ADMIN_EMAIL ||
    !ENV.TEST_ADMIN_FIRSTNAME
  ) {
    throw new Error('Set TEST_ADMIN_PASSWORD and TEST_ADMIN_EMAIL in dev');
  } else if (ENV.TEST_ADMIN_PASSWORD && ENV.TEST_ADMIN_EMAIL) {
    const hashedPassword = await bcrypt.hash(ENV.TEST_ADMIN_PASSWORD, 12);
    const adminUser = {
      firstname: ENV.TEST_ADMIN_FIRSTNAME || 'Admin',
      email: ENV.TEST_ADMIN_EMAIL,
      password: hashedPassword,
      email_verified_at: new Date(),
    };

    await createUser({
      user: adminUser,
      trx: knex,
    });
  }
}

export async function down(_knex: Knex): Promise<void> {}
