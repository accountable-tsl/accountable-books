import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  requireCompanyLogoMutationAccess,
  requireFinalizeUploadIntentAccess,
  requireUploadIntentAccess,
} from '../objects.middleware.js';

import type { AuthRequest } from '../../../features/auth/auth.types.js';

const { mockPatchDeniedReason } = vi.hoisted(() => ({
  mockPatchDeniedReason: vi.fn(),
}));

const mockKnexFirst = vi.fn();

vi.mock('../../companies/companies.workspace-mutation.policy.js', () => ({
  getWorkspaceCompanyPatchDeniedReason: mockPatchDeniedReason,
}));

vi.mock('../../../db/knexClient.js', () => ({
  knexClient: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    first: mockKnexFirst,
  })),
}));

function makeResponse() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
}

describe('object access middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPatchDeniedReason.mockReturnValue(null);
  });

  it('allows non-logo upload intents without applying company patch policy', async () => {
    const req = {
      user: { id: 'user-1' },
      company: { id: 'co1' },
      body: { purpose: 'txn_attachment' },
    } as unknown as AuthRequest;
    const res = makeResponse();
    const next = vi.fn();

    requireUploadIntentAccess(req, res as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(mockPatchDeniedReason).not.toHaveBeenCalled();
  });

  it('blocks company-logo upload intents when company settings mutation is denied', async () => {
    mockPatchDeniedReason.mockReturnValue('This support session is read-only');

    const req = {
      user: { id: 'user-1' },
      company: { id: 'co1' },
      body: { purpose: 'company_logo' },
    } as unknown as AuthRequest;
    const res = makeResponse();
    const next = vi.fn();

    requireUploadIntentAccess(req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('blocks direct company-logo deletion when company settings mutation is denied', async () => {
    mockPatchDeniedReason.mockReturnValue(
      'Only workspace admins can update company settings',
    );

    const req = {
      user: { id: 'user-1' },
      company: { id: 'co1' },
    } as unknown as AuthRequest;
    const res = makeResponse();
    const next = vi.fn();

    requireCompanyLogoMutationAccess(req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('blocks company-logo finalize when company settings mutation is denied', async () => {
    mockPatchDeniedReason.mockReturnValue(
      'Only workspace admins can update company settings',
    );
    mockKnexFirst.mockResolvedValue({ purpose: 'company_logo' });

    const req = {
      user: { id: 'user-1' },
      company: { id: 'co1' },
      companyContext: { uuid: 'company-uuid' },
      body: { intentId: 'intent-1' },
    } as unknown as AuthRequest;
    const res = makeResponse();
    const next = vi.fn();

    await requireFinalizeUploadIntentAccess(req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('requires an authenticated user', async () => {
    const req = {
      company: { id: 'co1' },
      body: { purpose: 'company_logo' },
    } as unknown as AuthRequest;
    const res = makeResponse();
    const next = vi.fn();

    requireUploadIntentAccess(req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
