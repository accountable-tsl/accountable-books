import { z } from 'zod';

export const roleName = z.enum([
  'super_admin',
  'admin',
  'bookkeeper',
  'client',
  'demo_user',
  'support',
]);

export type RoleName = z.infer<typeof roleName>;
