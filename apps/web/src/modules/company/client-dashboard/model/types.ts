export type ClientDashboardMetricIconId = 'coins' | 'trending-down' | 'wallet';

export type ClientDashboardMetricCard = {
  title: string;
  description?: string;
  value: string;
  change?: {
    direction: 'up' | 'down';
    percent: string;
    label: string;
  };
  footer?: {
    label: string;
    value: string;
    valueNumber?: number;
  };
  iconId: ClientDashboardMetricIconId;
};

export type ClientDashboardActionTask = {
  id: string;
  title: string;
  due: string;
  impact: string;
  ctaLabel: string;
};

export type ClientDashboardQuickAction = { label: string };

export type ClientDashboardComplianceAlert = {
  id: string;
  title: string;
  due?: string;
};

export type StatementInsight = {
  id: string;
  headline: string;
  evidence: string;
  aiPrompt: string;
};

export type ClientDashboardOverviewResponse = {
  allClearMessage: string;
  dataHealthLine: string;
  hasConnectedBank: boolean;
  hasData: boolean;
  actionCenterTasks: ClientDashboardActionTask[];
  quickActions: ClientDashboardQuickAction[];
  complianceAlerts: ClientDashboardComplianceAlert[];
  financialOverviewCards: ClientDashboardMetricCard[];
};
