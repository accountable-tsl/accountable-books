import type { RoleKey, RoleScope } from '@accountable-books/contracts/schema';
import { roleKey, roleScope } from '@accountable-books/contracts/schema';
import { z } from 'zod';

import { dbBaseFields } from '../../core/types/core.js';

export { roleKey, roleScope };
export type { RoleKey, RoleScope };

export const newRole = z.object({
  key: roleKey,
  scope: roleScope.optional(),
  name: z.string().min(2),
  description: z.string().optional(),
});

export const role = newRole.merge(dbBaseFields);

export type NewRoleInput = z.infer<typeof newRole>;
export type Role = z.infer<typeof role>;

export type RoleInfo = {
  id: string;
  name: string;
  description?: string;
};
