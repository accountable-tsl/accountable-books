import { billing } from '@accountable-books/contracts/schema';

export type BillingInterval = (typeof billing.BILLING_INTERVALS)[number];

export type Money = {
  amount: number;
  currencyCode: string;
};

export type PlanKey = 'firm_free' | 'firm_standard' | 'firm_custom';

export type PlanKind = (typeof billing.BILLING_PLAN_KINDS)[number];

export type PlanFeature =
  | { code: 'internal_workspace_limit'; meta: { count: number } }
  | {
      code: 'monthly_credit_allowance_units';
      meta: { units: number } | { mode: 'negotiated' };
    }
  | {
      code: 'support_tier';
      meta: { tier: 'standard' | 'enhanced' | 'priority' | 'custom' };
    }
  | {
      code: 'managed_client_pricing_tier';
      meta: { tier: 'standard' | 'discounted' | 'lowest' };
    }
  | { code: 'onboarding_support' };

export type PlanRecommendation = {
  rank: number;
  reason?: string;
};

export type BillingPlan = {
  key: PlanKey;
  kind: PlanKind;
  name: string;
  month: Money | null;
  year: Money | null;
  features: readonly PlanFeature[];
  monthlyCreditAllowance: Money | null;
  recommendation: PlanRecommendation | null;
};

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'none';

export type CurrentSubscription = {
  planKey: PlanKey;
  billingInterval: BillingInterval;
  status: SubscriptionStatus;
  currentPeriodEndAt: string | null;
};

export type BillingPlanResponse = {
  status: SubscriptionStatus;
  plan: {
    id: string;
    name: string;
    price: number;
    currencyCode: string;
    interval: BillingInterval;
  } | null;
  currentPeriodEndAt: string | null;
  cancelAtPeriodEnd: boolean;
  trialEndsAt: string | null;
};

export type UpcomingBillState =
  | 'estimate'
  | 'open_invoice'
  | 'past_due'
  | 'none';

export type BillingUpcomingBillCategory =
  | 'firm_subscription'
  | 'firm_overage_usage'
  | 'managed_clients_subscriptions'
  | 'managed_clients_usage'
  | 'credit_applied'
  | 'adjustment';

export type BillingUpcomingBillResponse = {
  state: UpcomingBillState;
  asOf: string;
  periodStartAt: string;
  periodEndAt: string;
  dueAt: string | null;
  invoice: { id: string; number: string; hostedUrl: string | null } | null;
  currencyCode: string;
  total: { amount: number };
  lines: Array<{
    id: string;
    category: BillingUpcomingBillCategory;
    amount: number;
    quantity: number | null;
    meta: Record<string, unknown> | null;
  }>;
};

export type BillingUpcomingPayoutResponse =
  | { available: false }
  | {
      available: true;
      currencyCode: string;
      period: {
        startAt: string;
        endAt: string;
        status: 'open' | 'pending_approval' | 'paid' | 'closed';
      };
      asOf: string;
      ledger: {
        openingBalance: { amount: number };
        clientCollections: { amount: number; clientCount: number };
        platformFee: { amount: number; ratePercent: number | null };
        paidOut: { amount: number };
        adjustments: { amount: number; entryCount: number };
        endingBalance: { amount: number };
      };
      payoutAccount: {
        id: string;
        displayName: string;
        last4: string;
      } | null;
      estimateConfidence: 'estimated' | 'finalized';
    };

export type BillingUpcomingPayoutLedger = Extract<
  BillingUpcomingPayoutResponse,
  { available: true }
>['ledger'];

export type BillingUpcomingPayoutLedgerSlot = keyof BillingUpcomingPayoutLedger;

export type BillingWalletResponse = {
  currencyCode: string;
  available: { amount: number };
  buckets: {
    gifted: { amount: number; expiresAt: string | null };
    monthly: { amount: number; includedAmount: number; resetsAt: string };
    purchased: { amount: number };
  };
  autoRecharge: {
    enabled: boolean;
    threshold: { amount: number } | null;
    topupAmount: { amount: number } | null;
  };
  usageThisCycle: { units: number };
};

export type PaymentMethodBrand =
  | 'visa'
  | 'mastercard'
  | 'amex'
  | 'discover'
  | 'diners'
  | 'jcb'
  | 'unionpay'
  | 'other';

export type BillingAccountsResponse = {
  paymentMethod: {
    id: string;
    brand: PaymentMethodBrand;
    last4: string;
    expMonth: number;
    expYear: number;
    isDefault: boolean;
  } | null;
  payoutAccount: {
    id: string;
    bankName: string;
    last4: string;
    accountKind: 'checking' | 'savings';
  } | null;
};

export type FirmClientsBillingSummaryResponse = {
  totals: {
    active: number;
    firmBilled: number;
    platformBilled: number;
  };
};

export type BillingOverviewResponse = {
  plan: BillingPlanResponse;
  upcomingBill: BillingUpcomingBillResponse;
  upcomingPayout: BillingUpcomingPayoutResponse;
  wallet: BillingWalletResponse;
  accounts: BillingAccountsResponse;
  clientsSummary: FirmClientsBillingSummaryResponse;
};

export type BillingPlanManagementSnapshot = {
  current: CurrentSubscription;
  availablePlans: readonly BillingPlan[];
  permissions: {
    canManagePlan: boolean;
    canCancel: boolean;
    canDowngradeToFree: boolean;
  };
  contactSalesHref: string | null;
};

export type ChangeBillingPlanRequest = {
  companyId: string;
  targetPlanKey: PlanKey;
  targetBillingInterval: BillingInterval;
};

export type ChangeBillingPlanResponse = {
  current: CurrentSubscription;
  effectiveAt: string;
};

export type CreateBillingPlanCheckoutSessionRequest = {
  companyId: string;
  targetPlanKey: PlanKey;
  targetBillingInterval: BillingInterval;
};

export type CreateBillingPlanCheckoutSessionResponse = {
  sessionId: string;
  checkoutUrl: string;
};
