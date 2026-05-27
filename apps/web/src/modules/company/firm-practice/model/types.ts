import type { FirmViewerRole } from '@accountable-books/contracts/schema';

export type {
  FirmClientAssignee,
  FirmClientInviteAssigneeInvite,
  FirmClientInviteCompany,
  FirmClientInviteCompanyStep2,
  FirmClientInviteInvite,
  FirmClientInviteRequest,
  FirmClientInviteResponse,
  FirmClientInviteWizardSteps12,
  FirmClientInviteWizardSteps123,
  FirmClientRosterResponse,
  FirmClientStatus,
  FirmClientSummary,
  FirmClientTransactionStats,
  FirmEngagementTaskCategory,
  FirmEngagementTaskScopeType,
  FirmEngagementTaskType,
  FirmTaskActionabilityState,
  FirmTaskAssignee,
  FirmTaskPriority,
  FirmTaskQueueItem,
  FirmTaskQueueResponse,
  FirmTaskQueueSummary,
  FirmTaskStatus,
  FirmViewerRole,
} from '@accountable-books/contracts/schema';

export {
  firmClientAssigneeSchema,
  firmClientInviteAssigneeInviteSchema,
  firmClientInviteCompanySchema,
  firmClientInviteCompanyStep2Schema,
  firmClientInviteRequestSchema,
  firmClientInviteWizardSteps12Schema,
  firmClientInviteWizardSteps123Schema,
  firmClientInviteResponseSchema,
  firmClientRosterResponseSchema,
  firmClientStatusSchema,
  firmClientSummarySchema,
  firmClientTransactionStatsSchema,
  firmEngagementTaskCategorySchema,
  firmEngagementTaskScopeTypeSchema,
  firmEngagementTaskTypeSchema,
  firmTaskActionabilityStateSchema,
  firmTaskAssigneeSchema,
  firmTaskPrioritySchema,
  firmTaskQueueItemSchema,
  firmTaskQueueResponseSchema,
  firmTaskQueueSummarySchema,
  firmTaskStatusSchema,
  firmViewerRoleSchema,
} from '@accountable-books/contracts/schema';

export type FirmInviteStaffOption = {
  userId: string;
  name: string;
  initials: string;
};

export type FirmWeeklyActivityPoint = {
  day: string;
  transactions: number;
};

export type FirmAggregatePerformanceStats = {
  transactionsToday: number;
  transactionsWeek: number;
  transactionsMonth: number;
  transactionsTodayPrev: number;
  transactionsWeekPrev: number;
  transactionsMonthPrev: number;
};

/**
 * Firm dashboard shell payload (mock today; align with future GET shell/settings).
 * `inviteClientRolesAllowed`: which firm viewer roles may open the client-invite flow.
 * Default product rule: admin + manager; staff excluded unless firm changes policy.
 */
export type FirmDashboardShellSnapshot = {
  firmCompanyId: string;
  heroGreetingLine: string;
  heroSubline: string;
  viewerRole: FirmViewerRole;
  /** Non-empty in normal operation; empty array = explicit lockout (no role may invite). */
  inviteClientRolesAllowed: FirmViewerRole[];
  firmUserCount: number;
  weeklyActivity: FirmWeeklyActivityPoint[];
  firmPerformanceStats: FirmAggregatePerformanceStats;
};
