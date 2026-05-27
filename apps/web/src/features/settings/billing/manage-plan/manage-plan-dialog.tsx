import type {
  BillingInterval,
  BillingPlan,
  PlanFeature,
  PlanKey,
  PlanRecommendation,
} from '@/modules/company/billing';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  useBillingPlanManagementSnapshot,
  useChangeBillingPlan,
  useCreateBillingPlanCheckoutSession,
} from '@/modules/company/billing';
import { useMediaQuery } from '@/shared/hooks/use-media-query';
import { formatAmount } from '@/shared/utils/formatting-utils';
import { useSession } from '@session';
import { AlertTriangle, Check } from 'lucide-react';
import { toast } from 'sonner';

function getPlanByKey(
  plans: readonly BillingPlan[],
  planKey: PlanKey,
): BillingPlan {
  const plan = plans.find((item) => item.key === planKey);

  if (!plan) {
    throw new Error(`Unknown plan key: ${planKey}`);
  }

  return plan;
}

function findRecommendedPlan(
  plans: readonly BillingPlan[],
): BillingPlan | null {
  return (
    plans
      .filter(
        (plan): plan is BillingPlan & { recommendation: PlanRecommendation } =>
          Boolean(plan.recommendation),
      )
      .sort((a, b) => a.recommendation.rank - b.recommendation.rank)[0] ?? null
  );
}

function formatMoney(
  amount: number,
  currencyCode: string,
  minFractionDigits = 0,
  maxFractionDigits = 0,
) {
  return formatAmount(amount, {
    currency: currencyCode,
    showSymbol: true,
    minFractionDigits,
    maxFractionDigits,
  });
}

function getRecurringPrice(
  plan: BillingPlan,
  billingInterval: BillingInterval,
) {
  return billingInterval === 'month' ? plan.month : plan.year;
}

/**
 * Whole month-equivalents become "N months free"; otherwise "Save X%".
 */
function formatAnnualSavingsLabel(
  monthlyAmount: number,
  annualAmount: number,
): string | null {
  if (monthlyAmount <= 0) return null;

  const listAnnualAmount = monthlyAmount * 12;

  if (annualAmount >= listAnnualAmount - 1e-9) return null;

  const savingsAmount = listAnnualAmount - annualAmount;

  if (savingsAmount <= 0) return null;

  const monthlyCents = Math.round(monthlyAmount * 100);
  const savingsCents = Math.round(savingsAmount * 100);
  const listAnnualCents = Math.round(listAnnualAmount * 100);

  if (monthlyCents > 0 && savingsCents % monthlyCents === 0) {
    const monthsFree = savingsCents / monthlyCents;

    if (monthsFree >= 1) {
      return monthsFree === 1 ? '1 month free' : `${monthsFree} months free`;
    }
  }

  const savingsPercent =
    listAnnualCents > 0
      ? Math.round((savingsCents / listAnnualCents) * 100)
      : 0;

  return savingsPercent > 0 ? `Save ${savingsPercent}%` : null;
}

function getAnnualStrikeoutLabel(
  plan: BillingPlan,
  billingInterval: BillingInterval,
): string | null {
  if (
    billingInterval !== 'year' ||
    !plan.month ||
    !plan.year ||
    plan.month.amount <= 0 ||
    plan.year.amount >= plan.month.amount * 12
  ) {
    return null;
  }

  return `${formatMoney(plan.month.amount * 12, plan.month.currencyCode)}/yr`;
}

function formatFeature(feature: PlanFeature): string {
  switch (feature.code) {
    case 'internal_workspace_limit':
      return feature.meta.count === 1
        ? '1 internal workspace'
        : `${feature.meta.count} internal workspaces`;

    case 'monthly_credit_allowance_units':
      if ('mode' in feature.meta) {
        return 'Negotiated credit package';
      }
      return `${formatMoney(feature.meta.units, 'USD')} credits/mo`;

    case 'support_tier':
      if (feature.meta.tier === 'priority') return 'Priority support';
      if (feature.meta.tier === 'enhanced') return 'Enhanced support';
      if (feature.meta.tier === 'custom') return 'Custom support';
      return 'Standard support';

    case 'managed_client_pricing_tier':
      if (feature.meta.tier === 'standard')
        return 'Standard managed client pricing';
      if (feature.meta.tier === 'discounted')
        return 'Discounted managed client pricing';
      return 'Lowest managed pricing';

    case 'onboarding_support':
      return 'Onboarding support';
  }
}

function BillingIntervalToggle({
  billingInterval,
  annualSavingsLabel,
  onBillingIntervalChange,
}: {
  billingInterval: BillingInterval;
  annualSavingsLabel: string | null;
  onBillingIntervalChange: (billingInterval: BillingInterval) => void;
}) {
  return (
    <div className="flex justify-center">
      <div
        className="bg-muted/50 inline-flex rounded-full border p-1"
        role="group"
        aria-label="Billing interval"
      >
        <button
          type="button"
          onClick={() => onBillingIntervalChange('month')}
          className={cn(
            'rounded-full px-3.5 py-1.5 text-sm font-medium',
            billingInterval === 'month'
              ? 'bg-background ring-border/50 shadow-sm ring-1'
              : 'text-muted-foreground',
          )}
        >
          Monthly
        </button>

        <button
          type="button"
          onClick={() => onBillingIntervalChange('year')}
          className={cn(
            'flex items-center gap-1 rounded-full px-3.5 py-1.5 text-sm font-medium',
            billingInterval === 'year'
              ? 'bg-background ring-border/50 shadow-sm ring-1'
              : 'text-muted-foreground',
          )}
        >
          Annual
          {annualSavingsLabel ? (
            <span className="rounded-full bg-emerald-100 px-1 py-0.5 text-[10px] leading-tight font-medium text-emerald-900 normal-case dark:bg-emerald-900/40 dark:text-emerald-200">
              {annualSavingsLabel}
            </span>
          ) : null}
        </button>
      </div>
    </div>
  );
}

function PlanBadges({
  plan,
  isCurrent,
}: {
  plan: BillingPlan;
  isCurrent: boolean;
}) {
  if (!plan.recommendation && !isCurrent) {
    return null;
  }

  return (
    <div className="flex flex-1 flex-col items-end gap-1.5 overflow-hidden">
      {plan.recommendation ? (
        <span
          className="bg-primary text-primary-foreground truncate rounded-full px-2 py-0.5 text-[10px] font-medium uppercase"
          title={plan.recommendation.reason}
        >
          {plan.recommendation.reason ?? 'Recommended'}
        </span>
      ) : null}

      {isCurrent ? (
        <span
          className="bg-muted text-muted-foreground truncate rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase"
          title="Current plan"
        >
          Current
        </span>
      ) : null}
    </div>
  );
}

function PlanPrice({
  plan,
  billingInterval,
}: {
  plan: BillingPlan;
  billingInterval: BillingInterval;
}) {
  const price = getRecurringPrice(plan, billingInterval);
  const annualStrikeoutLabel = getAnnualStrikeoutLabel(plan, billingInterval);

  return (
    <div className="">
      <div className="flex items-baseline gap-1">
        {!price ? (
          <span className="text-xl font-semibold">Let&apos;s talk</span>
        ) : (
          <>
            <span className="text-xl font-semibold tabular-nums">
              {formatMoney(price.amount, price.currencyCode)}
            </span>
            <span className="text-muted-foreground text-sm">
              /{billingInterval === 'month' ? 'mo' : 'yr'}
            </span>
          </>
        )}
      </div>

      {annualStrikeoutLabel ? (
        <div className="text-muted-foreground text-xs tabular-nums">
          <span className="line-through opacity-80">
            {annualStrikeoutLabel}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function PlanCard({
  plan,
  isCurrent,
  selected,
  billingInterval,
  onSelect,
}: {
  plan: BillingPlan;
  isCurrent: boolean;
  selected: boolean;
  billingInterval: BillingInterval;
  onSelect: (planKey: PlanKey) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(plan.key)}
      className={cn(
        'bg-background hover:border-primary/40 focus-visible:ring-ring flex h-full min-h-0 w-full flex-col overflow-hidden rounded-xl border p-5 text-left outline-none focus-visible:ring-2',
        selected && 'border-primary ring-primary bg-primary/5 ring-2',
      )}
    >
      <div className="flex flex-1 flex-col gap-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-[1.5] shrink-0 flex-col gap-1">
            <span className="text-foreground block text-sm leading-snug font-semibold">
              {plan.name}
            </span>

            <PlanPrice plan={plan} billingInterval={billingInterval} />
          </div>

          <PlanBadges plan={plan} isCurrent={isCurrent} />
        </div>

        <ul className="text-muted-foreground mt-auto flex flex-1 flex-col gap-2 border-t pt-4 text-sm leading-snug">
          {plan.features.map((feature) => (
            <li key={feature.code} className="flex gap-2.5">
              <Check className="text-primary mt-0.5 size-3.5 shrink-0" />
              {formatFeature(feature)}
            </li>
          ))}
        </ul>
      </div>
    </button>
  );
}

function PickPlanStep({
  plans,
  currentPlanKey,
  selectedPlanKey,
  billingInterval,
  annualSavingsLabel,
  onSelectPlan,
  onBillingIntervalChange,
}: {
  plans: readonly BillingPlan[];
  currentPlanKey: PlanKey;
  selectedPlanKey: PlanKey;
  billingInterval: BillingInterval;
  annualSavingsLabel: string | null;
  onSelectPlan: (planKey: PlanKey) => void;
  onBillingIntervalChange: (billingInterval: BillingInterval) => void;
}) {
  return (
    <div className="space-y-5 pb-2">
      <BillingIntervalToggle
        billingInterval={billingInterval}
        annualSavingsLabel={annualSavingsLabel}
        onBillingIntervalChange={onBillingIntervalChange}
      />

      <div className="grid grid-cols-1 items-stretch gap-3 lg:grid-cols-3 lg:gap-4">
        {plans.map((plan) => (
          <PlanCard
            key={plan.key}
            plan={plan}
            isCurrent={plan.key === currentPlanKey}
            selected={selectedPlanKey === plan.key}
            billingInterval={billingInterval}
            onSelect={onSelectPlan}
          />
        ))}
      </div>
    </div>
  );
}

function ManagePlanHeader({ isDesktopLayout }: { isDesktopLayout: boolean }) {
  const title = 'Manage plan';
  const subtitle = "Choose the right plan for your firm's growth.";

  return (
    <div className="min-w-0 space-y-2">
      {isDesktopLayout ? (
        <>
          <DialogTitle className="text-base leading-snug font-semibold">
            {title}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm leading-snug">
            {subtitle}
          </DialogDescription>
        </>
      ) : (
        <>
          <SheetTitle className="text-base leading-snug font-semibold">
            {title}
          </SheetTitle>
          <SheetDescription className="text-muted-foreground text-sm leading-snug">
            {subtitle}
          </SheetDescription>
        </>
      )}
    </div>
  );
}

function ManagePlanFooter({
  primaryActionLabel,
  primaryActionVariant,
  isPrimaryActionDisabled,
  isPrimaryActionPending,
  onCancel,
  onPrimaryAction,
}: {
  primaryActionLabel: string;
  primaryActionVariant: 'default' | 'destructive';
  isPrimaryActionDisabled: boolean;
  isPrimaryActionPending: boolean;
  onCancel: () => void;
  onPrimaryAction: () => void;
}) {
  return (
    <>
      <Button type="button" variant="outline" onClick={onCancel}>
        Cancel
      </Button>

      <Button
        type="button"
        variant={primaryActionVariant}
        disabled={isPrimaryActionDisabled || isPrimaryActionPending}
        onClick={onPrimaryAction}
      >
        {primaryActionLabel}
      </Button>
    </>
  );
}

function ManagePlanLoadingState() {
  return (
    <div className="space-y-5 pb-2">
      <div className="flex justify-center">
        <Skeleton className="h-11 w-72 rounded-full" />
      </div>

      <div className="grid grid-cols-1 items-stretch gap-3 lg:grid-cols-3 lg:gap-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="bg-background flex h-full min-h-0 w-full flex-col gap-4 rounded-xl border p-5"
          >
            <div className="space-y-3">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-8 w-28" />
              <Skeleton className="h-4 w-20" />
            </div>

            <div className="space-y-2 border-t pt-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-11/12" />
              <Skeleton className="h-4 w-10/12" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ManagePlanErrorState({
  title,
  description,
  onRetry,
}: {
  title: string;
  description: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center">
      <AlertTriangle className="text-muted-foreground size-5" aria-hidden />
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

export function ManagePlanDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { companyId } = useSession();
  const isDesktopLayout = useMediaQuery('(min-width: 1024px)');
  const snapshotQuery = useBillingPlanManagementSnapshot({
    companyId,
    enabled: open,
  });
  const changePlanMutation = useChangeBillingPlan();
  const createCheckoutSessionMutation = useCreateBillingPlanCheckoutSession();
  const snapshot = snapshotQuery.data;

  const [billingInterval, setBillingInterval] =
    useState<BillingInterval | null>(null);
  const [selectedPlanKey, setSelectedPlanKey] = useState<PlanKey | null>(null);

  const resetState = () => {
    setBillingInterval(null);
    setSelectedPlanKey(null);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetState();
    }

    onOpenChange(nextOpen);
  };

  useEffect(() => {
    if (!open || !snapshot) return;

    setBillingInterval(snapshot.current.billingInterval);
    setSelectedPlanKey(snapshot.current.planKey);
  }, [open, snapshot]);

  const current = snapshot?.current ?? null;
  const availablePlans = useMemo(
    () => snapshot?.availablePlans ?? [],
    [snapshot?.availablePlans],
  );
  const contactSalesHref = snapshot?.contactSalesHref ?? null;
  const resolvedBillingInterval =
    billingInterval ?? current?.billingInterval ?? null;
  const resolvedSelectedPlanKey = selectedPlanKey ?? current?.planKey ?? null;
  const currentPlan = current
    ? getPlanByKey(availablePlans, current.planKey)
    : null;
  const selectedPlan =
    availablePlans.length > 0 && resolvedSelectedPlanKey
      ? getPlanByKey(availablePlans, resolvedSelectedPlanKey)
      : null;
  const recommendedPlan = useMemo(
    () => findRecommendedPlan(availablePlans),
    [availablePlans],
  );

  const isCurrentSelection =
    current != null &&
    selectedPlan != null &&
    resolvedSelectedPlanKey === current.planKey &&
    resolvedBillingInterval === current.billingInterval;

  const isCustomContact = selectedPlan?.kind === 'custom_contact';
  const isFreeToPaidUpgrade =
    currentPlan?.kind === 'free' && selectedPlan?.kind === 'paid';
  const isPaidToFreeDowngrade =
    currentPlan?.kind === 'paid' && selectedPlan?.kind === 'free';
  const isIntervalOnlyChange =
    selectedPlan != null &&
    currentPlan != null &&
    selectedPlan.key === currentPlan.key &&
    !isCurrentSelection;

  const annualSavingsLabel =
    recommendedPlan && recommendedPlan.month && recommendedPlan.year
      ? formatAnnualSavingsLabel(
          recommendedPlan.month.amount,
          recommendedPlan.year.amount,
        )
      : null;

  const primaryActionLabel = (() => {
    if (isCustomContact) return 'Contact us';
    if (isCurrentSelection) return 'Current plan';
    if (isFreeToPaidUpgrade) return 'Continue to checkout';
    if (isPaidToFreeDowngrade) return 'Confirm downgrade';
    if (isIntervalOnlyChange) {
      return resolvedBillingInterval === 'year'
        ? 'Switch to annual'
        : 'Switch to monthly';
    }
    return selectedPlan ? `Switch to ${selectedPlan.name}` : 'Switch plan';
  })();

  const primaryActionVariant: 'default' | 'destructive' = isPaidToFreeDowngrade
    ? 'destructive'
    : 'default';

  const isPrimaryActionDisabled =
    !snapshot || !selectedPlan || !currentPlan || isCurrentSelection;

  const isPrimaryActionPending =
    changePlanMutation.isPending || createCheckoutSessionMutation.isPending;

  const mutationError =
    changePlanMutation.error ?? createCheckoutSessionMutation.error;

  const handlePrimaryAction = async () => {
    if (isCustomContact) {
      if (contactSalesHref) {
        window.open(contactSalesHref);
      }
      return;
    }

    if (
      isPrimaryActionDisabled ||
      !companyId ||
      !selectedPlan ||
      !currentPlan ||
      !current
    ) {
      return;
    }

    if (isFreeToPaidUpgrade) {
      const checkoutSession = await createCheckoutSessionMutation.mutateAsync({
        companyId,
        targetPlanKey: selectedPlan.key,
        targetBillingInterval: resolvedBillingInterval!,
      });

      toast.success(
        'Mock checkout session created. Replace the mock API with the backend checkout endpoint when ready.',
      );

      if (
        checkoutSession.checkoutUrl.startsWith('http://') ||
        checkoutSession.checkoutUrl.startsWith('https://') ||
        checkoutSession.checkoutUrl.startsWith('/')
      ) {
        window.location.assign(checkoutSession.checkoutUrl);
      }

      handleOpenChange(false);
      return;
    }

    await changePlanMutation.mutateAsync({
      companyId,
      targetPlanKey: selectedPlan.key,
      targetBillingInterval: resolvedBillingInterval!,
    });
    toast.success(
      'Mock plan change completed. The billing overview will reflect changes when the backend is connected.',
    );
    handleOpenChange(false);
  };

  const showSnapshotLoading = open && snapshotQuery.isPending && !snapshot;
  const showSnapshotError = open && snapshotQuery.isError && !snapshot;

  const content = showSnapshotLoading ? (
    <ManagePlanLoadingState />
  ) : showSnapshotError ? (
    <ManagePlanErrorState
      title="Could not load plan details"
      description="We couldn't load the latest billing plan options. Try again."
      onRetry={() => {
        void snapshotQuery.refetch();
      }}
    />
  ) : !snapshot || !current || !currentPlan || !selectedPlan ? (
    <ManagePlanErrorState
      title="Billing plan data is unavailable"
      description="This dialog needs the current billing snapshot before you can continue."
      onRetry={() => {
        void snapshotQuery.refetch();
      }}
    />
  ) : (
    <PickPlanStep
      plans={availablePlans}
      currentPlanKey={current.planKey}
      selectedPlanKey={resolvedSelectedPlanKey!}
      billingInterval={resolvedBillingInterval!}
      annualSavingsLabel={annualSavingsLabel}
      onSelectPlan={setSelectedPlanKey}
      onBillingIntervalChange={setBillingInterval}
    />
  );

  const footer = (
    <ManagePlanFooter
      primaryActionLabel={primaryActionLabel}
      primaryActionVariant={primaryActionVariant}
      isPrimaryActionDisabled={isPrimaryActionDisabled || showSnapshotLoading}
      isPrimaryActionPending={isPrimaryActionPending}
      onCancel={() => handleOpenChange(false)}
      onPrimaryAction={() => {
        void handlePrimaryAction();
      }}
    />
  );

  const header = <ManagePlanHeader isDesktopLayout={isDesktopLayout} />;

  const body = (
    <>
      <div
        className={cn(
          'flex-1 space-y-3 px-6 pt-3 pb-5 sm:px-8',
          !isDesktopLayout && 'pb-4',
        )}
      >
        {content}

        {mutationError ? (
          <div className="border-destructive/30 bg-destructive/5 rounded-lg border px-4 py-3 text-sm">
            <p className="font-medium">
              We could not complete this plan action.
            </p>
            <p className="text-muted-foreground mt-1">
              {mutationError instanceof Error
                ? mutationError.message
                : 'Please try again.'}
            </p>
          </div>
        ) : null}
      </div>

      {isDesktopLayout ? (
        <DialogFooter className="border-border shrink-0 gap-2 border-t px-6 py-4 sm:px-8">
          {footer}
        </DialogFooter>
      ) : (
        <SheetFooter className="border-border mt-0 shrink-0 flex-col-reverse gap-2 border-t px-6 py-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-8 [&_button]:w-full">
          {footer}
        </SheetFooter>
      )}
    </>
  );

  if (isDesktopLayout) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="flex max-h-[90dvh] min-h-125 flex-col gap-0 overflow-y-auto p-0 sm:max-w-4xl">
          <DialogHeader className="border-border shrink-0 border-b px-6 pt-5 pr-14 pb-4 sm:px-8 sm:pt-6 sm:pr-16 sm:pb-5">
            {header}
          </DialogHeader>

          {body}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        className="flex max-h-[90dvh] flex-col gap-0 overflow-y-auto rounded-t-2xl border-t p-0 shadow-lg"
      >
        <div className="flex shrink-0 justify-center pt-2 pb-1" aria-hidden>
          <div className="bg-muted-foreground/25 h-1 w-10 rounded-full" />
        </div>

        <SheetHeader className="border-border shrink-0 border-b px-6 pt-4 pr-14 pb-4 text-left sm:px-8 sm:pt-5 sm:pr-16 sm:pb-5">
          {header}
        </SheetHeader>

        {body}
      </SheetContent>
    </Sheet>
  );
}
