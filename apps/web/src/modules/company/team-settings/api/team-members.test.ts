import { describe, expect, it } from 'vitest';

import {
  inviteTeamMember,
  removeTeamMember,
  resendTeamInvite,
  revokeTeamInvite,
  updateTeamMemberRole,
} from './team-members';

// TODO(team-settings-api): Replace these placeholder mock-behavior tests with MSW-backed
// contract tests once real /api/{companyId}/team-members endpoints are wired.
describe('inviteTeamMember (mock)', () => {
  it('returns sent for an invite request', async () => {
    const response = await inviteTeamMember({
      companyId: 'co_123',
      input: {
        email: 'new-person@getaccountable.com',
        role: 'bookkeeper',
        note: 'Welcome aboard',
      },
    });

    expect(response.status).toBe('sent');
    if (response.status !== 'sent') return;
    expect(response.email).toBe('new-person@getaccountable.com');
    expect(response.inviteId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('still returns sent when company id is empty', async () => {
    const response = await inviteTeamMember({
      companyId: '',
      input: {
        email: 'fallback@getaccountable.com',
        role: 'viewer',
      },
    });

    expect(response.status).toBe('sent');
    if (response.status !== 'sent') return;
    expect(response.email).toBe('fallback@getaccountable.com');
  });
});

describe('invited actions (mock)', () => {
  it('resendTeamInvite resolves without throwing', async () => {
    await expect(
      resendTeamInvite({
        companyId: 'co_123',
        input: {
          inviteId: 'inv_123',
        },
      }),
    ).resolves.toBeUndefined();
  });

  it('revokeTeamInvite resolves without throwing', async () => {
    await expect(
      revokeTeamInvite({
        companyId: 'co_123',
        input: {
          inviteId: 'inv_123',
        },
      }),
    ).resolves.toBeUndefined();
  });
});

describe('active member actions (mock)', () => {
  it('updateTeamMemberRole resolves without throwing', async () => {
    await expect(
      updateTeamMemberRole({
        companyId: 'co_123',
        input: {
          membershipId: '99dbde7b-19fa-4c2f-84c4-13b723ca36e8',
          role: 'admin',
        },
      }),
    ).resolves.toBeUndefined();
  });

  it('removeTeamMember resolves without throwing', async () => {
    await expect(
      removeTeamMember({
        companyId: 'co_123',
        input: {
          membershipId: '99dbde7b-19fa-4c2f-84c4-13b723ca36e8',
        },
      }),
    ).resolves.toBeUndefined();
  });
});
