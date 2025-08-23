import type { Knex } from 'knex';
import { ENV, NODE_ENV } from '../../src/config/env';
import { hashPassword } from '../../src/shared/utils/crypto.utils';
import { newUserDirect } from '../../src/domains/users/users.types';
import { createUserDirect } from '../../src/domains/users/users.model';

export async function up(knex: Knex.Transaction): Promise<void> {
  const isProd = NODE_ENV === 'production';

  if (isProd && (!ENV.ADMIN_PASSWORD || !ENV.ADMIN_EMAIL)) {
    throw new Error('ADMIN_PASSWORD must be set in production');
  } else if (ENV.ADMIN_PASSWORD && ENV.ADMIN_EMAIL) {
    const hashedPassword = await hashPassword(ENV.ADMIN_PASSWORD);
    const adminUser = {
      firstname: ENV.ADMIN_FIRSTNAME || 'Admin',
      email: ENV.ADMIN_EMAIL,
      password: hashedPassword,
    };

    const parsed = newUserDirect.safeParse(adminUser);
    if (!parsed.success) {
      throw new Error(parsed.error.message);
    }

    await createUserDirect({
      input: parsed.data,
      transaction: knex,
    });
  }

  if ((!isProd && !ENV.TEST_ADMIN_PASSWORD) || !ENV.TEST_ADMIN_EMAIL || !ENV.TEST_ADMIN_FIRSTNAME) {
    throw new Error('Set TEST_ADMIN_PASSWORD and TEST_ADMIN_EMAIL in dev');
  } else if (ENV.TEST_ADMIN_PASSWORD && ENV.TEST_ADMIN_EMAIL) {
    const hashedPassword = await hashPassword(ENV.TEST_ADMIN_PASSWORD);
    const adminUser = {
      firstname: ENV.TEST_ADMIN_FIRSTNAME || 'Admin',
      email: ENV.TEST_ADMIN_EMAIL,
      password: hashedPassword,
    };

    const parsed = newUserDirect.safeParse(adminUser);
    if (!parsed.success) throw new Error(parsed.error.message);

    await createUserDirect({
      input: parsed.data,
      transaction: knex,
    });
  }
}

export async function down(_knex: Knex): Promise<void> {}
