import type { Knex } from 'knex';

import { knexClient } from '../../db/knexClient.js';
import { type CompanyOnboardingState } from '../../features/onboarding/onboarding.types.js';
import { logger } from '../../shared/utils/logger.js';
import {
  AppError,
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../shared/utils/response.utils.js';
import {
  isDemoWorkspace,
  isPlatformWorkspace,
} from '../companies/workspace-class.js';
import { roleKey } from '../roles/roles.types.js';
import {
  writeBreakGlassClosedAudit,
  writeBreakGlassOpenedAudit,
  writeSupportGrantCreatedAudit,
  writeSupportGrantRevokedAudit,
} from './support-access.audit.js';
import {
  sendBreakGlassClosedNotifications,
  sendBreakGlassOpenedNotifications,
} from './support-access.email.js';
import {
  BREAK_GLASS_MAX_TTL_MS,
  COMPANY_PROFILE_WRITE_MAX_TTL_MS,
  createSupportGrantRequest,
  listSupportGrantsResponse,
  openBreakGlassRequest,
  READ_ONLY_MAX_TTL_MS,
  revokeSupportGrantRequest,
  SUPPORT_ACCESS_RECENT_WINDOW_DAYS,
  supportGrantResponse,
} from './support-access.types.js';

import type { ApiResponse } from '../../core/types/api.types.js';
import type { AuditContextInput } from '../audit/audit.types.js';
import type {
  CompanyType,
  WorkspaceClass,
} from '../companies/companies.types.js';
import type { RoleKey } from '../roles/roles.types.js';
import type { AccessibleCompanies } from '../user-roles/user-roles.types.js';
import type {
  BreakGlassSessionResponse,
  BreakGlassSessionRow,
  CreateSupportGrantRequest,
  ListSupportGrantsResponse,
  OpenBreakGlassRequest,
  RevokeSupportGrantRequest,
  SupportAccessLevel,
  SupportGrantListRow,
  SupportGrantResponse,
} from './support-access.types.js';

const grantsTable = 'company_support_access_grants';
const breakGlassTable = 'company_break_glass_sessions';

const SUPPORT_PLATFORM_ROLE_KEYS = new Set<RoleKey>([
  roleKey.enum.support_admin,
  roleKey.enum.support_agent,
]);
const PLATFORM_ROLE_PRIORITY: RoleKey[] = [
  roleKey.enum.super_admin,
  roleKey.enum.support_admin,
  roleKey.enum.support_agent,
];

type CompanyAccessRow = {
  companyId: string;
  companyShortCode: string;
  legalName: string;
  displayName: string | null;
  companyType: CompanyType;
  workspaceClass: string;
  assignedFirmSlug: string | null;
  onboardingState: CompanyOnboardingState | null;
};

type CompanyAdminRecipient = {
  email: string;
};

type BreakGlassNotificationMeta = {
  companyName: string;
  companyShortCode: string;
  actorEmail: string;
  reason: string;
  expiresAt?: string;
  closedAt?: string;
  closeReason?: string | null;
  recipients: string[];
};

function now(): Date {
  return new Date();
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function parseExpiresAtWithMax(expiresAtIso: string, maxTtlMs: number): Date {
  const parsed = new Date(expiresAtIso);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError(
      'Invalid expiry timestamp',
      undefined,
      false,
      ErrorCode.INVALID_INPUT,
    );
  }

  const current = now();
  if (parsed.getTime() <= current.getTime()) {
    throw new AppError(
      'Expiry must be in the future',
      undefined,
      false,
      ErrorCode.INVALID_INPUT,
    );
  }

  if (parsed.getTime() - current.getTime() > maxTtlMs) {
    throw new AppError(
      'Expiry exceeds the maximum allowed duration',
      undefined,
      false,
      ErrorCode.INVALID_INPUT,
    );
  }

  return parsed;
}

function normalizeOptionalReason(
  reason: string | null | undefined,
): string | null {
  if (reason == null) return null;

  const trimmed = reason.trim();
  if (!trimmed) return null;
  if (trimmed.length > 500) {
    throw new AppError(
      'Reason must be 500 characters or fewer',
      undefined,
      false,
      ErrorCode.INVALID_INPUT,
    );
  }

  return trimmed;
}

function buildAccessibleCompany(
  row: CompanyAccessRow,
  options: {
    roleKey: RoleKey;
    accessOrigin: AccessibleCompanies['accessOrigin'];
    supportAccessLevel?: SupportAccessLevel | null;
    supportGrantId?: string | null;
    breakGlassSessionId?: string | null;
  },
): AccessibleCompanies {
  return {
    id: row.companyShortCode,
    legalName: row.legalName,
    displayName: row.displayName,
    assignedFirmSlug: row.assignedFirmSlug || '',
    companyType: row.companyType,
    workspaceClass: row.workspaceClass as WorkspaceClass,
    hasExplicitAccess: false,
    roleKey: options.roleKey,
    roleScope: 'platform',
    isDemoCompany: isDemoWorkspace(row.workspaceClass),
    isPlatformCompany: isPlatformWorkspace(row.workspaceClass),
    onboardingState: row.onboardingState,
    accessOrigin: options.accessOrigin,
    supportAccessLevel: options.supportAccessLevel ?? null,
    supportGrantId: options.supportGrantId ?? null,
    breakGlassSessionId: options.breakGlassSessionId ?? null,
  };
}

async function getPlatformRoleForUserInternal(
  userId: string,
  db: Knex | Knex.Transaction,
): Promise<RoleKey | null> {
  const rows = await db('user_company_roles as ucr')
    .join('roles as r', 'ucr.role_id', 'r.id')
    .join('companies as c', 'ucr.company_id', 'c.id')
    .where({
      'ucr.user_id': userId,
      'ucr.is_deleted': false,
      'c.workspace_class': 'platform',
    })
    .whereIn('r.key', PLATFORM_ROLE_PRIORITY)
    .select('r.key as roleKey');

  const keys = new Set(rows.map((row) => row.roleKey as RoleKey));
  return (
    PLATFORM_ROLE_PRIORITY.find((candidate) => keys.has(candidate)) ?? null
  );
}

async function getCompanyAccessRow(
  companyId: string,
  db: Knex | Knex.Transaction,
): Promise<CompanyAccessRow | null> {
  const row = await db('companies as c')
    .leftJoin(
      'accounting_firms_meta as af',
      'c.assigned_firm_id',
      'af.company_id',
    )
    .where('c.id', companyId)
    .select(
      'c.id as companyId',
      'c.short_code as companyShortCode',
      'c.legal_name as legalName',
      'c.display_name as displayName',
      'c.type as companyType',
      'c.workspace_class as workspaceClass',
      'af.slug as assignedFirmSlug',
      'c.onboarding_state as onboardingState',
    )
    .first();

  return row ?? null;
}

async function expireStaleSupportGrants(db: Knex | Knex.Transaction) {
  await db(grantsTable)
    .where('status', 'active')
    .andWhere('expires_at', '<=', now())
    .update({
      status: 'expired',
      updated_at: db.fn.now(),
    });
}

async function expireStaleBreakGlassSessions(db: Knex | Knex.Transaction) {
  await db(breakGlassTable)
    .where('status', 'active')
    .andWhere('expires_at', '<=', now())
    .update({
      status: 'expired',
      updated_at: db.fn.now(),
    });
}

function computeGrantStatus(
  row: Pick<SupportGrantListRow, 'status' | 'expiresAt'>,
) {
  if (row.status === 'revoked') return 'revoked' as const;
  return row.expiresAt.getTime() <= now().getTime() ? 'expired' : 'active';
}

function computeBreakGlassStatus(
  row: Pick<BreakGlassSessionRow, 'status' | 'expiresAt'>,
) {
  if (row.status === 'closed') return 'closed' as const;
  return row.expiresAt.getTime() <= now().getTime() ? 'expired' : 'active';
}

async function getCompanyAdminRecipients(
  companyId: string,
  db: Knex | Knex.Transaction,
): Promise<string[]> {
  const rows = await db('user_company_roles as ucr')
    .join('roles as r', 'ucr.role_id', 'r.id')
    .join('users as u', 'ucr.user_id', 'u.id')
    .where({
      'ucr.company_id': companyId,
      'ucr.is_deleted': false,
      'u.is_deleted': false,
    })
    .whereIn('r.key', [roleKey.enum.client_owner, roleKey.enum.client_admin])
    .distinct('u.email as email');

  return rows.map((row: CompanyAdminRecipient) => row.email);
}

async function getUserEmail(
  userId: string,
  db: Knex | Knex.Transaction,
): Promise<string | null> {
  const row = await db('users')
    .where({ id: userId, is_deleted: false })
    .select('email')
    .first();
  return row?.email ?? null;
}

async function getSupportGrantListRows(
  companyId: string,
  db: Knex | Knex.Transaction,
  options?: {
    supportUserId?: string;
    activeOnly?: boolean;
  },
): Promise<SupportGrantListRow[]> {
  const recentCutoff = new Date(
    Date.now() - SUPPORT_ACCESS_RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );

  const rows = await db(grantsTable)
    .join('companies as c', `${grantsTable}.company_id`, 'c.id')
    .join(
      'users as support_users',
      `${grantsTable}.support_user_id`,
      'support_users.id',
    )
    .where(`${grantsTable}.company_id`, companyId)
    .modify((queryBuilder) => {
      if (options?.supportUserId) {
        queryBuilder.andWhere(
          `${grantsTable}.support_user_id`,
          options.supportUserId,
        );
      }
      if (options?.activeOnly) {
        queryBuilder
          .andWhere(`${grantsTable}.status`, 'active')
          .andWhere(`${grantsTable}.expires_at`, '>', now());
        return;
      }
      queryBuilder.andWhere((scoped) => {
        scoped
          .where(`${grantsTable}.status`, 'active')
          .orWhere(`${grantsTable}.created_at`, '>=', recentCutoff)
          .orWhere(`${grantsTable}.revoked_at`, '>=', recentCutoff);
      });
    })
    .select(
      `${grantsTable}.id as id`,
      'c.short_code as companyShortCode',
      `${grantsTable}.support_user_id as supportUserId`,
      'support_users.email as supportUserEmail',
      `${grantsTable}.granted_by_user_id as grantedByUserId`,
      `${grantsTable}.support_access_level as supportAccessLevel`,
      `${grantsTable}.status as status`,
      `${grantsTable}.reason as reason`,
      `${grantsTable}.expires_at as expiresAt`,
      `${grantsTable}.created_at as createdAt`,
      `${grantsTable}.updated_at as updatedAt`,
      `${grantsTable}.revoked_at as revokedAt`,
      `${grantsTable}.revoked_by_user_id as revokedByUserId`,
      `${grantsTable}.revoke_reason as revokeReason`,
    )
    .orderBy(`${grantsTable}.created_at`, 'desc');

  return Promise.all(
    rows.map(async (row: Omit<SupportGrantListRow, 'supportUserRoleKey'>) => {
      const supportUserRoleKey =
        (await getPlatformRoleForUserInternal(row.supportUserId, db)) ??
        roleKey.enum.support_agent;

      return {
        ...row,
        supportUserRoleKey,
      } as SupportGrantListRow;
    }),
  );
}

async function getBreakGlassSessionRow(
  sessionId: string,
  companyId: string,
  db: Knex | Knex.Transaction,
): Promise<BreakGlassSessionRow | null> {
  const row = await db(breakGlassTable)
    .join('companies as c', `${breakGlassTable}.company_id`, 'c.id')
    .where({
      [`${breakGlassTable}.id`]: sessionId,
      [`${breakGlassTable}.company_id`]: companyId,
    })
    .select(
      `${breakGlassTable}.id as id`,
      'c.short_code as companyShortCode',
      `${breakGlassTable}.super_admin_user_id as superAdminUserId`,
      `${breakGlassTable}.status as status`,
      `${breakGlassTable}.reason as reason`,
      `${breakGlassTable}.expires_at as expiresAt`,
      `${breakGlassTable}.created_at as createdAt`,
      `${breakGlassTable}.updated_at as updatedAt`,
      `${breakGlassTable}.closed_at as closedAt`,
      `${breakGlassTable}.closed_by_user_id as closedByUserId`,
      `${breakGlassTable}.close_reason as closeReason`,
    )
    .first();

  return row ?? null;
}

function mapSupportGrantRowToResponse(
  row: SupportGrantListRow,
): SupportGrantResponse {
  return supportGrantResponse.parse({
    ...row,
    companyId: row.companyShortCode,
    status: computeGrantStatus(row),
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    revokedAt: toIso(row.revokedAt),
  });
}

function mapBreakGlassRowToResponse(
  row: BreakGlassSessionRow,
): BreakGlassSessionResponse {
  return {
    id: row.id,
    companyId: row.companyShortCode,
    superAdminUserId: row.superAdminUserId,
    supportAccessLevel: 'company_profile_write',
    status: computeBreakGlassStatus(row),
    reason: row.reason,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    closedAt: toIso(row.closedAt),
    closedByUserId: row.closedByUserId,
    closeReason: row.closeReason,
  };
}

export async function getPlatformRoleForUser(
  userId: string,
  trx?: Knex.Transaction,
): Promise<RoleKey | null> {
  return getPlatformRoleForUserInternal(userId, trx ?? knexClient);
}

export async function getActiveSupportGrantCompaniesForUser({
  userId,
  trx,
}: {
  userId: string;
  trx?: Knex.Transaction;
}): Promise<AccessibleCompanies[]> {
  const db = trx ?? knexClient;
  const platformRole = await getPlatformRoleForUserInternal(userId, db);
  if (!platformRole || !SUPPORT_PLATFORM_ROLE_KEYS.has(platformRole)) {
    return [];
  }

  await expireStaleSupportGrants(db);

  const rows = await db(grantsTable)
    .join('companies as c', `${grantsTable}.company_id`, 'c.id')
    .leftJoin(
      'accounting_firms_meta as af',
      'c.assigned_firm_id',
      'af.company_id',
    )
    .where({
      [`${grantsTable}.support_user_id`]: userId,
      [`${grantsTable}.status`]: 'active',
    })
    .andWhere(`${grantsTable}.expires_at`, '>', now())
    .where({
      'c.workspace_class': 'customer',
    })
    .select(
      'c.id as companyId',
      'c.short_code as companyShortCode',
      'c.legal_name as legalName',
      'c.display_name as displayName',
      'c.type as companyType',
      'c.workspace_class as workspaceClass',
      'af.slug as assignedFirmSlug',
      'c.onboarding_state as onboardingState',
      `${grantsTable}.id as supportGrantId`,
      `${grantsTable}.support_access_level as supportAccessLevel`,
    );

  return rows.map((row) =>
    buildAccessibleCompany(row as CompanyAccessRow, {
      roleKey: platformRole,
      accessOrigin: 'support_grant',
      supportAccessLevel: row.supportAccessLevel as SupportAccessLevel,
      supportGrantId: row.supportGrantId as string,
    }),
  );
}

export async function getActiveBreakGlassCompaniesForUser({
  userId,
  trx,
}: {
  userId: string;
  trx?: Knex.Transaction;
}): Promise<AccessibleCompanies[]> {
  const db = trx ?? knexClient;
  const platformRole = await getPlatformRoleForUserInternal(userId, db);
  if (platformRole !== roleKey.enum.super_admin) {
    return [];
  }

  await expireStaleBreakGlassSessions(db);

  const rows = await db(breakGlassTable)
    .join('companies as c', `${breakGlassTable}.company_id`, 'c.id')
    .leftJoin(
      'accounting_firms_meta as af',
      'c.assigned_firm_id',
      'af.company_id',
    )
    .where({
      [`${breakGlassTable}.super_admin_user_id`]: userId,
      [`${breakGlassTable}.status`]: 'active',
    })
    .andWhere(`${breakGlassTable}.expires_at`, '>', now())
    .where({
      'c.workspace_class': 'customer',
    })
    .select(
      'c.id as companyId',
      'c.short_code as companyShortCode',
      'c.legal_name as legalName',
      'c.display_name as displayName',
      'c.type as companyType',
      'c.workspace_class as workspaceClass',
      'af.slug as assignedFirmSlug',
      'c.onboarding_state as onboardingState',
      `${breakGlassTable}.id as breakGlassSessionId`,
    );

  return rows.map((row) =>
    buildAccessibleCompany(row as CompanyAccessRow, {
      roleKey: roleKey.enum.super_admin,
      accessOrigin: 'break_glass',
      supportAccessLevel: 'company_profile_write',
      breakGlassSessionId: row.breakGlassSessionId as string,
    }),
  );
}

export async function listSupportGrantsForCompany({
  companyId,
  supportUserId,
  activeOnly,
  trx,
}: {
  companyId: string;
  supportUserId?: string;
  activeOnly?: boolean;
  trx?: Knex.Transaction;
}): Promise<ApiResponse<ListSupportGrantsResponse>> {
  const db = trx ?? knexClient;

  try {
    await expireStaleSupportGrants(db);
    const grants = await getSupportGrantListRows(companyId, db, {
      supportUserId,
      activeOnly,
    });
    return successResponse(
      'Support grants retrieved successfully',
      listSupportGrantsResponse.parse({
        grants: grants.map(mapSupportGrantRowToResponse),
      }),
    );
  } catch (error) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error, { code: error.code });
    }

    logger.error(
      { companyId, supportUserId, error },
      'Failed to list support grants',
    );
    return errorResponse('Failed to list support grants', error, {
      code: ErrorCode.GENERIC,
    });
  }
}

export async function createSupportGrant({
  companyId,
  input,
  grantedByUserId,
  auditContext,
}: {
  companyId: string;
  input: CreateSupportGrantRequest;
  grantedByUserId: string;
  auditContext?: AuditContextInput;
}): Promise<ApiResponse<SupportGrantResponse>> {
  const parsed = createSupportGrantRequest.safeParse(input);
  if (!parsed.success) {
    return errorResponse(
      'Invalid support grant payload',
      parsed.error.flatten(),
      {
        code: ErrorCode.INVALID_INPUT,
      },
    );
  }

  try {
    const result = await knexClient.transaction(async (trx) => {
      await expireStaleSupportGrants(trx);

      const company = await getCompanyAccessRow(companyId, trx);
      if (!company) {
        return errorResponse<SupportGrantResponse>(
          'Company not found',
          undefined,
          {
            code: ErrorCode.NOT_FOUND,
          },
        );
      }
      if (
        isDemoWorkspace(company.workspaceClass) ||
        isPlatformWorkspace(company.workspaceClass)
      ) {
        return errorResponse<SupportGrantResponse>(
          'Support grants are not allowed for demo or internal companies',
          undefined,
          { code: ErrorCode.OPERATION_NOT_ALLOWED },
        );
      }

      const supportRole = await getPlatformRoleForUserInternal(
        parsed.data.supportUserId,
        trx,
      );
      if (!supportRole || !SUPPORT_PLATFORM_ROLE_KEYS.has(supportRole)) {
        return errorResponse<SupportGrantResponse>(
          'Support user must have a support platform role',
          undefined,
          { code: ErrorCode.OPERATION_NOT_ALLOWED },
        );
      }
      if (
        parsed.data.supportAccessLevel === 'company_profile_write' &&
        supportRole !== roleKey.enum.support_admin
      ) {
        return errorResponse<SupportGrantResponse>(
          'Only support admins may receive company profile write access',
          undefined,
          { code: ErrorCode.OPERATION_NOT_ALLOWED },
        );
      }

      const expiresAt = parseExpiresAtWithMax(
        parsed.data.expiresAt,
        parsed.data.supportAccessLevel === 'read_only'
          ? READ_ONLY_MAX_TTL_MS
          : COMPANY_PROFILE_WRITE_MAX_TTL_MS,
      );

      const existingActive = await trx(grantsTable)
        .where({
          company_id: companyId,
          support_user_id: parsed.data.supportUserId,
          status: 'active',
        })
        .andWhere('expires_at', '>', now())
        .first();

      if (existingActive) {
        return errorResponse<SupportGrantResponse>(
          'An active support grant already exists for this user and company',
          undefined,
          { code: ErrorCode.CONFLICT },
        );
      }

      const [inserted] = await trx(grantsTable)
        .insert({
          company_id: companyId,
          support_user_id: parsed.data.supportUserId,
          granted_by_user_id: grantedByUserId,
          support_access_level: parsed.data.supportAccessLevel,
          status: 'active',
          reason: parsed.data.reason,
          expires_at: expiresAt,
        })
        .returning(['id']);

      const rows = await getSupportGrantListRows(companyId, trx, {
        supportUserId: parsed.data.supportUserId,
      });
      const created = rows.find((row) => row.id === inserted.id);
      if (!created) {
        return errorResponse<SupportGrantResponse>(
          'Support grant was created but could not be loaded',
          undefined,
          { code: ErrorCode.GENERIC },
        );
      }

      await writeSupportGrantCreatedAudit({
        companyId,
        entityId: created.id,
        actor: { type: 'user', userId: grantedByUserId },
        payload: {
          supportUserId: created.supportUserId,
          supportAccessLevel: created.supportAccessLevel,
          expiresAt: created.expiresAt.toISOString(),
          reason: created.reason,
        },
        trx,
        context: auditContext,
      });

      return successResponse(
        'Support grant created successfully',
        mapSupportGrantRowToResponse(created),
      );
    });

    return result;
  } catch (error) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error, { code: error.code });
    }

    logger.error(
      { companyId, grantedByUserId, error },
      'Failed to create support grant',
    );
    return errorResponse('Failed to create support grant', error, {
      code: ErrorCode.GENERIC,
    });
  }
}

export async function revokeSupportGrant({
  companyId,
  grantId,
  input,
  revokedByUserId,
  auditContext,
}: {
  companyId: string;
  grantId: string;
  input: RevokeSupportGrantRequest;
  revokedByUserId: string;
  auditContext?: AuditContextInput;
}): Promise<ApiResponse<SupportGrantResponse>> {
  const parsed = revokeSupportGrantRequest.safeParse(input);
  if (!parsed.success) {
    return errorResponse('Invalid revoke payload', parsed.error.flatten(), {
      code: ErrorCode.INVALID_INPUT,
    });
  }

  try {
    return await knexClient.transaction(async (trx) => {
      await expireStaleSupportGrants(trx);

      const existing = await getSupportGrantListRows(companyId, trx);
      const grant = existing.find((row) => row.id === grantId);
      if (!grant) {
        return errorResponse<SupportGrantResponse>(
          'Support grant not found',
          undefined,
          {
            code: ErrorCode.NOT_FOUND,
          },
        );
      }

      if (computeGrantStatus(grant) !== 'active') {
        return errorResponse<SupportGrantResponse>(
          'Only active support grants can be revoked',
          undefined,
          { code: ErrorCode.OPERATION_NOT_ALLOWED },
        );
      }

      await trx(grantsTable)
        .where({ id: grantId, company_id: companyId })
        .update({
          status: 'revoked',
          revoked_at: trx.fn.now(),
          revoked_by_user_id: revokedByUserId,
          revoke_reason: parsed.data.reason ?? null,
        });

      const updatedRows = await getSupportGrantListRows(companyId, trx);
      const updated = updatedRows.find((row) => row.id === grantId);
      if (!updated) {
        return errorResponse<SupportGrantResponse>(
          'Support grant was revoked but could not be loaded',
          undefined,
          { code: ErrorCode.GENERIC },
        );
      }

      await writeSupportGrantRevokedAudit({
        companyId,
        entityId: updated.id,
        actor: { type: 'user', userId: revokedByUserId },
        payload: {
          supportUserId: updated.supportUserId,
          supportAccessLevel: updated.supportAccessLevel,
          revokedAt:
            updated.revokedAt?.toISOString() ?? new Date().toISOString(),
          revokeReason: updated.revokeReason,
        },
        trx,
        context: auditContext,
      });

      return successResponse(
        'Support grant revoked successfully',
        mapSupportGrantRowToResponse(updated),
      );
    });
  } catch (error) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error, { code: error.code });
    }

    logger.error(
      { companyId, grantId, revokedByUserId, error },
      'Failed to revoke support grant',
    );
    return errorResponse('Failed to revoke support grant', error, {
      code: ErrorCode.GENERIC,
    });
  }
}

export async function openBreakGlassSession({
  companyId,
  input,
  superAdminUserId,
  auditContext,
}: {
  companyId: string;
  input: OpenBreakGlassRequest;
  superAdminUserId: string;
  auditContext?: AuditContextInput;
}): Promise<ApiResponse<BreakGlassSessionResponse>> {
  const parsed = openBreakGlassRequest.safeParse(input);
  if (!parsed.success) {
    return errorResponse(
      'Invalid break-glass payload',
      parsed.error.flatten(),
      {
        code: ErrorCode.INVALID_INPUT,
      },
    );
  }

  let notificationMeta: BreakGlassNotificationMeta | null = null;

  try {
    const result = await knexClient.transaction(async (trx) => {
      await expireStaleBreakGlassSessions(trx);

      const company = await getCompanyAccessRow(companyId, trx);
      if (!company) {
        return errorResponse<BreakGlassSessionResponse>(
          'Company not found',
          undefined,
          {
            code: ErrorCode.NOT_FOUND,
          },
        );
      }
      if (
        isDemoWorkspace(company.workspaceClass) ||
        isPlatformWorkspace(company.workspaceClass)
      ) {
        return errorResponse<BreakGlassSessionResponse>(
          'Break-glass access is only for customer companies',
          undefined,
          { code: ErrorCode.OPERATION_NOT_ALLOWED },
        );
      }

      const expiresAt = parseExpiresAtWithMax(
        parsed.data.expiresAt,
        BREAK_GLASS_MAX_TTL_MS,
      );

      const existingActive = await trx(breakGlassTable)
        .where({
          company_id: companyId,
          status: 'active',
        })
        .andWhere('expires_at', '>', now())
        .first();
      if (existingActive) {
        return errorResponse<BreakGlassSessionResponse>(
          'An active break-glass session already exists for this company',
          undefined,
          { code: ErrorCode.CONFLICT },
        );
      }

      const [inserted] = await trx(breakGlassTable)
        .insert({
          company_id: companyId,
          super_admin_user_id: superAdminUserId,
          status: 'active',
          reason: parsed.data.reason,
          expires_at: expiresAt,
        })
        .returning(['id']);

      const created = await getBreakGlassSessionRow(
        inserted.id,
        companyId,
        trx,
      );
      if (!created) {
        return errorResponse<BreakGlassSessionResponse>(
          'Break-glass session was created but could not be loaded',
          undefined,
          { code: ErrorCode.GENERIC },
        );
      }

      await writeBreakGlassOpenedAudit({
        companyId,
        entityId: created.id,
        actor: { type: 'user', userId: superAdminUserId },
        payload: {
          superAdminUserId: created.superAdminUserId,
          expiresAt: created.expiresAt.toISOString(),
          reason: created.reason,
        },
        trx,
        context: auditContext,
      });

      const actorEmail = await getUserEmail(superAdminUserId, trx);
      const recipients = await getCompanyAdminRecipients(companyId, trx);
      notificationMeta = {
        companyName: company.displayName || company.legalName,
        companyShortCode: company.companyShortCode,
        actorEmail: actorEmail ?? 'unknown@getaccountable.com',
        reason: created.reason,
        expiresAt: created.expiresAt.toISOString(),
        recipients,
      };

      return successResponse(
        'Break-glass session opened successfully',
        mapBreakGlassRowToResponse(created),
      );
    });

    if (result.success && notificationMeta) {
      await sendBreakGlassOpenedNotifications(notificationMeta);
    }

    return result;
  } catch (error) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error, { code: error.code });
    }

    logger.error(
      { companyId, superAdminUserId, error },
      'Failed to open break-glass session',
    );
    return errorResponse('Failed to open break-glass session', error, {
      code: ErrorCode.GENERIC,
    });
  }
}

export async function closeBreakGlassSession({
  companyId,
  sessionId,
  closeReason,
  closedByUserId,
  auditContext,
}: {
  companyId: string;
  sessionId: string;
  closeReason?: string;
  closedByUserId: string;
  auditContext?: AuditContextInput;
}): Promise<ApiResponse<BreakGlassSessionResponse>> {
  let notificationMeta: BreakGlassNotificationMeta | null = null;
  let normalizedCloseReason: string | null = null;

  try {
    normalizedCloseReason = normalizeOptionalReason(closeReason);

    const result = await knexClient.transaction(async (trx) => {
      await expireStaleBreakGlassSessions(trx);

      const company = await getCompanyAccessRow(companyId, trx);
      if (!company) {
        return errorResponse<BreakGlassSessionResponse>(
          'Company not found',
          undefined,
          {
            code: ErrorCode.NOT_FOUND,
          },
        );
      }

      const existing = await getBreakGlassSessionRow(sessionId, companyId, trx);
      if (!existing) {
        return errorResponse<BreakGlassSessionResponse>(
          'Break-glass session not found',
          undefined,
          { code: ErrorCode.NOT_FOUND },
        );
      }

      if (computeBreakGlassStatus(existing) !== 'active') {
        return errorResponse<BreakGlassSessionResponse>(
          'Only active break-glass sessions can be closed',
          undefined,
          { code: ErrorCode.OPERATION_NOT_ALLOWED },
        );
      }

      await trx(breakGlassTable)
        .where({ id: sessionId, company_id: companyId })
        .update({
          status: 'closed',
          closed_at: trx.fn.now(),
          closed_by_user_id: closedByUserId,
          close_reason: normalizedCloseReason,
        });

      const updated = await getBreakGlassSessionRow(sessionId, companyId, trx);
      if (!updated) {
        return errorResponse<BreakGlassSessionResponse>(
          'Break-glass session was closed but could not be loaded',
          undefined,
          { code: ErrorCode.GENERIC },
        );
      }

      await writeBreakGlassClosedAudit({
        companyId,
        entityId: updated.id,
        actor: { type: 'user', userId: closedByUserId },
        payload: {
          superAdminUserId: updated.superAdminUserId,
          closedAt: updated.closedAt?.toISOString() ?? new Date().toISOString(),
          closeReason: updated.closeReason,
        },
        trx,
        context: auditContext,
      });

      const actorEmail = await getUserEmail(closedByUserId, trx);
      const recipients = await getCompanyAdminRecipients(companyId, trx);
      notificationMeta = {
        companyName: company.displayName || company.legalName,
        companyShortCode: company.companyShortCode,
        actorEmail: actorEmail ?? 'unknown@getaccountable.com',
        reason: updated.reason,
        closedAt: updated.closedAt?.toISOString() ?? undefined,
        closeReason: updated.closeReason,
        recipients,
      };

      return successResponse(
        'Break-glass session closed successfully',
        mapBreakGlassRowToResponse(updated),
      );
    });

    if (result.success && notificationMeta) {
      await sendBreakGlassClosedNotifications(notificationMeta);
    }

    return result;
  } catch (error) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error, { code: error.code });
    }

    logger.error(
      { companyId, sessionId, closedByUserId, error },
      'Failed to close break-glass session',
    );
    return errorResponse('Failed to close break-glass session', error, {
      code: ErrorCode.GENERIC,
    });
  }
}
