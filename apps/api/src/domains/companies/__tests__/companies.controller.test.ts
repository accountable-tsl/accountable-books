import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ErrorCode } from '../../../shared/utils/response.utils.js';
import {
  getCompanyController,
  updateCompanyController,
} from '../companies.controller.js';
import { getSingleCompany, updateCompany } from '../companies.model.js';

vi.mock('../companies.model.js', () => ({
  getCompanies: vi.fn(),
  getSingleCompany: vi.fn(),
  switchCompany: vi.fn(),
  updateCompany: vi.fn(),
}));

function makeResponse() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
}

/** Satisfies PATCH authorization (Phase 2): non-demo client admin. */
function authorizedCompanyContext() {
  return {
    id: 'company-1',
    legalName: 'Co',
    displayName: null,
    assignedFirmSlug: 'firm',
    companyType: 'business' as const,
    hasExplicitAccess: true,
    roleKey: 'client_admin' as const,
    roleScope: 'company' as const,
    isDemoCompany: false,
    isPlatformCompany: false,
    onboardingState: null,
    accessOrigin: 'explicit_company' as const,
    supportAccessLevel: null,
    supportGrantId: null,
    breakGlassSessionId: null,
  };
}

describe('companies controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 409 when a verified-field update is blocked', async () => {
    vi.mocked(updateCompany).mockResolvedValue({
      success: false,
      message: 'Legal name is verified and cannot be changed',
      code: ErrorCode.OPERATION_NOT_ALLOWED,
    });

    const req = {
      params: { companyId: 'company-1' },
      user: { id: 'user-1', isPlatformUser: false },
      company: authorizedCompanyContext(),
      body: { legalName: 'Different Name' },
    } as any;
    const res = makeResponse();

    await updateCompanyController(req, res as any);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('returns 404 when the company cannot be found', async () => {
    vi.mocked(updateCompany).mockResolvedValue({
      success: false,
      message: 'Company not found',
      code: ErrorCode.NOT_FOUND,
    });

    const req = {
      params: { companyId: 'missing-company' },
      user: { id: 'user-1', isPlatformUser: false },
      company: authorizedCompanyContext(),
      body: {},
    } as any;
    const res = makeResponse();

    await updateCompanyController(req, res as any);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns model-derived status codes for getCompany', async () => {
    vi.mocked(getSingleCompany).mockResolvedValue({
      success: false,
      message: 'Company not found',
      code: ErrorCode.NOT_FOUND,
    });

    const req = {
      params: { companyId: 'missing-company' },
    } as any;
    const res = makeResponse();

    await getCompanyController(req, res as any);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 403 when user is client_user (not workspace admin)', async () => {
    const req = {
      params: { companyId: 'company-1' },
      user: { id: 'user-1', isPlatformUser: false },
      company: {
        ...authorizedCompanyContext(),
        roleKey: 'client_user',
      },
      body: { displayName: 'X' },
    } as any;
    const res = makeResponse();

    await updateCompanyController(req, res as any);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(updateCompany).not.toHaveBeenCalled();
  });

  it('returns 403 when company is demo and user is not platform', async () => {
    const req = {
      params: { companyId: 'demo-co' },
      user: { id: 'user-1', isPlatformUser: false },
      company: {
        ...authorizedCompanyContext(),
        id: 'demo-co',
        isDemoCompany: true,
      },
      body: { displayName: 'X' },
    } as any;
    const res = makeResponse();

    await updateCompanyController(req, res as any);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(updateCompany).not.toHaveBeenCalled();
  });

  it('allows PATCH when user is platform on demo company', async () => {
    vi.mocked(updateCompany).mockResolvedValue({
      success: true,
      message: 'ok',
      data: {} as any,
    });

    const req = {
      params: { companyId: 'demo-co' },
      user: { id: 'user-1', isPlatformUser: true },
      company: {
        ...authorizedCompanyContext(),
        id: 'demo-co',
        isDemoCompany: true,
        roleKey: 'client_user',
      },
      body: { displayName: 'X' },
    } as any;
    const res = makeResponse();

    await updateCompanyController(req, res as any);

    expect(updateCompany).toHaveBeenCalled();
  });

  it('returns 403 for read-only support grants', async () => {
    const req = {
      params: { companyId: 'company-1' },
      user: { id: 'support-user-1', isPlatformUser: true },
      company: {
        ...authorizedCompanyContext(),
        hasExplicitAccess: false,
        roleKey: 'support_admin',
        roleScope: 'platform',
        accessOrigin: 'support_grant',
        supportAccessLevel: 'read_only',
        supportGrantId: 'grant-1',
      },
      body: { displayName: 'X' },
    } as any;
    const res = makeResponse();

    await updateCompanyController(req, res as any);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(updateCompany).not.toHaveBeenCalled();
  });
});
