import type {
  BillingOverviewResponse,
  BillingUpcomingBillCategory,
  BillingUpcomingPayoutLedgerSlot,
  PaymentMethodBrand,
  UpcomingBillState,
} from '@/modules/company/billing';
import type { LucideIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { TooltipHelper } from '@/components/TooltipHelper';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useBillingOverview } from '@/modules/company/billing';
import {
  formatAccountText,
  formatAmount,
  safeFormatDate,
} from '@/shared/utils/formatting-utils';
import { useSession } from '@session';
import {
  ArrowUpRight,
  ChevronRight,
  CreditCard,
  Database,
  MoreHorizontal,
  Pencil,
  Wallet,
} from 'lucide-react';
import { Navigate } from 'react-router';

import { ManagePlanDialog } from '../billing/manage-plan/manage-plan-dialog';
import { getWorkspaceBillingView } from '../lib/billing-visibility';

function getUpcomingBillCategoryCopy(category: BillingUpcomingBillCategory): {
  label: string;
  tooltip: string;
} {
  switch (category) {
    case 'firm_subscription':
      return {
        label: 'Firm subscription',
        tooltip: "Your firm's subscription.",
      };
    case 'firm_overage_usage':
      return {
        label: 'Firm usage',
        tooltip: 'Metered usage on your firm workspace.',
      };
    case 'managed_clients_subscriptions':
      return {
        label: 'Managed business workspaces',
        tooltip: 'Business workspace charges billed to your firm.',
      };
    case 'managed_clients_usage':
      return {
        label: 'Managed client usage',
        tooltip:
          'Metered usage on managed client workspaces, billed to your firm.',
      };
    case 'credit_applied':
      return {
        label: 'Credits applied',
        tooltip: 'Credits applied against this bill.',
      };
    case 'adjustment':
      return { label: 'Adjustments', tooltip: 'Adjustments to your bill.' };
  }
}

function getPayoutLedgerSlotLabel(
  slot: BillingUpcomingPayoutLedgerSlot,
): string {
  switch (slot) {
    case 'openingBalance':
      return 'Opening balance';
    case 'clientCollections':
      return 'Amount collected from clients';
    case 'platformFee':
      return 'Platform fee deducted';
    case 'paidOut':
      return 'Amount paid this period';
    case 'adjustments':
      return 'Adjustments';
    case 'endingBalance':
      return 'Balance pending payment';
  }
}

function getPaymentMethodBrandLabel(brand: PaymentMethodBrand): string {
  switch (brand) {
    case 'visa':
      return 'Visa';
    case 'mastercard':
      return 'Mastercard';
    case 'amex':
      return 'Amex';
    case 'discover':
      return 'Discover';
    case 'diners':
      return 'Diners';
    case 'jcb':
      return 'JCB';
    case 'unionpay':
      return 'UnionPay';
    case 'other':
      return 'Card';
  }
}

const PAYMENT_METHOD_CAPTION = 'Used for your plan and credit charges.';
const PAYOUT_ACCOUNT_CAPTION = 'Used to receive firm payout transfers.';

function getUpcomingBillSectionCopy(
  state: UpcomingBillState,
  dateLabel: string,
): {
  title: string;
  subtitle: string;
  amountCardLabel: string;
  totalLabel: string;
} {
  switch (state) {
    case 'estimate':
      return {
        title: 'Upcoming bill',
        subtitle: `Estimated charges for ${dateLabel}`,
        amountCardLabel: 'Estimated total',
        totalLabel: `Estimated total for ${dateLabel}`,
      };
    case 'past_due':
      return {
        title: 'Past due',
        subtitle: `Invoice was due ${dateLabel}`,
        amountCardLabel: 'Past due amount',
        totalLabel: `Past due since ${dateLabel}`,
      };
    case 'open_invoice':
      return {
        title: 'Amount due',
        subtitle: `Invoice due ${dateLabel}`,
        amountCardLabel: 'Amount due',
        totalLabel: `Total due ${dateLabel}`,
      };
    case 'none':
      return {
        title: 'No upcoming bill',
        subtitle: 'You have no charges this cycle.',
        amountCardLabel: 'No charges',
        totalLabel: 'No charges this cycle',
      };
  }
}

const BILLING_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'billing', label: 'Invoices' },
  { id: 'payouts', label: 'Payouts' },
  { id: 'usage', label: 'Usage & credits' },
  { id: 'clients', label: 'Clients' },
] as const;

type BillingTab = (typeof BILLING_TABS)[number]['id'];

const TAB_PANEL_COPY: Record<Exclude<BillingTab, 'overview'>, string> = {
  billing: 'Invoices',
  payouts: 'Payouts',
  usage: 'Usage & credits',
  clients: 'Clients',
};

function tabLabel(id: BillingTab): string {
  return BILLING_TABS.find((t) => t.id === id)?.label ?? id;
}

type UpcomingBillAction = {
  id: string;
  label: string;
  variant?: 'default' | 'outline';
  onSelect: () => void;
};

type OverviewCard = {
  id: string;
  targetTab: BillingTab;
  title: string;
  icon: LucideIcon;
  stat: string;
  statSuffix?: string;
  caption: string;
};

function UpcomingBillActions({ actions }: { actions: UpcomingBillAction[] }) {
  if (actions.length <= 2) {
    return (
      <div className="flex items-center gap-1">
        {actions.map((action) => (
          <Button
            key={action.id}
            variant={action.variant ?? 'outline'}
            size="xs"
            onClick={action.onSelect}
          >
            {action.label}
          </Button>
        ))}
      </div>
    );
  }

  const [primaryAction, ...overflowActions] = actions;

  return (
    <div className="flex items-center gap-1">
      <Button
        variant={primaryAction.variant ?? 'default'}
        size="xs"
        onClick={primaryAction.onSelect}
      >
        {primaryAction.label}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="size-7">
            <MoreHorizontal className="size-3.5" aria-hidden />
            <span className="sr-only">More bill actions</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {overflowActions.map((action) => (
            <DropdownMenuItem key={action.id} onSelect={action.onSelect}>
              {action.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function OverviewCardButton({
  card,
  onSelect,
}: {
  card: OverviewCard;
  onSelect: (tab: BillingTab) => void;
}) {
  const Icon = card.icon;
  const goTo = tabLabel(card.targetTab);

  return (
    <button
      type="button"
      onClick={() => onSelect(card.targetTab)}
      className={cn(
        'group hover:bg-muted/50 flex w-full cursor-pointer justify-between gap-2 rounded-md border p-3 text-left lg:p-4 lg:pr-3',
        'ring-offset-background focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
      )}
      aria-label={`${card.title}, ${card.stat}${card.statSuffix ? ` ${card.statSuffix}` : ''}. ${card.caption}. Open ${goTo} tab.`}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-center gap-2">
          <Icon className="text-muted-foreground size-4 shrink-0" aria-hidden />
          <p className="text-xs font-medium tracking-wide whitespace-nowrap uppercase">
            {card.title}
          </p>
        </div>
        <div>
          <div className="flex h-[25px] items-end gap-2">
            <p className="text-xl font-semibold tabular-nums">
              {card.stat}
              {card.statSuffix ? (
                <span className="text-muted-foreground ml-1 text-xs font-normal">
                  {card.statSuffix}
                </span>
              ) : null}
            </p>
          </div>
          <p className="text-muted-foreground text-xs whitespace-nowrap">
            {card.caption}
          </p>
        </div>
      </div>
      <div
        className="flex shrink-0 items-center self-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        aria-hidden
      >
        <ChevronRight className="text-muted-foreground size-4" />
      </div>
    </button>
  );
}

const PAYOUT_LEDGER_ORDER: readonly BillingUpcomingPayoutLedgerSlot[] = [
  'openingBalance',
  'clientCollections',
  'platformFee',
  'paidOut',
  'adjustments',
  'endingBalance',
] as const;

function BillingOverviewLoadingState({
  overviewPanelId,
  overviewTabId,
}: {
  overviewPanelId: string;
  overviewTabId: string;
}) {
  return (
    <div
      id={overviewPanelId}
      role="tabpanel"
      aria-labelledby={overviewTabId}
      className="flex flex-col gap-6 overflow-x-auto pb-2"
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="rounded-md border p-3 lg:p-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-4 h-8 w-28" />
            <Skeleton className="mt-2 h-4 w-32" />
          </div>
        ))}
      </div>

      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <div className="rounded-md border p-4">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="mt-3 h-4 w-64" />
            <Skeleton className="mt-4 h-28 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function BillingOverviewErrorState({
  overviewPanelId,
  overviewTabId,
  onRetry,
}: {
  overviewPanelId: string;
  overviewTabId: string;
  onRetry: () => void;
}) {
  return (
    <div
      id={overviewPanelId}
      role="tabpanel"
      aria-labelledby={overviewTabId}
      className="flex flex-col gap-6 overflow-x-auto pb-2"
    >
      <div className="flex min-h-80 flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center">
        <p className="font-medium">Could not load billing overview</p>
        <p className="text-muted-foreground max-w-md text-sm">
          We couldn&apos;t fetch the latest billing data. Try again to reload
          the current overview.
        </p>
        <Button type="button" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      </div>
    </div>
  );
}

function BillingOverviewEmptyState({
  overviewPanelId,
  overviewTabId,
}: {
  overviewPanelId: string;
  overviewTabId: string;
}) {
  return (
    <div
      id={overviewPanelId}
      role="tabpanel"
      aria-labelledby={overviewTabId}
      className="flex flex-col gap-6 overflow-x-auto pb-2"
    >
      <div className="flex min-h-80 flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center">
        <p className="font-medium">Billing overview is unavailable</p>
        <p className="text-muted-foreground max-w-md text-sm">
          The billing overview did not return any data yet.
        </p>
      </div>
    </div>
  );
}

function BillingOverviewPanel({
  overview,
  overviewPanelId,
  overviewTabId,
  onSelectTab,
  onManagePlan,
}: {
  overview: BillingOverviewResponse;
  overviewPanelId: string;
  overviewTabId: string;
  onSelectTab: (tab: BillingTab) => void;
  onManagePlan: () => void;
}) {
  const {
    plan,
    upcomingBill,
    upcomingPayout,
    wallet,
    accounts,
    clientsSummary,
  } = overview;

  const planCurrency = plan.plan?.currencyCode ?? 'USD';
  const planPriceLabel = plan.plan
    ? `${formatAmount(plan.plan.price, { currency: planCurrency, showSymbol: true, minFractionDigits: 0, maxFractionDigits: 0 })}${plan.plan.interval === 'month' ? '/mo' : '/yr'}`
    : '$0/mo';
  const planName = plan.plan?.name ?? 'No active plan';
  const planRenewalLabel = plan.currentPeriodEndAt
    ? `Renews ${safeFormatDate({ date: plan.currentPeriodEndAt, formatString: 'MMM dd, yyyy' }) || 'N/A'}`
    : 'No renewal scheduled';
  const planActionLabel = plan.status === 'none' ? 'View plans' : 'Manage plan';

  const upcomingBillDateLabel =
    safeFormatDate({
      date: upcomingBill.dueAt ?? upcomingBill.periodEndAt,
      formatString: 'MMM dd, yyyy',
    }) || 'N/A';
  const upcomingBillCopy = getUpcomingBillSectionCopy(
    upcomingBill.state,
    upcomingBillDateLabel,
  );
  const upcomingBillTotalLabel = formatAmount(upcomingBill.total.amount, {
    currency: upcomingBill.currencyCode,
    showSymbol: true,
    minFractionDigits: 0,
    maxFractionDigits: 0,
  });
  const upcomingBillTotalPrecise = formatAmount(upcomingBill.total.amount, {
    currency: upcomingBill.currencyCode,
    showSymbol: true,
  });
  const hasManagedClientCharges = upcomingBill.lines.some(
    (line) =>
      line.category === 'managed_clients_subscriptions' ||
      line.category === 'managed_clients_usage',
  );
  const upcomingBillActions: UpcomingBillAction[] =
    upcomingBill.state === 'estimate'
      ? [
          {
            id: 'view-breakdown',
            label: 'View breakdown',
            variant: 'outline',
            onSelect: () => onSelectTab('billing'),
          },
          ...(hasManagedClientCharges
            ? [
                {
                  id: 'view-billed-clients',
                  label: 'View billed clients',
                  variant: 'outline' as const,
                  onSelect: () => onSelectTab('clients'),
                },
              ]
            : []),
        ]
      : [
          {
            id: 'pay-now',
            label: 'Pay now',
            variant: 'default',
            onSelect: () => onSelectTab('billing'),
          },
          {
            id: 'view-invoice',
            label: 'View invoice',
            variant: 'outline',
            onSelect: () => onSelectTab('billing'),
          },
          ...(hasManagedClientCharges
            ? [
                {
                  id: 'view-billed-clients',
                  label: 'View billed clients',
                  variant: 'outline' as const,
                  onSelect: () => onSelectTab('clients'),
                },
              ]
            : []),
        ];

  const payoutAvailable = upcomingPayout.available === true;
  const payoutLedger = upcomingPayout.available ? upcomingPayout.ledger : null;
  const payoutCurrency = upcomingPayout.available
    ? upcomingPayout.currencyCode
    : 'USD';
  const payoutEndingWhole = payoutLedger
    ? formatAmount(payoutLedger.endingBalance.amount, {
        currency: payoutCurrency,
        showSymbol: true,
        minFractionDigits: 0,
        maxFractionDigits: 0,
      })
    : '—';
  const payoutEndingPrecise = payoutLedger
    ? formatAmount(payoutLedger.endingBalance.amount, {
        currency: payoutCurrency,
        showSymbol: true,
      })
    : '—';
  const payoutFooterCopy = payoutLedger
    ? `Expect to receive ${payoutEndingPrecise} once payout is approved after period end.`
    : '';

  const walletCurrency = wallet.currencyCode;
  const walletAvailableLabel = formatAmount(wallet.available.amount, {
    currency: walletCurrency,
    showSymbol: true,
  });
  const walletResetLabel =
    safeFormatDate({
      date: wallet.buckets.monthly.resetsAt,
      formatString: 'MMM dd, yyyy',
    }) || 'N/A';
  const walletSubtitle = `Your monthly credits reset in ${walletResetLabel}. Monthly credits are used first, then credits closest to expiration.`;
  const walletAutoRechargeCopy = wallet.autoRecharge.enabled
    ? 'Auto-recharge is enabled.'
    : 'Auto-recharge is not enabled. Enable it to automatically top up credits when your balance is low.';
  const walletAutoRechargeAction = wallet.autoRecharge.enabled
    ? 'Manage'
    : 'Enable';

  const overviewCards: OverviewCard[] = [
    {
      id: 'next-charge',
      targetTab: 'billing',
      title: 'Next charge',
      icon: ArrowUpRight,
      stat: upcomingBillTotalLabel,
      caption: `Due on ${upcomingBillDateLabel}`,
    },
    ...(payoutAvailable
      ? ([
          {
            id: 'expected-payout',
            targetTab: 'payouts',
            title: 'Expected payout',
            icon: Wallet,
            stat: payoutEndingWhole,
            caption: 'Current period estimate',
          },
        ] as OverviewCard[])
      : []),
    {
      id: 'credits',
      targetTab: 'usage',
      title: 'Credits',
      icon: Database,
      stat: `${wallet.usageThisCycle.units}`,
      statSuffix: 'used',
      caption: `${wallet.buckets.monthly.includedAmount} included this cycle`,
    },
  ];

  const clientsSummarySentence = `${clientsSummary.totals.active} active clients, ${clientsSummary.totals.platformBilled} platform billed, ${clientsSummary.totals.firmBilled} firm billed.`;

  return (
    <div
      id={overviewPanelId}
      role="tabpanel"
      aria-labelledby={overviewTabId}
      className="flex flex-col gap-6 overflow-x-auto pb-2"
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-4">
        {overviewCards.map((card) => (
          <OverviewCardButton
            key={card.id}
            card={card}
            onSelect={onSelectTab}
          />
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-muted-foreground px-1 text-sm font-medium">
          Current plan
        </div>
        <div className="border-border/60 flex flex-col items-start justify-between gap-2 rounded-md border p-4 text-sm lg:flex-row lg:items-center">
          <div>
            <p className="flex flex-wrap items-center gap-1">
              <span className="font-medium">{planName}</span>
              <span className="text-muted-foreground">{planPriceLabel}</span>
            </p>
            <p className="text-muted-foreground">{planRenewalLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="xs" onClick={onManagePlan}>
              {planActionLabel}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 text-sm">
        <div className="border-border/60 flex flex-col gap-4 rounded-md border">
          <div className="border-border/60 flex flex-col items-start justify-between gap-2 border-b p-4 lg:flex-row lg:items-center">
            <div>
              <div>{upcomingBillCopy.title}</div>
              <div className="text-muted-foreground text-xs">
                {upcomingBillCopy.subtitle}
              </div>
            </div>
            <UpcomingBillActions actions={upcomingBillActions} />
          </div>
          <div className="flex flex-col gap-4 p-4 py-0 lg:flex-row lg:items-center lg:overflow-hidden">
            <PriceCard
              amount={upcomingBillTotalLabel}
              name={upcomingBillCopy.amountCardLabel}
              className="w-full max-w-52 shrink-0"
            />
            <div className="[&>*:nth-child(even)]:bg-muted/20 flex w-full flex-col text-sm *:flex *:h-8 *:items-center *:justify-between *:gap-2 *:rounded-md *:px-2 lg:flex-1">
              {upcomingBill.lines.map((line) => {
                const copy = getUpcomingBillCategoryCopy(line.category);
                return (
                  <div key={line.id}>
                    <div className="flex items-center">
                      <span className="text-muted-foreground">
                        {copy.label}
                      </span>
                      <TooltipHelper content={copy.tooltip} />
                    </div>
                    <div className="font-mono tabular-nums">
                      {formatAmount(line.amount, {
                        currency: upcomingBill.currencyCode,
                        showSymbol: true,
                      })}
                    </div>
                  </div>
                );
              })}
              <div className="bg-muted/30!">
                <span className="flex items-center gap-1">
                  <span className="font-medium">
                    {upcomingBillCopy.totalLabel}
                  </span>
                  <TooltipHelper content="This amount may change due to adjustments or prorations" />
                </span>
                <span className="font-mono font-medium tabular-nums">
                  {upcomingBillTotalPrecise}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-muted/20 border-border/60 flex flex-col items-start justify-between gap-2 rounded-b-md border-t px-4 py-3 lg:flex-row lg:items-center">
            <p className="text-muted-foreground text-xs">
              Need older invoices? View your recent billing history.
            </p>
            <Button
              variant="outline"
              size="xs"
              onClick={() => onSelectTab('billing')}
            >
              View recent invoices
              <ArrowUpRight className="size-3.5" aria-hidden />
            </Button>
          </div>
        </div>
      </div>

      {payoutAvailable && payoutLedger ? (
        <div className="flex flex-col gap-2 text-sm">
          <div className="border-border/60 flex flex-col gap-4 rounded-md border">
            <div className="border-border/60 flex flex-col items-start justify-between gap-2 border-b p-4 lg:flex-row lg:items-center">
              <div className="flex flex-col gap-1">
                <div>Upcoming payout</div>
                <div className="text-muted-foreground text-xs">
                  Current period payout summary
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="xs">
                  Download statement
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className="size-7">
                      <MoreHorizontal className="size-3.5" aria-hidden />
                      <span className="sr-only">More payout actions</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => onSelectTab('clients')}>
                      Manage clients
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onSelectTab('payouts')}>
                      Manage payout account
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div className="flex flex-col gap-4 px-4 pb-1">
              <div className="[&>*:nth-child(even)]:bg-muted/20 flex w-full flex-col text-sm *:flex *:h-8 *:items-center *:justify-between *:gap-2 *:rounded-md *:px-2">
                {PAYOUT_LEDGER_ORDER.map((slot) => {
                  const isEnding = slot === 'endingBalance';
                  const isOpening = slot === 'openingBalance';
                  const entry = payoutLedger[slot];
                  const labelClass = isEnding
                    ? 'font-medium'
                    : 'text-muted-foreground';
                  const amountClass = cn(
                    'font-mono tabular-nums',
                    isEnding ? 'font-medium' : 'text-muted-foreground',
                  );
                  const formattedAmount = formatAmount(entry.amount, {
                    currency: payoutCurrency,
                    showSymbol: true,
                  });
                  const amountLabel =
                    isEnding || isOpening
                      ? formattedAmount
                      : entry.amount > 0
                        ? `+${formattedAmount}`
                        : formattedAmount;

                  return (
                    <div
                      key={slot}
                      className={isEnding ? 'bg-muted/30!' : undefined}
                    >
                      <span className={labelClass}>
                        {getPayoutLedgerSlotLabel(slot)}
                      </span>
                      <span className={amountClass}>{amountLabel}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-muted/20 border-border/60 flex flex-col items-start justify-between gap-2 rounded-b-md border-t px-4 py-3 lg:flex-row lg:items-center">
              <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <span>{payoutFooterCopy}</span>
                <TooltipHelper content="Final payout amount may change" />
              </div>
              <Button
                variant="outline"
                size="xs"
                onClick={() => onSelectTab('billing')}
              >
                View payout history
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2 text-sm">
        <div className="border-border/60 flex flex-col gap-4 rounded-md border">
          <div className="border-border/60 flex flex-col items-start justify-between gap-2 border-b p-4 lg:flex-row lg:items-center">
            <div className="flex flex-col gap-1">
              <div className="font-medium">Credit balance</div>
              <div className="text-muted-foreground text-xs">
                {walletSubtitle}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="xs">
                Buy credits
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="size-7">
                    <MoreHorizontal className="size-3.5" aria-hidden />
                    <span className="sr-only">More credit actions</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => onSelectTab('usage')}>
                    View usage details
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onSelectTab('usage')}>
                    Manage usage limits
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="flex flex-col gap-4 p-4 py-0 lg:flex-row lg:items-center lg:overflow-hidden">
            <PriceCard
              amount={walletAvailableLabel}
              name="Available credits"
              className="w-full max-w-52 shrink-0"
            />

            <div className="[&>*:nth-child(even)]:bg-muted/20 flex w-full flex-col text-sm *:flex *:h-8 *:items-center *:justify-between *:gap-2 *:rounded-md *:px-2 lg:flex-1">
              <div>
                <div className="flex items-center">
                  <span className="text-muted-foreground">Gifted credits</span>
                  <TooltipHelper content="Credits granted to your workspace" />
                </div>
                <div className="font-mono tabular-nums">
                  {formatAmount(wallet.buckets.gifted.amount, {
                    currency: walletCurrency,
                    showSymbol: true,
                  })}
                </div>
              </div>
              <div>
                <div className="flex items-center">
                  <span className="text-muted-foreground">Monthly credits</span>
                  <TooltipHelper content="Credits included in your current plan" />
                </div>
                <div className="font-mono tabular-nums">
                  {formatAmount(wallet.buckets.monthly.amount, {
                    currency: walletCurrency,
                    showSymbol: true,
                  })}{' '}
                  /{' '}
                  {formatAmount(wallet.buckets.monthly.includedAmount, {
                    currency: walletCurrency,
                    showSymbol: true,
                  })}
                </div>
              </div>
              <div>
                <div className="flex items-center">
                  <span className="text-muted-foreground">
                    Purchased credits
                  </span>
                  <TooltipHelper content="Credits purchased separately from your plan" />
                </div>
                <div className="font-mono tabular-nums">
                  {formatAmount(wallet.buckets.purchased.amount, {
                    currency: walletCurrency,
                    showSymbol: true,
                  })}
                </div>
              </div>

              <div className="bg-muted/30!">
                <span className="font-medium">Total available credits</span>
                <span className="font-mono font-medium tabular-nums">
                  {walletAvailableLabel}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-muted/20 border-border/60 flex flex-col items-start justify-between gap-2 rounded-b-md border-t px-4 py-3 lg:flex-row lg:items-center">
            <div className="text-muted-foreground text-xs">
              {walletAutoRechargeCopy}
            </div>
            <Button size="xs">{walletAutoRechargeAction}</Button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-muted-foreground px-1 text-sm font-medium">
          Billing accounts
        </div>
        <div className="grid grid-cols-1 items-stretch gap-3 lg:grid-cols-2">
          {accounts.paymentMethod ? (
            <section className="border-border/60 flex h-full flex-col gap-3 rounded-md border p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded border">
                    <CreditCard className="size-4" aria-hidden />
                  </div>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <div className="text-muted-foreground text-xs">
                      Payment method
                    </div>
                    <div>
                      {`${getPaymentMethodBrandLabel(accounts.paymentMethod.brand)} (${formatAccountText(accounts.paymentMethod.last4, { onlyLast: true, maskChar: '•••• ' })})`}
                    </div>
                    <div className="text-muted-foreground truncate text-xs">
                      {PAYMENT_METHOD_CAPTION}
                    </div>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-7 shrink-0"
                  aria-label="Edit payment method"
                >
                  <Pencil className="size-3.5" aria-hidden />
                </Button>
              </div>
            </section>
          ) : null}

          {accounts.payoutAccount ? (
            <section className="border-border/60 flex h-full flex-col gap-3 rounded-md border p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded border">
                    <Wallet className="size-4" aria-hidden />
                  </div>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <div className="text-muted-foreground text-xs">
                      Payout account
                    </div>
                    <div>
                      {`${accounts.payoutAccount.bankName} (${formatAccountText(accounts.payoutAccount.last4, { onlyLast: true, maskChar: '•••• ' })})`}
                    </div>
                    <div className="text-muted-foreground truncate text-xs">
                      {PAYOUT_ACCOUNT_CAPTION}
                    </div>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-7 shrink-0"
                  aria-label="Edit payout account"
                >
                  <Pencil className="size-3.5" aria-hidden />
                </Button>
              </div>
            </section>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2 text-sm">
        <div className="border-border/60 flex flex-col items-start justify-between gap-3 rounded-md border p-4 lg:flex-row lg:items-center">
          <div className="flex flex-col gap-1">
            <div className="font-medium">Clients</div>
            <p className="text-muted-foreground text-xs">
              {clientsSummarySentence}
            </p>
          </div>
          <Button
            variant="outline"
            size="xs"
            onClick={() => onSelectTab('clients')}
          >
            View recent clients
            <ArrowUpRight className="size-3.5" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function SettingsBillingPage() {
  const { companyId, company, companyType, tenantRoutes, user } = useSession();
  const [activeTab, setActiveTab] = useState<BillingTab>('overview');
  const [isManagePlanOpen, setIsManagePlanOpen] = useState(false);
  const tabGroupId = useId();

  const billingView = getWorkspaceBillingView({
    companyType,
    currentCompany: user?.currentCompany,
    company,
    isPlatformUser: user?.isPlatformUser,
  });

  const overviewQuery = useBillingOverview({
    companyId,
    enabled: billingView !== 'hidden' && Boolean(companyId),
  });

  if (!companyId || !tenantRoutes) return null;

  if (billingView === 'hidden') {
    return <Navigate to={tenantRoutes.general.settings.hub()} replace />;
  }

  const selectTab = (tab: BillingTab) => setActiveTab(tab);

  const heroActions = [
    {
      id: 'upgrade',
      label: 'Upgrade',
      icon: ArrowUpRight,
      variant: 'default' as const,
      onSelect: () => setIsManagePlanOpen(true),
    },
    {
      id: 'buy-credits',
      label: 'Buy credits',
      icon: Database,
      variant: 'outline' as const,
      onSelect: () => selectTab('usage'),
    },
  ];

  const overviewTabId = `${tabGroupId}-overview-tab`;
  const overviewPanelId = `${tabGroupId}-overview-panel`;
  const detailPanelId = `${tabGroupId}-${activeTab}-panel`;

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-1 flex-col gap-4 overflow-y-auto pb-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-1">
        <div className="order-1 ml-auto flex items-center gap-2 md:order-2 md:shrink-0">
          {heroActions.map((action) => {
            const ActionIcon = action.icon;
            return (
              <Button
                key={action.id}
                type="button"
                variant={action.variant}
                size="sm"
                onClick={action.onSelect}
              >
                <ActionIcon className="size-4" aria-hidden />
                {action.label}
              </Button>
            );
          })}
        </div>

        <div className="order-2 w-full min-w-0 md:order-1 md:flex-1">
          <div
            className="flex flex-wrap items-center gap-2 border-b"
            role="tablist"
            aria-label="Billing sections"
          >
            {BILLING_TABS.map((tab) => (
              <button
                key={tab.id}
                id={`${tabGroupId}-${tab.id}-tab`}
                type="button"
                role="tab"
                tabIndex={activeTab === tab.id ? 0 : -1}
                aria-selected={activeTab === tab.id}
                aria-controls={`${tabGroupId}-${tab.id}-panel`}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'focus-visible:ring-ring cursor-pointer border-b-2 px-3 py-1 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none',
                  activeTab === tab.id
                    ? 'border-foreground text-foreground'
                    : 'text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground border-transparent',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {activeTab === 'overview' ? (
        overviewQuery.isPending ? (
          <BillingOverviewLoadingState
            overviewPanelId={overviewPanelId}
            overviewTabId={overviewTabId}
          />
        ) : overviewQuery.isError ? (
          <BillingOverviewErrorState
            overviewPanelId={overviewPanelId}
            overviewTabId={overviewTabId}
            onRetry={() => {
              void overviewQuery.refetch();
            }}
          />
        ) : overviewQuery.data ? (
          <BillingOverviewPanel
            overview={overviewQuery.data}
            overviewPanelId={overviewPanelId}
            overviewTabId={overviewTabId}
            onSelectTab={setActiveTab}
            onManagePlan={() => setIsManagePlanOpen(true)}
          />
        ) : (
          <BillingOverviewEmptyState
            overviewPanelId={overviewPanelId}
            overviewTabId={overviewTabId}
          />
        )
      ) : null}

      {activeTab !== 'overview' ? (
        <p
          id={detailPanelId}
          role="tabpanel"
          aria-labelledby={`${tabGroupId}-${activeTab}-tab`}
          className="text-muted-foreground text-sm"
        >
          {TAB_PANEL_COPY[activeTab]}
        </p>
      ) : null}

      <ManagePlanDialog
        open={isManagePlanOpen}
        onOpenChange={setIsManagePlanOpen}
      />
    </div>
  );
}

type PriceCardProps = {
  amount: string;
  name: string;
  className?: string;
};

export const PriceCard: React.FC<PriceCardProps> = ({
  amount,
  name,
  className,
}) => {
  return (
    <div
      className={cn(
        'group bg-primary dark:bg-popover relative flex aspect-[1.586/1] overflow-hidden rounded-xl p-4 will-change-transform',
        'transition-[transform,box-shadow] duration-600 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:scale-[1.004] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:hover:scale-100',
        'shadow-[0_10px_15px_-3px_rgba(16,24,48,0.28),0_4px_6px_-2px_rgba(16,24,48,0.2),inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-1px_0_rgba(9,14,32,0.35)] hover:shadow-[0_12px_18px_-4px_rgba(16,24,48,0.3),0_6px_8px_-4px_rgba(16,24,48,0.22),inset_0_1px_0_rgba(255,255,255,0.1),inset_0_-1px_0_rgba(9,14,32,0.38)]',
        'ring-1 ring-blue-950/20 dark:ring-blue-900/40',
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/20 opacity-45 transition-opacity duration-300 group-hover:opacity-65" />

      <div
        className="pointer-events-none absolute -top-16 left-20 h-60 w-36 opacity-30"
        style={{
          transform: 'rotate(-27.5deg)',
          background:
            'linear-gradient(253deg, rgba(176,197,255,0.16) 29%, rgba(255,255,255,0.04) 90%)',
        }}
      />

      <div
        className="pointer-events-none absolute inset-0 transform-[translateX(55%)_skewX(-15deg)] opacity-65 transition-[transform,opacity] duration-700 ease-out group-hover:transform-[translateX(62%)_skewX(-15deg)] group-hover:opacity-75 motion-reduce:transition-none"
        style={{
          width: '60%',
          background:
            'linear-gradient(90deg, transparent 0%, transparent 20%, rgba(123,156,255,0.12) 30%, rgba(123,156,255,0.22) 50%, rgba(123,156,255,0.12) 70%, transparent 80%)',
          filter: 'blur(2px)',
        }}
      />

      <div className="absolute top-6 right-3 rounded-[5px] bg-blue-950/90 p-px dark:bg-blue-900/90">
        <div className="relative h-[22px] w-7 overflow-hidden rounded-[4px] bg-linear-to-br from-blue-300 via-blue-500 to-blue-700 shadow-[0_0_5px_rgba(8,12,26,0.55),0_0_3px_rgba(196,215,255,0.35)] ring-1 ring-blue-950/25 dark:from-blue-700 dark:via-blue-900 dark:to-blue-600 dark:ring-blue-800/40">
          <div className="absolute inset-0 rounded-[4px] border border-white/30" />
          <div className="absolute inset-0 bg-linear-to-br from-white/20 to-transparent" />
        </div>
      </div>

      <div className="z-10 flex h-full flex-col justify-end">
        <div className="text-primary-foreground dark:text-popover-foreground pb-1 font-mono text-xl font-semibold tracking-tight tabular-nums [font-variant-numeric:slashed-zero]">
          {amount}
        </div>
        <div className="text-primary-foreground/85 dark:text-popover-foreground/85 truncate text-xs">
          {name}
        </div>
      </div>
    </div>
  );
};
