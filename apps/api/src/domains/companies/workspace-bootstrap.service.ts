import type { Knex } from 'knex';

import { ENV, isProd } from '../../config/env.js';
import { AppError } from '../../shared/utils/response.utils.js';
import { upsertDirectCompanyRole } from '../user-roles/user-roles.model.js';
import {
  provisionCompanyWorkspace,
  reconcileCompanyWorkspace,
} from './company-provisioning.service.js';
import {
  BOOTSTRAP_SYSTEM_FIRMS,
  buildPlatformWorkspaceSeed,
  PLATFORM_WORKSPACE_ID,
  PLATFORM_WORKSPACE_SHORT_CODE,
  SYSTEM_USER_EMAIL,
  SYSTEM_USER_ID,
} from './workspace-bootstrap.config.js';

import type { WorkspaceSideEffectMode } from './company-provisioning.service.js';

type SeedUser = { id: string; email: string };
type SystemFirmBootstrapAction = 'provisioned' | 'reconciled';

type BootstrapUserReference = {
  id?: string;
  email?: string;
  label: 'admin' | 'system';
  requiredUserType?: 'system';
};

function getAdminBootstrapReference(): BootstrapUserReference {
  const id = isProd ? ENV.ADMIN_ID : ENV.TEST_ADMIN_ID;
  const email = (isProd ? ENV.ADMIN_EMAIL : ENV.TEST_ADMIN_EMAIL)
    ?.trim()
    .toLowerCase();

  return {
    id,
    email,
    label: 'admin',
  };
}

function getSystemBootstrapReference(): BootstrapUserReference {
  return {
    id: SYSTEM_USER_ID,
    email: SYSTEM_USER_EMAIL,
    label: 'system',
    requiredUserType: 'system',
  };
}

async function resolveBootstrapUser(
  knex: Knex | Knex.Transaction,
  reference: BootstrapUserReference,
): Promise<SeedUser> {
  if (!reference.id && !reference.email) {
    throw new AppError(
      `Bootstrap ${reference.label} user configuration is missing`,
      reference,
      true,
    );
  }

  const query = knex('users')
    .select('id', 'email')
    .where((builder) => {
      let hasCondition = false;
      if (reference.id) {
        builder.where('id', reference.id);
        hasCondition = true;
      }
      if (reference.email) {
        if (hasCondition) {
          builder.orWhereRaw('LOWER(email) = ?', [reference.email]);
        } else {
          builder.whereRaw('LOWER(email) = ?', [reference.email]);
        }
      }
    });

  if (reference.requiredUserType) {
    query.andWhere('user_type', reference.requiredUserType);
  }

  const user = await query.first<{ id: string; email: string }>();

  if (!user?.id || !user.email) {
    throw new AppError(
      `Bootstrap ${reference.label} user not found. Run migrations first to seed prerequisite users.`,
      reference,
      true,
    );
  }

  return { id: user.id, email: user.email.trim().toLowerCase() };
}

async function resolveBootstrapActors(
  knex: Knex | Knex.Transaction,
): Promise<{ admin: SeedUser; systemUser: SeedUser }> {
  const [admin, systemUser] = await Promise.all([
    resolveBootstrapUser(knex, getAdminBootstrapReference()),
    resolveBootstrapUser(knex, getSystemBootstrapReference()),
  ]);

  return { admin, systemUser };
}

async function findExistingSystemFirmWorkspace(
  knex: Knex | Knex.Transaction,
  seed: (typeof BOOTSTRAP_SYSTEM_FIRMS)[number],
): Promise<{ id: string } | null> {
  const existing = await knex('companies')
    .where((builder) =>
      builder.where({ id: seed.id }).orWhere({ short_code: seed.shortCode }),
    )
    .select('id')
    .first<{ id: string }>();

  return existing ?? null;
}

async function findExistingPlatformWorkspace(
  knex: Knex | Knex.Transaction,
): Promise<{ id: string } | null> {
  const existing = await knex('companies')
    .where((b) =>
      b
        .where({ id: PLATFORM_WORKSPACE_ID })
        .orWhere({ short_code: PLATFORM_WORKSPACE_SHORT_CODE }),
    )
    .select('id')
    .first<{ id: string }>();

  return existing ?? null;
}

export async function isPlatformWorkspaceBootstrapped(
  knex: Knex,
): Promise<boolean> {
  const existing = await findExistingPlatformWorkspace(knex);
  return !!existing?.id;
}

export async function bootstrapPlatformWorkspace(
  knex: Knex,
  options: { sideEffectMode?: WorkspaceSideEffectMode } = {},
): Promise<{
  action: 'provisioned' | 'reconciled';
  companyId: string;
  adminUserId: string;
  systemUserId: string;
}> {
  const sideEffectMode = options.sideEffectMode ?? 'skip_jobs';
  const { admin, systemUser } = await resolveBootstrapActors(knex);

  const { companyId, action } = await knex.transaction(async (trx) => {
    const existing = await findExistingPlatformWorkspace(trx);
    const platformSeed = buildPlatformWorkspaceSeed(admin.id);

    if (!existing?.id) {
      const result = await provisionCompanyWorkspace({
        trx,
        actorUserId: admin.id,
        ownerUserId: admin.id,
        billingEmail: admin.email,
        policy: { kind: 'platform_bootstrap' },
        company: {
          ...platformSeed,
          skip_side_effects: sideEffectMode === 'skip_jobs',
        },
      });

      await grantSpecialPlatformRoles(
        trx,
        result.company.id,
        admin.id,
        systemUser.id,
      );
      return { companyId: result.company.id, action: 'provisioned' as const };
    }

    await reconcileCompanyWorkspace({
      trx,
      companyId: existing.id,
      actorUserId: admin.id,
      ownerUserId: admin.id,
      billingEmail: admin.email,
      policy: { kind: 'platform_bootstrap' },
      company: {
        ...platformSeed,
        skip_side_effects: sideEffectMode === 'skip_jobs',
      },
    });

    await grantSpecialPlatformRoles(trx, existing.id, admin.id, systemUser.id);
    return { companyId: existing.id, action: 'reconciled' as const };
  });

  return {
    action,
    companyId,
    adminUserId: admin.id,
    systemUserId: systemUser.id,
  };
}

async function grantSpecialPlatformRoles(
  trx: Knex.Transaction,
  companyId: string,
  adminUserId: string,
  systemUserId: string,
): Promise<void> {
  await upsertDirectCompanyRole({
    trx,
    userId: adminUserId,
    companyUUID: companyId,
    roleKey: 'super_admin',
    grantedBy: adminUserId,
  });

  await upsertDirectCompanyRole({
    trx,
    userId: systemUserId,
    companyUUID: companyId,
    roleKey: 'system_user',
    grantedBy: adminUserId,
  });
}

export async function seedSystemFirms(
  knex: Knex,
  options: { sideEffectMode?: WorkspaceSideEffectMode } = {},
): Promise<{
  adminUserId: string;
  results: Array<{
    companyId: string;
    shortCode: string;
    action: SystemFirmBootstrapAction;
  }>;
}> {
  const sideEffectMode = options.sideEffectMode ?? 'skip_jobs';
  const { admin } = await resolveBootstrapActors(knex);
  const results: Array<{
    companyId: string;
    shortCode: string;
    action: SystemFirmBootstrapAction;
  }> = [];

  for (const seed of BOOTSTRAP_SYSTEM_FIRMS) {
    const result = await knex.transaction(async (trx) => {
      const existing = await findExistingSystemFirmWorkspace(trx, seed);
      const company = {
        id: seed.id,
        legal_name: seed.legalName,
        display_name: seed.displayName,
        short_code: seed.shortCode,
        type: 'accounting_firm' as const,
        country_id: seed.countryId,
        reporting_currency_id: seed.reportingCurrencyId,
        default_timezone: seed.defaultTimezone,
        reporting_framework: seed.reportingFramework,
        created_by_id: admin.id,
        year_end_day: 31,
        year_end_month: 12,
        accounting_basis: 'modified_accrual_basis' as const,
        slug: seed.slug,
        skip_side_effects: sideEffectMode === 'skip_jobs',
      };

      if (!existing?.id) {
        const provisioned = await provisionCompanyWorkspace({
          trx,
          actorUserId: admin.id,
          ownerUserId: admin.id,
          billingEmail: admin.email,
          policy: { kind: 'system_seed' },
          company,
        });

        return {
          companyId: provisioned.company.id,
          shortCode: seed.shortCode,
          action: 'provisioned' as const,
        };
      }

      await reconcileCompanyWorkspace({
        trx,
        companyId: existing.id,
        actorUserId: admin.id,
        ownerUserId: admin.id,
        billingEmail: admin.email,
        policy: { kind: 'system_seed' },
        company,
      });

      return {
        companyId: existing.id,
        shortCode: seed.shortCode,
        action: 'reconciled' as const,
      };
    });

    results.push(result);
  }

  return {
    adminUserId: admin.id,
    results,
  };
}

export async function bootstrapApplicationWorkspaces(
  knex: Knex,
  options: { sideEffectMode?: WorkspaceSideEffectMode } = {},
): Promise<{
  platform: Awaited<ReturnType<typeof bootstrapPlatformWorkspace>>;
  systemFirms: Awaited<ReturnType<typeof seedSystemFirms>>;
}> {
  const sideEffectMode = options.sideEffectMode ?? 'skip_jobs';

  const platform = await bootstrapPlatformWorkspace(knex, {
    sideEffectMode,
  });
  const systemFirms = await seedSystemFirms(knex, {
    sideEffectMode,
  });

  return { platform, systemFirms };
}
