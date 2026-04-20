import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useInviteTeamMember,
  useRemoveTeamMember,
  useResendTeamInvite,
  useRevokeTeamInvite,
  useUpdateTeamMemberRole,
} from './hooks';

import type {
  InviteTeamMemberResponse,
  RemoveTeamMemberRequest,
  ResendTeamInviteRequest,
  RevokeTeamInviteRequest,
  UpdateTeamMemberRoleRequest,
} from './types';

const {
  inviteTeamMemberMock,
  resendTeamInviteMock,
  revokeTeamInviteMock,
  updateTeamMemberRoleMock,
  removeTeamMemberMock,
} = vi.hoisted(() => ({
  inviteTeamMemberMock: vi.fn(),
  resendTeamInviteMock: vi.fn(),
  revokeTeamInviteMock: vi.fn(),
  updateTeamMemberRoleMock: vi.fn(),
  removeTeamMemberMock: vi.fn(),
}));

vi.mock('../api', () => ({
  fetchTeamMembers: vi.fn(),
  inviteTeamMember: inviteTeamMemberMock,
  resendTeamInvite: resendTeamInviteMock,
  revokeTeamInvite: revokeTeamInviteMock,
  updateTeamMemberRole: updateTeamMemberRoleMock,
  removeTeamMember: removeTeamMemberMock,
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe('team-settings mutation hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('useInviteTeamMember invalidates with companyId captured at mutate time', async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi
      .spyOn(queryClient, 'invalidateQueries')
      .mockResolvedValue(undefined);
    const deferred = createDeferred<InviteTeamMemberResponse>();
    inviteTeamMemberMock.mockReturnValueOnce(deferred.promise);

    const { result, rerender } = renderHook(
      ({ companyId }) => useInviteTeamMember(companyId),
      {
        initialProps: { companyId: 'co_1' },
        wrapper: createWrapper(queryClient),
      },
    );

    await act(async () => {
      const mutationPromise = result.current.mutateAsync({
        email: 'new-person@getaccountable.com',
        role: 'bookkeeper',
      });
      rerender({ companyId: 'co_2' });
      deferred.resolve({
        status: 'sent',
        inviteId: '99dbde7b-19fa-4c2f-84c4-13b723ca36e8',
        email: 'new-person@getaccountable.com',
        createdAt: new Date().toISOString(),
      });
      await mutationPromise;
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['team-settings', 'members', 'co_1'],
    });
  });

  it('useResendTeamInvite invalidates with companyId captured at mutate time', async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi
      .spyOn(queryClient, 'invalidateQueries')
      .mockResolvedValue(undefined);
    const deferred = createDeferred<void>();
    resendTeamInviteMock.mockReturnValueOnce(deferred.promise);
    const input: ResendTeamInviteRequest = {
      inviteId: '99dbde7b-19fa-4c2f-84c4-13b723ca36e8',
    };

    const { result, rerender } = renderHook(
      ({ companyId }) => useResendTeamInvite(companyId),
      {
        initialProps: { companyId: 'co_1' },
        wrapper: createWrapper(queryClient),
      },
    );

    await act(async () => {
      const mutationPromise = result.current.mutateAsync(input);
      rerender({ companyId: 'co_2' });
      deferred.resolve();
      await mutationPromise;
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['team-settings', 'members', 'co_1'],
    });
  });

  it('useRevokeTeamInvite invalidates with companyId captured at mutate time', async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi
      .spyOn(queryClient, 'invalidateQueries')
      .mockResolvedValue(undefined);
    const deferred = createDeferred<void>();
    revokeTeamInviteMock.mockReturnValueOnce(deferred.promise);
    const input: RevokeTeamInviteRequest = {
      inviteId: '99dbde7b-19fa-4c2f-84c4-13b723ca36e8',
    };

    const { result, rerender } = renderHook(
      ({ companyId }) => useRevokeTeamInvite(companyId),
      {
        initialProps: { companyId: 'co_1' },
        wrapper: createWrapper(queryClient),
      },
    );

    await act(async () => {
      const mutationPromise = result.current.mutateAsync(input);
      rerender({ companyId: 'co_2' });
      deferred.resolve();
      await mutationPromise;
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['team-settings', 'members', 'co_1'],
    });
  });

  it('useUpdateTeamMemberRole invalidates with companyId captured at mutate time', async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi
      .spyOn(queryClient, 'invalidateQueries')
      .mockResolvedValue(undefined);
    const deferred = createDeferred<void>();
    updateTeamMemberRoleMock.mockReturnValueOnce(deferred.promise);
    const input: UpdateTeamMemberRoleRequest = {
      membershipId: '99dbde7b-19fa-4c2f-84c4-13b723ca36e8',
      role: 'admin',
    };

    const { result, rerender } = renderHook(
      ({ companyId }) => useUpdateTeamMemberRole(companyId),
      {
        initialProps: { companyId: 'co_1' },
        wrapper: createWrapper(queryClient),
      },
    );

    await act(async () => {
      const mutationPromise = result.current.mutateAsync(input);
      rerender({ companyId: 'co_2' });
      deferred.resolve();
      await mutationPromise;
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['team-settings', 'members', 'co_1'],
    });
  });

  it('useRemoveTeamMember invalidates with companyId captured at mutate time', async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi
      .spyOn(queryClient, 'invalidateQueries')
      .mockResolvedValue(undefined);
    const deferred = createDeferred<void>();
    removeTeamMemberMock.mockReturnValueOnce(deferred.promise);
    const input: RemoveTeamMemberRequest = {
      membershipId: '99dbde7b-19fa-4c2f-84c4-13b723ca36e8',
    };

    const { result, rerender } = renderHook(
      ({ companyId }) => useRemoveTeamMember(companyId),
      {
        initialProps: { companyId: 'co_1' },
        wrapper: createWrapper(queryClient),
      },
    );

    await act(async () => {
      const mutationPromise = result.current.mutateAsync(input);
      rerender({ companyId: 'co_2' });
      deferred.resolve();
      await mutationPromise;
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['team-settings', 'members', 'co_1'],
    });
  });
});
