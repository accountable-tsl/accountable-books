import { z } from 'zod';

import { roleKey } from '../common/roles.js';

/** Product-facing team labels; map to `roleKey` in API responses. */
export const workspaceTeamRoleSchema = z.enum([
  'owner',
  'admin',
  'accountant',
  'bookkeeper',
  'viewer',
]);
export type WorkspaceTeamRole = z.infer<typeof workspaceTeamRoleSchema>;

export const teamMemberStatusSchema = z.enum(['active', 'invited']);
export type TeamMemberStatus = z.infer<typeof teamMemberStatusSchema>;

const teamMemberRowSharedFields = {
  name: z.string().min(1).max(256),
  email: z.email(),
  role: workspaceTeamRoleSchema,
  /** When present, canonical role for auth; `role` remains the product label for UI. */
  roleKey: roleKey.optional(),
  assignedClientsCount: z.number().int().nonnegative(),
  lastActiveAt: z.union([z.iso.datetime(), z.null()]),
  inviteSentAt: z.union([z.iso.datetime(), z.null()]).optional(),
};

const teamMemberRowBaseSchema = z.object(teamMemberRowSharedFields);

export const teamMemberRowActiveSchema = teamMemberRowBaseSchema.extend({
  status: z.literal('active'),
  membershipId: z.uuid(),
  userId: z.uuid(),
});

export const teamMemberRowInvitedSchema = teamMemberRowBaseSchema.extend({
  status: z.literal('invited'),
  inviteId: z.uuid(),
  /** Present once a `user_company_roles` row exists (e.g. re-invite); omit for email-only pending invites. */
  membershipId: z.uuid().optional(),
  /** Present once the user record exists; omit for email-only pending invites. */
  userId: z.uuid().optional(),
});

export const teamMemberRowSchema = z.discriminatedUnion('status', [
  teamMemberRowActiveSchema,
  teamMemberRowInvitedSchema,
]);
export type TeamMemberRow = z.infer<typeof teamMemberRowSchema>;
export type TeamMemberRowActive = z.infer<typeof teamMemberRowActiveSchema>;
export type TeamMemberRowInvited = z.infer<typeof teamMemberRowInvitedSchema>;

export const teamSettingsSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  active: z.number().int().nonnegative(),
  invited: z.number().int().nonnegative(),
  admins: z.number().int().nonnegative(),
});
export type TeamSettingsSummary = z.infer<typeof teamSettingsSummarySchema>;

export const teamMembersListResponseSchema = z.object({
  companyId: z.string().trim().min(1).max(50),
  members: z.array(teamMemberRowSchema),
  summary: teamSettingsSummarySchema.optional(),
});
export type TeamMembersListResponse = z.infer<
  typeof teamMembersListResponseSchema
>;

export const inviteTeamMemberRequestSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Enter an email address')
    .toLowerCase()
    .pipe(z.email({ error: 'Enter a valid email address' })),
  role: workspaceTeamRoleSchema,
  note: z.string().trim().max(500).optional(),
  assignedClientCompanyIds: z.array(z.uuid()).optional(),
});
export type InviteTeamMemberRequest = z.infer<
  typeof inviteTeamMemberRequestSchema
>;

export const inviteTeamMemberResponseSentSchema = z.object({
  status: z.literal('sent'),
  inviteId: z.uuid(),
  email: z.email(),
  createdAt: z.iso.datetime(),
});

export const inviteTeamMemberResponseAlreadyMemberSchema = z.object({
  status: z.literal('already_member'),
  email: z.email(),
  createdAt: z.iso.datetime(),
  membershipId: z.uuid(),
  userId: z.uuid(),
});

export const inviteTeamMemberResponseSchema = z.union([
  inviteTeamMemberResponseSentSchema,
  inviteTeamMemberResponseAlreadyMemberSchema,
]);
export type InviteTeamMemberResponse = z.infer<
  typeof inviteTeamMemberResponseSchema
>;

export const updateTeamMemberRoleRequestSchema = z.object({
  membershipId: z.uuid(),
  role: workspaceTeamRoleSchema,
});
export type UpdateTeamMemberRoleRequest = z.infer<
  typeof updateTeamMemberRoleRequestSchema
>;

/** Remove an active member (requires `user_company_roles.id` / membership row). */
export const removeTeamMemberRequestSchema = z.object({
  membershipId: z.uuid(),
});
export type RemoveTeamMemberRequest = z.infer<
  typeof removeTeamMemberRequestSchema
>;

/** Revoke a pending invite (`user_invitations.id`); use when there is no membership row yet. */
export const revokeTeamInviteRequestSchema = z.object({
  inviteId: z.uuid(),
});
export type RevokeTeamInviteRequest = z.infer<
  typeof revokeTeamInviteRequestSchema
>;

export const resendTeamInviteRequestSchema = z.object({
  inviteId: z.uuid(),
});
export type ResendTeamInviteRequest = z.infer<
  typeof resendTeamInviteRequestSchema
>;
