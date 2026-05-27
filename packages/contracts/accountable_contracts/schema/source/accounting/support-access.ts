import { z } from 'zod';

import { roleKey } from '../common/roles.js';

export const supportAccessLevel = z.enum([
  'read_only',
  'company_profile_write',
]);
export type SupportAccessLevel = z.infer<typeof supportAccessLevel>;

export const supportAccessOrigin = z.enum([
  'explicit_company',
  'explicit_firm',
  'demo',
  'platform_internal',
  'support_grant',
  'break_glass',
]);
export type SupportAccessOrigin = z.infer<typeof supportAccessOrigin>;

export const supportGrantStatus = z.enum(['active', 'revoked', 'expired']);
export type SupportGrantStatus = z.infer<typeof supportGrantStatus>;

export const breakGlassSessionStatus = z.enum(['active', 'closed', 'expired']);
export type BreakGlassSessionStatus = z.infer<typeof breakGlassSessionStatus>;

const reasonSchema = z
  .string()
  .trim()
  .min(1, 'Reason is required')
  .max(500, 'Reason must be 500 characters or fewer');

export const createSupportGrantRequest = z.object({
  supportUserId: z.uuid(),
  supportAccessLevel,
  expiresAt: z.iso.datetime(),
  reason: reasonSchema,
});
export type CreateSupportGrantRequest = z.infer<
  typeof createSupportGrantRequest
>;

export const revokeSupportGrantRequest = z.object({
  reason: z
    .string()
    .trim()
    .max(500, 'Reason must be 500 characters or fewer')
    .optional(),
});
export type RevokeSupportGrantRequest = z.infer<
  typeof revokeSupportGrantRequest
>;

export const openBreakGlassRequest = z.object({
  expiresAt: z.iso.datetime(),
  reason: reasonSchema,
});
export type OpenBreakGlassRequest = z.infer<typeof openBreakGlassRequest>;

export const supportGrantResponse = z.object({
  id: z.uuid(),
  companyId: z.string().trim().min(1).max(50),
  supportUserId: z.uuid(),
  supportUserEmail: z.email(),
  supportUserRoleKey: roleKey,
  grantedByUserId: z.uuid(),
  supportAccessLevel,
  status: supportGrantStatus,
  reason: z.string(),
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  revokedAt: z.union([z.iso.datetime(), z.null()]),
  revokedByUserId: z.union([z.uuid(), z.null()]),
  revokeReason: z.union([z.string(), z.null()]),
});
export type SupportGrantResponse = z.infer<typeof supportGrantResponse>;

export const listSupportGrantsResponse = z.object({
  grants: z.array(supportGrantResponse),
});
export type ListSupportGrantsResponse = z.infer<
  typeof listSupportGrantsResponse
>;

export const breakGlassSessionResponse = z.object({
  id: z.uuid(),
  companyId: z.string().trim().min(1).max(50),
  superAdminUserId: z.uuid(),
  supportAccessLevel: z.literal('company_profile_write'),
  status: breakGlassSessionStatus,
  reason: z.string(),
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  closedAt: z.union([z.iso.datetime(), z.null()]),
  closedByUserId: z.union([z.uuid(), z.null()]),
  closeReason: z.union([z.string(), z.null()]),
});
export type BreakGlassSessionResponse = z.infer<
  typeof breakGlassSessionResponse
>;
