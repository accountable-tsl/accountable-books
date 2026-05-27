import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError, ErrorCode } from '../../shared/utils/response.utils.js';
import { getCompanyIdentifiers } from '../companies/companies.utils.js';
import { getAccessibleCompaniesForUser } from '../user-roles/user-roles.model.js';
import {
  createSupportGrantController,
  listSupportGrantsController,
  openBreakGlassSessionController,
} from './support-access.controller.js';
import {
  createSupportGrant,
  listSupportGrantsForCompany,
  openBreakGlassSession,
} from './support-access.model.js';

import type { AccessibleCompanies } from '../user-roles/user-roles.types.js';

vi.mock('../companies/companies.utils.js', () => ({
  getCompanyIdentifiers: vi.fn(),
}));

vi.mock('../user-roles/user-roles.model.js', () => ({
  getAccessibleCompaniesForUser: vi.fn(),
}));

vi.mock('./support-access.model.js', () => ({
  createSupportGrant: vi.fn(),
  revokeSupportGrant: vi.fn(),
  listSupportGrantsForCompany: vi.fn(),
  openBreakGlassSession: vi.fn(),
  closeBreakGlassSession: vi.fn(),
}));

function makeResponse() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
}

function explicitCompanyAdminAccess(
  overrides: Partial<AccessibleCompanies> = {},
): AccessibleCompanies {
  return {
    id: 'SHORT1',
    legalName: 'Legal Name',
    displayName: 'Display Name',
    assignedFirmSlug: '',
    companyType: 'business',
    workspaceClass: 'customer',
    hasExplicitAccess: true,
    roleKey: 'client_admin',
    roleScope: 'company',
    isDemoCompany: false,
    isPlatformCompany: false,
    onboardingState: null,
    accessOrigin: 'explicit_company',
    supportAccessLevel: null,
    supportGrantId: null,
    breakGlassSessionId: null,
    ...overrides,
  };
}

describe('support access controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCompanyIdentifiers).mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000001',
      short_code: 'SHORT1',
    });
  });

  it('lets company admins create support grants', async () => {
    vi.mocked(getAccessibleCompaniesForUser).mockResolvedValue({
      success: true,
      data: {
        accessibleCompanies: [explicitCompanyAdminAccess()],
        isPlatformUser: false,
      },
    } as any);
    vi.mocked(createSupportGrant).mockResolvedValue({
      success: true,
      message: 'Support grant created successfully',
      data: {
        id: '00000000-0000-4000-8000-000000000101',
      } as any,
    });

    const req = {
      params: { companyId: 'SHORT1' },
      body: {
        supportUserId: '00000000-0000-4000-8000-000000000201',
        supportAccessLevel: 'read_only',
        expiresAt: '2026-04-07T10:00:00.000Z',
        reason: 'Customer requested setup help',
      },
      user: { id: '00000000-0000-4000-8000-000000000301' },
      ip: '127.0.0.1',
      get: vi.fn().mockReturnValue('vitest'),
    } as any;
    const res = makeResponse();

    await createSupportGrantController(req, res as any);

    expect(createSupportGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: '00000000-0000-4000-8000-000000000001',
        grantedByUserId: '00000000-0000-4000-8000-000000000301',
        input: req.body,
      }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('blocks non-admin company users from creating support grants', async () => {
    vi.mocked(getAccessibleCompaniesForUser).mockResolvedValue({
      success: true,
      data: {
        accessibleCompanies: [
          explicitCompanyAdminAccess({ roleKey: 'client_user' }),
        ],
        isPlatformUser: false,
      },
    } as any);

    const req = {
      params: { companyId: 'SHORT1' },
      body: {
        supportUserId: '00000000-0000-4000-8000-000000000201',
        supportAccessLevel: 'read_only',
        expiresAt: '2026-04-07T10:00:00.000Z',
        reason: 'Customer requested setup help',
      },
      user: { id: '00000000-0000-4000-8000-000000000301' },
      ip: '127.0.0.1',
      get: vi.fn().mockReturnValue('vitest'),
    } as any;
    const res = makeResponse();

    await createSupportGrantController(req, res as any);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(createSupportGrant).not.toHaveBeenCalled();
  });

  it('lists only the active assignee grant for support viewers', async () => {
    vi.mocked(getAccessibleCompaniesForUser).mockResolvedValue({
      success: true,
      data: {
        accessibleCompanies: [
          explicitCompanyAdminAccess({
            hasExplicitAccess: false,
            roleKey: 'support_agent',
            roleScope: 'platform',
            accessOrigin: 'support_grant',
            supportAccessLevel: 'read_only',
            supportGrantId: '00000000-0000-4000-8000-000000000401',
          }),
        ],
        isPlatformUser: true,
        platformUserKey: 'support_agent',
      },
    } as any);
    vi.mocked(listSupportGrantsForCompany).mockResolvedValue({
      success: true,
      message: 'Support grants retrieved successfully',
      data: { grants: [] },
    } as any);

    const req = {
      params: { companyId: 'SHORT1' },
      body: {},
      user: { id: '00000000-0000-4000-8000-000000000201' },
      ip: '127.0.0.1',
      get: vi.fn().mockReturnValue('vitest'),
    } as any;
    const res = makeResponse();

    await listSupportGrantsController(req, res as any);

    expect(listSupportGrantsForCompany).toHaveBeenCalledWith({
      companyId: '00000000-0000-4000-8000-000000000001',
      supportUserId: '00000000-0000-4000-8000-000000000201',
      activeOnly: true,
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns model-derived status codes when company lookup fails', async () => {
    vi.mocked(getCompanyIdentifiers).mockRejectedValue(
      new AppError('Company not found', undefined, false, ErrorCode.NOT_FOUND),
    );

    const req = {
      params: { companyId: 'missing' },
      body: {},
      user: { id: '00000000-0000-4000-8000-000000000301' },
      ip: '127.0.0.1',
      get: vi.fn().mockReturnValue('vitest'),
    } as any;
    const res = makeResponse();

    await listSupportGrantsController(req, res as any);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(listSupportGrantsForCompany).not.toHaveBeenCalled();
  });

  it('allows super admins to open break-glass without existing company access', async () => {
    vi.mocked(getAccessibleCompaniesForUser).mockResolvedValue({
      success: true,
      data: {
        accessibleCompanies: [],
        isPlatformUser: true,
        platformUserKey: 'super_admin',
      },
    } as any);
    vi.mocked(openBreakGlassSession).mockResolvedValue({
      success: true,
      message: 'Break-glass session opened successfully',
      data: {
        id: '00000000-0000-4000-8000-000000000501',
      } as any,
    });

    const req = {
      params: { companyId: 'SHORT1' },
      body: {
        expiresAt: '2026-04-06T11:00:00.000Z',
        reason: 'Urgent customer recovery',
      },
      user: { id: '00000000-0000-4000-8000-000000000601' },
      ip: '127.0.0.1',
      get: vi.fn().mockReturnValue('vitest'),
    } as any;
    const res = makeResponse();

    await openBreakGlassSessionController(req, res as any);

    expect(openBreakGlassSession).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: '00000000-0000-4000-8000-000000000001',
        superAdminUserId: '00000000-0000-4000-8000-000000000601',
        input: req.body,
      }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
