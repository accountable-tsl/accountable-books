import type { Knex } from 'knex';

const USERS_TABLE = 'users';
const USERS_EMAIL_UNIQUE_CONSTRAINT = 'users_email_unique';

export const SYSTEM_USER_ID = '4324386b-1481-46f4-a63a-1d3ed515c2df';
export const SYSTEM_USER_EMAIL = 'system@getaccountable.com';

const SYSTEM_USER = {
  id: SYSTEM_USER_ID,
  email: SYSTEM_USER_EMAIL,
  firstname: 'System',
  lastname: 'User',
  user_type: 'system' as const,
};

export type SystemUser = {
  id: string;
  email: string;
  user_type: 'system';
  is_deleted: boolean;
};

type ExistingSystemUser = SystemUser & {
  firstname: string;
  lastname: string | null;
  password: string | null;
  email_verified_at: Date | null;
  onboarding_state: unknown;
  onboarding_completed_at: Date | null;
  last_active_company_id: string | null;
  deleted_at: Date | null;
};

type PgError = {
  code?: string;
  constraint?: string;
};

function isPgError(error: unknown): error is PgError {
  return typeof error === 'object' && error !== null;
}

function getPgConstraint(error: unknown): string | undefined {
  if (!isPgError(error)) return undefined;
  return error.constraint;
}

function isSystemEmailCollision(error: unknown): boolean {
  if (!isPgError(error) || error.code !== '23505') return false;
  return getPgConstraint(error) === USERS_EMAIL_UNIQUE_CONSTRAINT;
}

function buildSystemUserSeed() {
  return {
    id: SYSTEM_USER.id,
    email: SYSTEM_USER.email.trim().toLowerCase(),
    firstname: SYSTEM_USER.firstname,
    lastname: SYSTEM_USER.lastname,
    user_type: SYSTEM_USER.user_type,
    password: null,
    email_verified_at: new Date(),
    onboarding_state: null,
    onboarding_completed_at: null,
    last_active_company_id: null,
    is_deleted: false,
    deleted_at: null,
  };
}

/**
 * Reconciles the canonical system user row.
 *
 * Idempotent. Safe to run after every migration.
 *
 * - Creates the row if missing.
 * - Snaps identity/state fields back to canonical values.
 * - Keeps the user non-loginable by forcing password to null.
 * - Restores the row if it was soft-deleted.
 * - Preserves an existing `email_verified_at` timestamp.
 * - Fails loudly if another user owns the canonical system email.
 */
export async function reconcileSystemUser(
  trx: Knex.Transaction,
): Promise<SystemUser> {
  const seed = buildSystemUserSeed();

  try {
    await trx(USERS_TABLE).insert(seed).onConflict('id').ignore();

    const existing = await trx(USERS_TABLE)
      .select(
        'id',
        'email',
        'firstname',
        'lastname',
        'user_type',
        'password',
        'email_verified_at',
        'onboarding_state',
        'onboarding_completed_at',
        'last_active_company_id',
        'is_deleted',
        'deleted_at',
      )
      .where({ id: seed.id })
      .first<ExistingSystemUser>();

    if (!existing) {
      throw new Error('System user reconcile returned no row.');
    }

    const patch: Record<string, unknown> = {};

    if (existing.email.trim().toLowerCase() !== seed.email) {
      patch.email = seed.email;
    }
    if (existing.firstname !== seed.firstname) {
      patch.firstname = seed.firstname;
    }
    if (existing.lastname !== seed.lastname) {
      patch.lastname = seed.lastname;
    }
    if (existing.user_type !== seed.user_type) {
      patch.user_type = seed.user_type;
    }
    if (existing.password !== null) {
      patch.password = null;
    }
    if (!existing.email_verified_at) {
      patch.email_verified_at = seed.email_verified_at;
    }
    if (existing.onboarding_state !== null) {
      patch.onboarding_state = null;
    }
    if (existing.onboarding_completed_at !== null) {
      patch.onboarding_completed_at = null;
    }
    if (existing.last_active_company_id !== null) {
      patch.last_active_company_id = null;
    }
    if (existing.is_deleted !== false) {
      patch.is_deleted = false;
    }
    if (existing.deleted_at !== null) {
      patch.deleted_at = null;
    }

    if (Object.keys(patch).length === 0) {
      return {
        id: existing.id,
        email: existing.email,
        user_type: existing.user_type,
        is_deleted: existing.is_deleted,
      };
    }

    const [systemUser] = await trx(USERS_TABLE)
      .where({ id: seed.id })
      .update(patch)
      .returning<SystemUser[]>(['id', 'email', 'user_type', 'is_deleted']);

    if (!systemUser) {
      throw new Error('System user reconcile returned no row.');
    }

    return systemUser;
  } catch (error) {
    if (isSystemEmailCollision(error)) {
      throw new Error(
        `System user reconcile failed: ${SYSTEM_USER.email} already belongs to another user. Resolve the collision before re-running bootstrap.`,
      );
    }

    throw error;
  }
}

export async function bootstrapUsers(
  trx: Knex.Transaction,
): Promise<{ systemUser: SystemUser }> {
  const systemUser = await reconcileSystemUser(trx);
  return { systemUser };
}
