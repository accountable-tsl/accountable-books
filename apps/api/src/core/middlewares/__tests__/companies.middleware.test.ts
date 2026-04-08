import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getCompanyIdentifiers } from '../../../domains/companies/companies.utils.js';
import { getAccessibleCompaniesForUser } from '../../../domains/user-roles/user-roles.model.js';
import { ErrorCode } from '../../../shared/utils/response.utils.js';
import { checkCompanyId } from '../companies.middleware.js';

import type { AccessibleCompanies } from '../../../domains/user-roles/user-roles.types.js';

vi.mock('../../../domains/companies/companies.utils.js', () => ({
  getCompanyIdentifiers: vi.fn(),
}));

vi.mock('../../../domains/user-roles/user-roles.model.js', () => ({
  getAccessibleCompaniesForUser: vi.fn(),
}));

function makeResponse() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
}

function workspaceCompany(
  overrides: Partial<AccessibleCompanies> = {},
): AccessibleCompanies {
  return {
    id: 'SHORT1',
    legalName: 'Legal',
    displayName: 'Display',
    assignedFirmSlug: 'firm-slug',
    companyType: 'business',
    hasExplicitAccess: true,
    roleKey: 'client_owner',
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

describe('companies middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCompanyIdentifiers).mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000001',
      short_code: 'SHORT1',
    });
    vi.mocked(getAccessibleCompaniesForUser).mockResolvedValue({
      success: true,
      data: {
        accessibleCompanies: [workspaceCompany()],
        isPlatformUser: false,
      },
    } as any);
  });

  it('returns the standard error shape for invalid company identifiers', async () => {
    const req = {
      params: { companyId: '' },
      body: {},
      query: {},
    } as any;
    const res = makeResponse();
    const next = vi.fn();

    await checkCompanyId(req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Invalid Company Identifier',
        code: ErrorCode.INVALID_INPUT,
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next and sets req.company when company is in accessibleCompanies', async () => {
    const req = {
      params: { companyId: 'SHORT1' },
      body: {},
      query: {},
      user: { id: 'user-1' },
    } as any;
    const res = makeResponse();
    const next = vi.fn();

    await checkCompanyId(req, res as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.company).toEqual(workspaceCompany());
    expect(req.companyContext).toEqual({
      identifier: 'SHORT1',
      uuid: '00000000-0000-4000-8000-000000000001',
      shortCode: 'SHORT1',
    });
  });

  it('merges platform flags onto req.user when profile is platform', async () => {
    vi.mocked(getAccessibleCompaniesForUser).mockResolvedValue({
      success: true,
      data: {
        accessibleCompanies: [workspaceCompany()],
        isPlatformUser: true,
        platformUserKey: 'support_admin',
      },
    } as any);

    const req = {
      params: { companyId: 'SHORT1' },
      body: {},
      query: {},
      user: { id: 'platform-user-1' },
    } as any;
    const res = makeResponse();
    const next = vi.fn();

    await checkCompanyId(req, res as any, next);

    expect(req.user.isPlatformUser).toBe(true);
    expect(req.user.platformUserKey).toBe('support_admin');
    expect(next).toHaveBeenCalled();
  });

  it('treats platform identity and company access separately', async () => {
    vi.mocked(getAccessibleCompaniesForUser).mockResolvedValue({
      success: true,
      data: {
        accessibleCompanies: [],
        isPlatformUser: true,
        platformUserKey: 'support_admin',
      },
    } as any);

    const req = {
      params: { companyId: 'SHORT1' },
      body: {},
      query: {},
      user: { id: 'platform-user-1' },
    } as any;
    const res = makeResponse();
    const next = vi.fn();

    await checkCompanyId(req, res as any, next);

    expect(req.user.isPlatformUser).toBe(true);
    expect(req.user.platformUserKey).toBe('support_admin');
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows support-grant company context through the normal access list', async () => {
    vi.mocked(getAccessibleCompaniesForUser).mockResolvedValue({
      success: true,
      data: {
        accessibleCompanies: [
          workspaceCompany({
            hasExplicitAccess: false,
            roleKey: 'support_admin',
            roleScope: 'platform',
            accessOrigin: 'support_grant',
            supportAccessLevel: 'read_only',
            supportGrantId: 'grant-1',
          }),
        ],
        isPlatformUser: true,
        platformUserKey: 'support_admin',
      },
    } as any);

    const req = {
      params: { companyId: 'SHORT1' },
      body: {},
      query: {},
      user: { id: 'support-user-1' },
    } as any;
    const res = makeResponse();
    const next = vi.fn();

    await checkCompanyId(req, res as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.company).toEqual(
      expect.objectContaining({
        accessOrigin: 'support_grant',
        supportAccessLevel: 'read_only',
        supportGrantId: 'grant-1',
      }),
    );
  });

  it('returns model-derived 403 when access profile lookup fails with forbidden', async () => {
    vi.mocked(getAccessibleCompaniesForUser).mockResolvedValue({
      success: false,
      message: 'User has no access to any company',
      code: ErrorCode.FORBIDDEN,
    } as any);

    const req = {
      params: { companyId: 'SHORT1' },
      body: {},
      query: {},
      user: { id: 'user-1' },
    } as any;
    const res = makeResponse();
    const next = vi.fn();

    await checkCompanyId(req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'User has no access to any company',
        code: ErrorCode.FORBIDDEN,
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });
});
