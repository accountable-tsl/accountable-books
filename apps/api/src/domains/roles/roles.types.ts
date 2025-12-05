import { z } from 'zod';

import { dbBaseFields } from '../../core/types/core.js';

// role
export const roleKey = z.enum([
  'super_admin',
  'system_user',
  'support_admin',
  'support_agent',
  'firm_owner',
  'firm_admin',
  'accountant',
  'staff_accountant',
  'client_owner',
  'client_admin',
  'client_user',
]);

export const roleScope = z.enum(['platform', 'firm', 'company']);
export type RoleScope = z.infer<typeof roleScope>;

export const newRole = z.object({
  key: roleKey,
  scope: roleScope.optional(),
  name: z.string().min(2),
  description: z.string().optional(),
});

export const role = newRole.merge(dbBaseFields);

export type RoleKey = z.infer<typeof roleKey>;
export type NewRoleInput = z.infer<typeof newRole>;
export type Role = z.infer<typeof role>;

export type RoleInfo = {
  id: string;
  name: string;
  description?: string;
};
