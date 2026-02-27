import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRegisterAiDomain } from '@/modules/ai';
import { useSession } from '@session';
import { useNavigate, useParams } from 'react-router';

import { dashboardReportingAiRegistration } from './ai/registration';
import { PeriodSelector } from './components/period-selector';
import { DASHBOARD_TABS, TAB_PAGE_HEADERS } from './constants';
import { DashboardBalanceTab } from './pages/balance';
import { DashboardIncomeTab } from './pages/income';
import { DashboardOverviewTab } from './pages/overview';
import { getDefaultBounds, getDefaultPeriod } from './period-utils';
import { getDefaultReportPeriod } from './report-period';
import {
  getBalanceSheetNomenclature,
  getIncomeStatementNomenclature,
} from './statement-nomenclature';

function getTemporalGreeting(firstName: string): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return `Good morning, ${firstName}.`;
  if (hour >= 12 && hour < 17) return `Good afternoon, ${firstName}.`;
  if (hour >= 17 && hour < 21) return `Good evening, ${firstName}.`;
  return `Welcome back, ${firstName}.`;
}

type DashboardTabId = (typeof DASHBOARD_TABS)[number]['id'];

const DASHBOARD_TAB_IDS = new Set<DashboardTabId>(
  DASHBOARD_TABS.map((tab) => tab.id),
);

function isDashboardTabId(value: string | undefined): value is DashboardTabId {
  return value !== undefined && DASHBOARD_TAB_IDS.has(value as DashboardTabId);
}

function buildDashboardTabPath(companyId: string, tab: DashboardTabId): string {
  return `/${encodeURIComponent(companyId)}/dashboard/${encodeURIComponent(tab)}`;
}

export function DashboardClientPage() {
  useRegisterAiDomain(useMemo(() => dashboardReportingAiRegistration(), []));

  const navigate = useNavigate();
  const { companyId, tab } = useParams<{ companyId: string; tab?: string }>();
  const { user, company } = useSession();
  const periodBounds = useMemo(() => getDefaultBounds(), []);
  const [period, setPeriod] = useState(() => getDefaultPeriod(periodBounds));
  const [reportPeriod, setReportPeriod] = useState(() =>
    getDefaultReportPeriod(periodBounds),
  );
  const activeTab: DashboardTabId = isDashboardTabId(tab) ? tab : 'overview';

  // Greeting shows once on Overview until the user switches tabs
  const hasNavigatedRef = useRef(false);
  const greetingRef = useRef(
    user?.firstname ? getTemporalGreeting(user.firstname) : null,
  );

  const showGreeting =
    activeTab === 'overview' &&
    !hasNavigatedRef.current &&
    !!greetingRef.current;

  useEffect(() => {
    if (!companyId) return;
    if (isDashboardTabId(tab)) return;
    navigate(buildDashboardTabPath(companyId, 'overview'), { replace: true });
  }, [companyId, tab, navigate]);

  useEffect(() => {
    if (activeTab !== 'overview') {
      hasNavigatedRef.current = true;
    }
  }, [activeTab]);

  const handleTabChange = (value: string) => {
    if (!companyId) return;
    if (!isDashboardTabId(value)) return;
    hasNavigatedRef.current = true;
    navigate(buildDashboardTabPath(companyId, value));
  };

  const header = TAB_PAGE_HEADERS[activeTab];
  const companyPnlLabel = (
    company as { reportingPnlLabel?: string } | undefined
  )?.reportingPnlLabel;
  const companyBsLabel = (company as { reportingBsLabel?: string } | undefined)
    ?.reportingBsLabel;
  const reportingFramework = (
    company as { reportingFramework?: string | null } | undefined
  )?.reportingFramework;
  const incomeNomenclature = getIncomeStatementNomenclature(reportingFramework);
  const balanceNomenclature = getBalanceSheetNomenclature(reportingFramework);
  const title = showGreeting
    ? greetingRef.current!
    : activeTab === 'income' && companyPnlLabel
      ? companyPnlLabel
      : activeTab === 'income'
        ? incomeNomenclature.statementTitle
        : activeTab === 'balance' && companyBsLabel
          ? companyBsLabel
          : activeTab === 'balance'
            ? balanceNomenclature.statementTitle
            : header.title;

  return (
    <div className="bg-muted dark:bg-background flex h-full min-h-0 w-full">
      <div className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-4 p-4 xl:px-8">
        <div className="flex justify-between">
          <div className="flex flex-col">
            <div className="text-xl font-medium">{title}</div>
            {!showGreeting && (
              <div className="text-muted-foreground text-sm">
                {header.subtitle}
              </div>
            )}
          </div>
          {activeTab === 'overview' && (
            <Button
              variant="outline"
              className="self-end font-normal tracking-tight"
            >
              Link a new bank
            </Button>
          )}
        </div>

        <Tabs
          value={activeTab}
          onValueChange={handleTabChange}
          className="min-h-0 w-full flex-1 gap-4"
        >
          <div className="flex min-w-0 shrink-0 items-center justify-between gap-2">
            <div className="min-w-0 overflow-x-auto [-webkit-overflow-scrolling:touch]">
              <TabsList className="bg-muted/50 text-muted-foreground dark:border-border/50 inline-flex h-9 shrink-0 gap-1 rounded-lg p-1 dark:border dark:bg-transparent">
                {DASHBOARD_TABS.map((tab) => (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    className="data-[state=active]:bg-background data-[state=active]:text-foreground dark:data-[state=active]:bg-muted/30 shrink-0 rounded-md px-3 py-1 text-xs font-medium data-[state=active]:shadow-sm md:px-4 dark:data-[state=active]:shadow-none"
                  >
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            {activeTab === 'overview' && (
              <PeriodSelector
                period={period}
                periodBounds={periodBounds}
                onPeriodChange={setPeriod}
              />
            )}
          </div>

          <TabsContent
            value="overview"
            className="mt-0 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto"
          >
            <DashboardOverviewTab
              period={period}
              onPeriodChange={(p) => setPeriod(p)}
            />
          </TabsContent>

          {DASHBOARD_TABS.slice(1).map((tab) => (
            <TabsContent
              key={tab.id}
              value={tab.id}
              className="mt-0 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto"
            >
              {tab.id === 'income' && (
                <DashboardIncomeTab
                  period={reportPeriod}
                  bounds={periodBounds}
                  onPeriodChange={setReportPeriod}
                />
              )}
              {tab.id === 'balance' && (
                <DashboardBalanceTab
                  period={reportPeriod}
                  bounds={periodBounds}
                  onPeriodChange={setReportPeriod}
                />
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}
