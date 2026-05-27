import { teamMembersListResponseSchema } from '@accountable-books/contracts/schema';

const MOCK_COMPANY_ID = '00000000-0000-4000-8000-000000000001';

const rawResponse = {
  companyId: MOCK_COMPANY_ID,
  members: [
    {
      membershipId: 'a1000000-0000-4000-8000-000000000001',
      userId: 'b1000000-0000-4000-8000-000000000001',
      name: 'Temi Ade',
      email: 'temi@getaccountable.com',
      role: 'owner' as const,
      status: 'active' as const,
      assignedClientsCount: 8,
      lastActiveAt: '2026-04-14T11:59:30.000Z',
    },
    {
      membershipId: 'a1000000-0000-4000-8000-000000000002',
      userId: 'b1000000-0000-4000-8000-000000000002',
      name: 'Aisha Bello',
      email: 'aisha@getaccountable.com',
      role: 'admin' as const,
      status: 'active' as const,
      assignedClientsCount: 5,
      lastActiveAt: '2026-04-14T10:00:00.000Z',
    },
    {
      membershipId: 'a1000000-0000-4000-8000-000000000003',
      userId: 'b1000000-0000-4000-8000-000000000003',
      name: 'Daniel Marks',
      email: 'daniel@getaccountable.com',
      role: 'accountant' as const,
      status: 'active' as const,
      assignedClientsCount: 12,
      lastActiveAt: '2026-04-13T12:00:00.000Z',
    },
    {
      inviteId: 'f1000000-0000-4000-8000-000000000004',
      name: 'Zainab Yusuf',
      email: 'zainab@getaccountable.com',
      role: 'bookkeeper' as const,
      status: 'invited' as const,
      assignedClientsCount: 0,
      lastActiveAt: null,
      inviteSentAt: '2026-04-13T12:00:00.000Z',
    },
    {
      membershipId: 'a1000000-0000-4000-8000-000000000005',
      userId: 'b1000000-0000-4000-8000-000000000005',
      name: 'Maya Reed',
      email: 'maya@getaccountable.com',
      role: 'viewer' as const,
      status: 'active' as const,
      assignedClientsCount: 3,
      lastActiveAt: '2026-04-14T09:00:00.000Z',
    },
  ],
  summary: {
    total: 5,
    active: 4,
    invited: 1,
    admins: 2,
  },
} as const;

export const MOCK_TEAM_MEMBERS_RESPONSE =
  teamMembersListResponseSchema.parse(rawResponse);
