import { afterAll, describe, expect, it } from 'vitest';

import { getTestDb } from '../../../../config/test-db.js';
import { ENV, isProd } from '../../../config/env.js';
import { resolveWorkspaceBillingContext } from '../../billing/resolver/ownership-resolver.service.js';
import {
  BOOTSTRAP_SYSTEM_FIRMS,
  PLATFORM_WORKSPACE_ID,
  PLATFORM_WORKSPACE_SHORT_CODE,
  PLATFORM_WORKSPACE_SLUG,
  SYSTEM_USER_ID,
} from '../workspace-bootstrap.config.js';
import {
  bootstrapPlatformWorkspace,
  isPlatformWorkspaceBootstrapped,
  seedSystemFirms,
} from '../workspace-bootstrap.service.js';

const db = getTestDb();

function getExpectedAdminEmail(): string {
  const email = (isProd ? ENV.ADMIN_EMAIL : ENV.TEST_ADMIN_EMAIL)
    ?.trim()
    .toLowerCase();

  if (!email) {
    throw new Error('Expected bootstrap admin email to be configured');
  }

  return email;
}

async function getWorkspaceRoles(companyId: string) {
  return db('user_company_roles as ucr')
    .join('roles as r', 'r.id', 'ucr.role_id')
    .where({ 'ucr.company_id': companyId, 'ucr.is_deleted': false })
    .select('ucr.user_id', 'r.key');
}

describe('workspace-bootstrap.service integration', () => {
  afterAll(async () => {
    // Connection lifecycle is owned by the global test setup/teardown.
  });

  it('detects the bootstrapped platform workspace', async () => {
    const bootstrapped = await isPlatformWorkspaceBootstrapped(db);
    expect(bootstrapped).toBe(true);
  });

  it('reconciles the platform workspace idempotently through the unified provisioner', async () => {
    const first = await bootstrapPlatformWorkspace(db, {
      sideEffectMode: 'skip_jobs',
    });
    const second = await bootstrapPlatformWorkspace(db, {
      sideEffectMode: 'skip_jobs',
    });

    expect(first.companyId).toBe(PLATFORM_WORKSPACE_ID);
    expect(second.companyId).toBe(PLATFORM_WORKSPACE_ID);
    expect(second.adminUserId).toBe(first.adminUserId);
    expect(second.systemUserId).toBe(first.systemUserId);

    const company = await db('companies')
      .where({ id: PLATFORM_WORKSPACE_ID })
      .select('id', 'short_code', 'workspace_class', 'type', 'assigned_firm_id')
      .first<{
        id: string;
        short_code: string;
        workspace_class: string;
        type: string;
        assigned_firm_id: string | null;
      }>();
    const firmMeta = await db('accounting_firms_meta')
      .where({ company_id: PLATFORM_WORKSPACE_ID })
      .select('slug')
      .first<{ slug: string }>();
    const billing = await resolveWorkspaceBillingContext(
      PLATFORM_WORKSPACE_ID,
      {
        db,
      },
    );
    const roles = await getWorkspaceRoles(PLATFORM_WORKSPACE_ID);
    const coaCount = await db('coa')
      .where({ company_id: PLATFORM_WORKSPACE_ID })
      .count<{ count: string }>('* as count')
      .first();

    expect(company?.short_code).toBe(PLATFORM_WORKSPACE_SHORT_CODE);
    expect(company?.workspace_class).toBe('platform');
    expect(company?.type).toBe('accounting_firm');
    expect(company?.assigned_firm_id).toBe(PLATFORM_WORKSPACE_ID);
    expect(firmMeta?.slug).toBe(PLATFORM_WORKSPACE_SLUG);
    expect(billing?.commercialMode).toBe('firm_internal');
    expect(Number(coaCount?.count ?? 0)).toBeGreaterThan(0);

    const adminEmail = getExpectedAdminEmail();
    const adminUser = await db('users')
      .whereRaw('LOWER(email) = ?', [adminEmail])
      .select('id')
      .first<{ id: string }>();

    expect(adminUser?.id).toBe(first.adminUserId);

    const adminRoleKeys = roles
      .filter((role) => role.user_id === first.adminUserId)
      .map((role) => role.key);
    const systemRoleKeys = roles
      .filter((role) => role.user_id === SYSTEM_USER_ID)
      .map((role) => role.key);

    expect(adminRoleKeys).toContain('super_admin');
    expect(systemRoleKeys).toContain('system_user');

    expect(
      roles.filter(
        (role) =>
          role.user_id === first.adminUserId && role.key === 'super_admin',
      ),
    ).toHaveLength(1);
    expect(
      roles.filter(
        (role) => role.user_id === SYSTEM_USER_ID && role.key === 'system_user',
      ),
    ).toHaveLength(1);
  });

  it('reconciles system firms idempotently through the unified provisioner', async () => {
    const first = await seedSystemFirms(db, {
      sideEffectMode: 'skip_jobs',
    });
    const second = await seedSystemFirms(db, {
      sideEffectMode: 'skip_jobs',
    });

    expect(first.results).toHaveLength(BOOTSTRAP_SYSTEM_FIRMS.length);
    expect(second.results).toHaveLength(BOOTSTRAP_SYSTEM_FIRMS.length);

    for (const seed of BOOTSTRAP_SYSTEM_FIRMS) {
      const company = await db('companies')
        .where({ id: seed.id })
        .select(
          'id',
          'workspace_class',
          'type',
          'assigned_firm_id',
          'short_code',
        )
        .first<{
          id: string;
          workspace_class: string;
          type: string;
          assigned_firm_id: string | null;
          short_code: string;
        }>();
      const meta = await db('accounting_firms_meta')
        .where({ company_id: seed.id })
        .select('slug')
        .first<{ slug: string }>();
      const billing = await resolveWorkspaceBillingContext(seed.id, { db });

      expect(company?.short_code).toBe(seed.shortCode);
      expect(company?.workspace_class).toBe('partner');
      expect(company?.type).toBe('accounting_firm');
      expect(company?.assigned_firm_id).toBe(seed.id);
      expect(meta?.slug).toBe(seed.slug);
      expect(billing?.commercialMode).toBe('firm_internal');
    }
  });
});
