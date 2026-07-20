import type { RoleKey, RoleScope } from '@accountable-books/contracts/schema';
import { roleKey, roleScope } from '@accountable-books/contracts/schema';
import { z } from 'zod';

export { roleKey, roleScope };
export type { RoleKey, RoleScope };

export const newRole = z.object({
  key: roleKey,
  scope: roleScope,
  name: z.string().min(2),
  description: z.string().nullish(),
});

export const role = newRole.extend({
  id: z.uuid(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export type NewRoleInput = z.infer<typeof newRole>;
export type Role = z.infer<typeof role>;

export type RoleInfo = {
  id: string;
  name: string;
  description?: string | null;
};
