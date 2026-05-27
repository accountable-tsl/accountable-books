import { useMemo } from 'react';
import { CenteredLoader } from '@/components/CenteredLoader';
import ErrorPage from '@/components/ErrorPage';
import { TooltipHelper } from '@/components/TooltipHelper';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { generateDateRange } from '@/shared/utils/date-utils';
import { useSession } from '@session';
import { Info } from 'lucide-react';

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

  const accountingBasis = useMemo(
    () =>
      company?.accountingBasis === 'modified_cash_basis'
        ? 'Cash'
        : 'Modified Accrual',
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
      code: company?.reportingCurrencyCode,
      name: company?.reportingCurrencyName,
      symbol: company?.reportingCurrencySymbol,
    }),
    [
      company?.reportingCurrencyCode,
      company?.reportingCurrencyName,
      company?.reportingCurrencySymbol,
    ],
  );

  const { start: fyStart, end: fyEnd } = useMemo(
    () =>
      company
        ? generateDateRange({
            endDay: company.yearEndDay,
            endMonth: company.yearEndMonth,
            distance: 1,
            unit: 'years',
          })
        : { start: null, end: null },
    [company],
  );

  if (loading) return <CenteredLoader />;
  if (!company) return <ErrorPage type="default" />;

  return (
    <div className="flex max-w-full flex-col space-y-6 overflow-clip">
      <div className="pt-4">
        <div className="px-8">
          <h2 className="text-lg font-medium">Financial Settings</h2>
          <p className="text-muted-foreground text-sm">
            This is your company's accounting configurations.
          </p>
        </div>
        <div className="bg-muted flex items-center gap-2 p-2 px-8 text-sm">
          <Info className="h-4 w-4 shrink-0" />
          <p>
            These settings were configured during the initial setup of your
            account and cannot be changed.
          </p>
        </div>
        <Separator />
      </div>
      <div className="grid grid-cols-2 gap-8 px-8">
        <div className="flex flex-col space-y-2 rounded-md border p-3">
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
          <div className="flex flex-1 items-center gap-2 py-1">
            <strong className="font-medium">{`${currency.code}`}</strong>
            <span className="text-muted-foreground">
              {` ${currency.name} ${currency.symbol ? `(${currency.symbol})` : ''} 🔒`}
            </span>
          </div>
        </div>

        <div className="flex flex-col space-y-2 rounded-md border p-3">
          <div>
            <div className="flex items-center gap-1">
              <p className="font-medium">Financial Year</p>
              <TooltipHelper content={TOOLTIP.financialYear} />
            </div>
            <p className="text-muted-foreground text-sm">
              Your annual financial reporting period
            </p>
          </div>
          <Separator />
          <div className="flex items-center gap-2 py-1">
            <div className="flex h-full min-h-0 w-full justify-between gap-4">
              <div className="flex flex-1 items-center justify-between gap-2">
                <p>Start Date</p>
                <Badge>
                  {fyStart?.monthName} {fyStart?.dayNumber}
                </Badge>
              </div>
              <Separator orientation="vertical" />
              <div className="flex flex-1 items-center justify-between gap-2">
                <p>End Date</p>
                <Badge>
                  {fyEnd?.monthName} {fyEnd?.dayNumber}
                </Badge>
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="flex flex-col space-y-2 rounded-md border p-3">
            <div>
              <div className="flex items-center gap-1">
                <p className="font-medium">Accounting Basis</p>
                <TooltipHelper
                  content={basisTooltip || 'This is your accounting basis'}
                />
              </div>
              <p className="text-muted-foreground text-sm">
                {`This dictates when you formally count a sale as income – or a purchase
              as an expense`}
              </p>
            </div>
            <Separator />
            <div className="flex flex-1 items-center gap-2 py-1">
              <p className="font-medium">{accountingBasis || '-'}</p>
            </div>
          </div>
        </div>

        {/* if not platform, show this */}
        {assignedFirm && (
          <div>
            <div className="flex flex-col space-y-2 rounded-md p-3">
              <div>
                <div className="flex items-center gap-1">
                  <p className="font-medium">Accounting Firm</p>
                </div>
                <p className="text-muted-foreground text-sm">
                  {`This is the accounting firm that manages your financial records`}
                </p>
              </div>
              <Separator />
              <div className="flex flex-1 items-center gap-2 py-1">
                <p className="font-medium">{assignedFirm}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
