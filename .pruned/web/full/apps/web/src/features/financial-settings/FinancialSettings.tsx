import { TooltipHelper } from '@/components/TooltipHelper';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Info } from 'lucide-react';
import { useSession } from '@/features/auth/Session';
import { CenteredLoader } from '@/components/CenteredLoader';
import ErrorPage from '@/components/ErrorPage';
import { useMemo } from 'react';
import { generateDateRange } from '@/shared/utils/date-utils';

const TOOLTIP = {
  baseCurrency:
    'Your base currency is used for all financial reports and statements. All foreign currency transactions are converted to this currency for reporting purposes.',
  financialYear:
    'Your financial year defines the 12-month period used for financial reporting, budgeting, and tax purposes. This determines how your annual financial statements are structured.',
  cashBasis: 'Transactions recorded only when cash changes hands',
  modAccrualBasis:
    'Revenue recorded when earned and measurable, expenses when incurred and measurable',
};

export const FinancialSettings = () => {
  const { company, loading } = useSession();

  if (loading) return <CenteredLoader />;
  if (!company) return <ErrorPage type="default" />;

  const accountingBasis = useMemo(
    () => (company?.accountingBasis === 'modified_cash_basis' ? 'Cash' : 'Modified Accrual'),
    [company?.accountingBasis],
  );

  const basisTooltip = useMemo(() => {
    return company?.accountingBasis === 'modified_cash_basis'
      ? TOOLTIP.cashBasis
      : TOOLTIP.modAccrualBasis;
  }, [company?.accountingBasis]);

  const assignedFirm = useMemo(
    () => (company?.assignedFirmIsPlatform ? null : company?.assignedFirmName),
    [company?.assignedFirmIsPlatform, company?.assignedFirmName],
  );

  const currency = useMemo(
    () => ({
      code: company.reportingCurrencyCode,
      name: company.reportingCurrencyName,
      symbol: company.reportingCurrencySymbol,
    }),
    [company.reportingCurrencyCode, company.reportingCurrencyName, company.reportingCurrencySymbol],
  );

  const { start: fyStart, end: fyEnd } = useMemo(
    () =>
      generateDateRange({
        endDay: company.yearEndDay,
        endMonth: company.yearEndMonth,
        distance: 1,
        unit: 'years',
      }),
    [company.yearEndDay, company.yearEndMonth],
  );

  return (
    <div className="flex flex-col space-y-6 max-w-full overflow-clip">
      <div className="pt-4">
        <div className="px-8">
          <h2 className="text-lg font-medium">Financial Settings</h2>
          <p className="text-muted-foreground text-sm">
            This is your company's accounting configurations.
          </p>
        </div>
        <div className="flex gap-2 items-center text-sm p-2 px-8 bg-muted">
          <Info className="flex-shrink-0 w-4 h-4" />
          <p>
            These settings were configured during the initial setup of your account and cannot be
            changed.
          </p>
        </div>
        <Separator />
      </div>
      <div className="px-8 grid grid-cols-2 gap-8">
        <div className="flex flex-col space-y-2 border p-3 rounded-md">
          <div>
            <div className="flex items-center gap-1">
              <p className="font-medium">Base Currency</p>
              <TooltipHelper content={TOOLTIP.baseCurrency} />
            </div>
            <p className="text-muted-foreground text-sm">
              Your primary reporting and presentation currency
            </p>
          </div>
          <Separator />
          <div className="flex items-center gap-2 py-1 flex-1">
            <strong className="font-medium">{`${currency.code}`}</strong>
            <span className="text-muted-foreground">
              {` ${currency.name} ${currency.symbol ? `(${currency.symbol})` : ''} 🔒`}
            </span>
          </div>
        </div>

        <div className="flex flex-col space-y-2 border p-3 rounded-md">
          <div>
            <div className="flex items-center gap-1">
              <p className="font-medium">Financial Year</p>
              <TooltipHelper content={TOOLTIP.financialYear} />
            </div>
            <p className="text-muted-foreground text-sm">Your annual financial reporting period</p>
          </div>
          <Separator />
          <div className="flex items-center gap-2 py-1">
            <div className="flex justify-between w-full min-h-0 h-full gap-4">
              <div className="flex items-center gap-2 justify-between flex-1">
                <p>Start Date</p>
                <Badge>
                  {fyStart.monthName} {fyStart.dayNumber}
                </Badge>
              </div>
              <Separator orientation="vertical" />
              <div className="flex items-center gap-2 justify-between flex-1">
                <p>End Date</p>
                <Badge>
                  {fyEnd.monthName} {fyEnd.dayNumber}
                </Badge>
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="flex flex-col space-y-2 border p-3 rounded-md">
            <div>
              <div className="flex items-center gap-1">
                <p className="font-medium">Accounting Basis</p>
                <TooltipHelper content={basisTooltip || 'This is your accounting basis'} />
              </div>
              <p className="text-muted-foreground text-sm">
                {`This dictates when you formally count a sale as income – or a purchase
              as an expense`}
              </p>
            </div>
            <Separator />
            <div className="flex items-center gap-2 py-1 flex-1">
              <p className="font-medium">{accountingBasis || '-'}</p>
            </div>
          </div>
        </div>

        {/* if not platform, show this */}
        {assignedFirm && (
          <div>
            <div className="flex flex-col space-y-2 p-3 rounded-md">
              <div>
                <div className="flex items-center gap-1">
                  <p className="font-medium">Accounting Firm</p>
                </div>
                <p className="text-muted-foreground text-sm">
                  {`This is the accounting firm that manages your financial records`}
                </p>
              </div>
              <Separator />
              <div className="flex items-center gap-2 py-1 flex-1">
                <p className="font-medium">{assignedFirm}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
