import type { Knex } from "knex";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { ENV, NODE_ENV } from "../../src/config/env";
import { newUserDirect, NewUserDirect } from "../../src/core/types/db.type";
import { createUserDirect } from "../../src/models/user.model";
import { generateRandomToken } from "../../utils/utils";
import { hashPassword } from "../../src/lib/bcrypt";

export async function up(knex: Knex): Promise<void> {
  const saltRounds = 10;
  const isProd = NODE_ENV === "production";

  if (isProd && (!ENV.ADMIN_PASSWORD || !ENV.ADMIN_EMAIL)) {
    throw new Error("ADMIN_PASSWORD must be set in production");
  } else if (ENV.ADMIN_PASSWORD && ENV.ADMIN_EMAIL) {
    const adminUser = {
      firstname: ENV.ADMIN_FIRSTNAME || "Admin",
      email: ENV.ADMIN_EMAIL,
      password: hashPassword(ENV.ADMIN_PASSWORD),
    };

    const parsed = newUserDirect.safeParse(adminUser);
    if (!parsed.success) {
      throw new Error(parsed.error.message);
    }

    createUserDirect(parsed.data);
  }

  if (
    (!isProd && !ENV.TEST_ADMIN_PASSWORD) ||
    !ENV.TEST_ADMIN_EMAIL ||
    !ENV.TEST_ADMIN_FIRSTNAME
  ) {
    throw new Error("Set TEST_ADMIN_PASSWORD and TEST_ADMIN_EMAIL in dev");
  } else if (ENV.TEST_ADMIN_PASSWORD && ENV.TEST_ADMIN_EMAIL) {
    const adminUser = {
      firstname: ENV.TEST_ADMIN_FIRSTNAME || "Admin",
      email: ENV.TEST_ADMIN_EMAIL,
      password: hashPassword(ENV.TEST_ADMIN_PASSWORD),
    };

    const parsed = newUserDirect.safeParse(adminUser);
    if (!parsed.success) throw new Error(parsed.error.message);

    createUserDirect(parsed.data);
  }
}

export async function down(knex: Knex): Promise<void> {}
