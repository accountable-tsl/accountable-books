import {
  authSessionPayload,
  refreshSessionPayload,
} from '@accountable-books/contracts/schema';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  loginController,
  meController,
  refreshTokenController,
} from './auth.controller.js';
import {
  loginService,
  meService,
  refreshTokenService,
} from './auth.service.js';
import { generateCsrfToken, setAuthCookies } from './auth.utils.js';

vi.mock('./auth.service.js', () => ({
  loginService: vi.fn(),
  meService: vi.fn(),
  refreshTokenService: vi.fn(),
  resendVerificationEmailService: vi.fn(),
  verifyEmailService: vi.fn(),
}));

vi.mock('./auth.utils.js', () => ({
  clearCsrfCookie: vi.fn(),
  generateCsrfToken: vi.fn(),
  setAuthCookies: vi.fn(),
}));

vi.mock('../../lib/redis.js', () => ({
  redis: {
    srem: vi.fn(),
  },
}));

function makeResponse() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    clearCookie: vi.fn().mockReturnThis(),
  };
}

function companyContext() {
  return {
    id: 'acme-co',
    legalName: 'Acme Ltd',
    displayName: 'Acme',
    assignedFirmSlug: '',
    companyType: 'business' as const,
    workspaceClass: 'customer' as const,
    hasExplicitAccess: true,
    roleKey: 'client_admin' as const,
    roleScope: 'company' as const,
    isDemoCompany: false,
    isPlatformCompany: false,
    onboardingState: {
      steps: {
        company_details_confirmed: true,
        first_bank_account_added: false,
      },
      completed_at: {
        company_details_confirmed: '2026-04-01T10:00:00.000Z',
        first_bank_account_added: null,
      },
      metadata: null,
    },
    accessOrigin: 'explicit_company' as const,
    supportAccessLevel: null,
    supportGrantId: null,
    breakGlassSessionId: null,
  };
}

function currentCompany() {
  return {
    ...companyContext(),
    onboarding: {
      isCompanyOwner: true,
      canAccessApp: true,
      userStepsComplete: true,
      nextStepToComplete: null,
      steps: [
        {
          key: 'email_verified',
          label: 'Verify email',
          complete: true,
          blocked: false,
          optional: false,
          scope: 'user' as const,
          orderIndex: 1,
        },
        {
          key: 'company_details_confirmed',
          label: 'Confirm company details',
          complete: true,
          blocked: false,
          optional: false,
          scope: 'company' as const,
          orderIndex: 2,
        },
      ],
    },
  };
}

function userContext() {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'user@example.com',
    firstname: 'Alex',
    lastname: 'Doe',
    currentCompanyId: 'acme-co',
    currentCompany: currentCompany(),
    companies: [companyContext()],
  };
}

describe('auth controller wire schemas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(generateCsrfToken).mockReturnValue('csrf-token-1');
  });

  it('returns a contract-valid login payload', async () => {
    vi.mocked(loginService).mockResolvedValue({
      success: true,
      message: 'Login successful',
      data: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        user: userContext(),
        activeCompany: companyContext(),
      },
    } as any);

    const req = {
      body: { email: 'user@example.com', password: 'secret' },
    } as any;
    const res = makeResponse();

    await loginController(req, res as any);

    expect(setAuthCookies).toHaveBeenCalledWith(
      req,
      res,
      'access-token',
      'refresh-token',
    );
    const payload = (res.json.mock.calls[0] as any[])[0].data;
    expect(authSessionPayload.parse(payload)).toEqual(payload);
  });

  it('returns a contract-valid me payload', async () => {
    vi.mocked(meService).mockResolvedValue({
      success: true,
      message: 'ok',
      data: {
        user: userContext(),
        activeCompany: companyContext(),
      },
    } as any);

    const req = {
      user: { id: '00000000-0000-4000-8000-000000000001' },
    } as any;
    const res = makeResponse();

    await meController(req, res as any);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = (res.json.mock.calls[0] as any[])[0].data;
    expect(authSessionPayload.parse(payload)).toEqual(payload);
  });

  it('returns a contract-valid refresh payload', async () => {
    vi.mocked(refreshTokenService).mockResolvedValue({
      success: true,
      message: 'Tokens refreshed',
      data: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token-2',
      },
    } as any);

    const req = {
      cookies: { refreshToken: 'refresh-token' },
      user: { id: '00000000-0000-4000-8000-000000000001' },
    } as any;
    const res = makeResponse();

    await refreshTokenController(req, res as any);

    const payload = (res.json.mock.calls[0] as any[])[0].data;
    expect(refreshSessionPayload.parse(payload)).toEqual(payload);
  });
});
