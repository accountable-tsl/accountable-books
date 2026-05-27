import { z } from 'zod';

export const roleKey = z.enum([
  'super_admin',
  'system_user',
  'support_admin',
  'support_agent',
  'admin',
  'manager',
  'staff',
  'client_owner',
  'client_admin',
  'client_user',
]);

export const roleScope = z.enum(['platform', 'firm', 'company']);

export type RoleKey = z.infer<typeof roleKey>;
export type RoleScope = z.infer<typeof roleScope>;

export const ROLES = {
  PLATFORM_ROLES: [
    {
      key: 'super_admin',
      name: 'Super Admin',
      description: 'Full control of the entire platform',
    },
    {
      key: 'support_admin',
      name: 'Support Admin',
      description: 'Manage users and troubleshoot issues',
    },
    {
      key: 'support_agent',
      name: 'Support Agent',
      description: 'Basic support access',
    },
    {
      key: 'system_user',
      name: 'System User',
      description: 'User for system tasks',
    },
  ],
  FIRM_ROLES: [
    {
      key: 'admin',
      name: 'Admin',
      description: 'Full firm access — settings, billing, team management',
    },
    {
      key: 'manager',
      name: 'Manager',
      description: 'Oversight, review/approve, sees all clients',
    },
    {
      key: 'staff',
      name: 'Staff',
      description: 'Does assigned work, sees assigned clients',
    },
  ],
  COMPANY_ROLES: [
    {
      key: 'client_owner',
      name: 'Client Owner',
      description: 'Owns the client company',
    },
    {
      key: 'client_admin',
      name: 'Client Admin',
      description: 'Administers the client company',
    },
    {
      key: 'client_user',
      name: 'Client User',
      description: 'Standard user (bookkeeper/viewer)',
    },
  ],
} as const;

export type FirmRoleKey = (typeof ROLES.FIRM_ROLES)[number]['key'];

export const FIRM_ROLE_KEYS: readonly FirmRoleKey[] = ROLES.FIRM_ROLES.map(
  (r) => r.key,
);
