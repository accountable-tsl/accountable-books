import {
  breakGlassSessionResponse,
  breakGlassSessionStatus,
  createSupportGrantRequest,
  listSupportGrantsResponse,
  openBreakGlassRequest,
  revokeSupportGrantRequest,
  supportAccessLevel,
  supportAccessOrigin,
  supportGrantResponse,
  supportGrantStatus,
} from '@accountable-books/contracts/schema';
import { z } from 'zod';

export {
  breakGlassSessionResponse,
  breakGlassSessionStatus,
  createSupportGrantRequest,
  listSupportGrantsResponse,
  openBreakGlassRequest,
  revokeSupportGrantRequest,
  supportAccessLevel,
  supportAccessOrigin,
  supportGrantResponse,
  supportGrantStatus,
};

export type SupportAccessLevel = z.infer<typeof supportAccessLevel>;
export type SupportAccessOrigin = z.infer<typeof supportAccessOrigin>;
export type SupportGrantStatus = z.infer<typeof supportGrantStatus>;
export type BreakGlassSessionStatus = z.infer<typeof breakGlassSessionStatus>;
export type CreateSupportGrantRequest = z.infer<
  typeof createSupportGrantRequest
>;
export type RevokeSupportGrantRequest = z.infer<
  typeof revokeSupportGrantRequest
>;
export type OpenBreakGlassRequest = z.infer<typeof openBreakGlassRequest>;
export type SupportGrantResponse = z.infer<typeof supportGrantResponse>;
export type ListSupportGrantsResponse = z.infer<
  typeof listSupportGrantsResponse
>;
export type BreakGlassSessionResponse = z.infer<
  typeof breakGlassSessionResponse
>;

export const SUPPORT_ACCESS_RECENT_WINDOW_DAYS = 30;
export const READ_ONLY_MAX_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const COMPANY_PROFILE_WRITE_MAX_TTL_MS = 24 * 60 * 60 * 1000;
export const BREAK_GLASS_MAX_TTL_MS = 60 * 60 * 1000;

export type SupportGrantListRow = {
  id: string;
  companyId: string;
  companyShortCode: string;
  supportUserId: string;
  supportUserEmail: string;
  supportUserRoleKey: string;
  grantedByUserId: string;
  supportAccessLevel: SupportAccessLevel;
  status: 'active' | 'revoked' | 'expired';
  reason: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  revokedAt: Date | null;
  revokedByUserId: string | null;
  revokeReason: string | null;
};

export type BreakGlassSessionRow = {
  id: string;
  companyId: string;
  companyShortCode: string;
  superAdminUserId: string;
  status: 'active' | 'closed' | 'expired';
  reason: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  closedAt: Date | null;
  closedByUserId: string | null;
  closeReason: string | null;
};
