import { NewRoleInput } from '../../src/domains/roles/roles.types';

export const ROLES: Record<string, Array<NewRoleInput>> = {
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
  ],
  FIRM_ROLES: [
    {
      key: 'firm_owner',
      name: 'Firm Owner',
      description: 'Owns the accounting firm',
    },
    { key: 'firm_admin', name: 'Firm Admin', description: 'Manages the firm' },
    {
      key: 'accountant',
      name: 'Accountant',
      description: 'Does bookkeeping for clients',
    },
    {
      key: 'staff_accountant',
      name: 'Staff Accountant',
      description: 'Junior accounting staff',
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
