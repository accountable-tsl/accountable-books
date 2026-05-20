import type {
  BillingOverviewResponse,
  BillingPlan,
  BillingPlanManagementSnapshot,
  BillingPlanResponse,
  ChangeBillingPlanRequest,
  ChangeBillingPlanResponse,
  CreateBillingPlanCheckoutSessionRequest,
  CreateBillingPlanCheckoutSessionResponse,
  CurrentSubscription,
} from '../model/types';

const MOCK_CONTACT_SALES_HREF =
  'mailto:sales@getaccountable.com?subject=Firm%20Custom%20Plan';

const MOCK_AVAILABLE_PLANS: readonly BillingPlan[] = [
  {
    key: 'firm_free',
    kind: 'free',
    name: 'Firm Free',
    month: { amount: 0, currencyCode: 'USD' },
    year: { amount: 0, currencyCode: 'USD' },
    features: [
      { code: 'internal_workspace_limit', meta: { count: 1 } },
      { code: 'monthly_credit_allowance_units', meta: { units: 5 } },
      { code: 'support_tier', meta: { tier: 'standard' } },
    ],
    monthlyCreditAllowance: { amount: 5, currencyCode: 'USD' },
    recommendation: null,
  },
  {
    key: 'firm_standard',
    kind: 'paid',
    name: 'Firm Standard',
    month: { amount: 149, currencyCode: 'USD' },
    year: { amount: 1490, currencyCode: 'USD' },
    features: [
      { code: 'internal_workspace_limit', meta: { count: 1 } },
      { code: 'monthly_credit_allowance_units', meta: { units: 20 } },
      { code: 'managed_client_pricing_tier', meta: { tier: 'discounted' } },
    ],
    monthlyCreditAllowance: { amount: 20, currencyCode: 'USD' },
    recommendation: { rank: 1, reason: 'Popular' },
  },
  {
    key: 'firm_custom',
    kind: 'custom_contact',
    name: 'Firm Custom',
    month: null,
    year: null,
    features: [
      { code: 'managed_client_pricing_tier', meta: { tier: 'lowest' } },
      { code: 'monthly_credit_allowance_units', meta: { mode: 'negotiated' } },
      { code: 'onboarding_support' },
    ],
    monthlyCreditAllowance: null,
    recommendation: null,
  },
];

const MOCK_CURRENT_SUBSCRIPTION: CurrentSubscription = {
  planKey: 'firm_standard',
  billingInterval: 'month',
  status: 'active',
  currentPeriodEndAt: '2026-06-01T00:00:00.000Z',
};

function getMockPlanByKey(planKey: CurrentSubscription['planKey']) {
  const plan = MOCK_AVAILABLE_PLANS.find((item) => item.key === planKey);

  if (!plan) {
    throw new Error(`Unknown mock billing plan key: ${planKey}`);
  }

  return plan;
}

function getMockRecurringPrice(
  plan: BillingPlan,
  billingInterval: CurrentSubscription['billingInterval'],
) {
  return billingInterval === 'year' ? plan.year : plan.month;
}

function buildMockPlanSummary(): BillingPlanResponse {
  const currentPlan = getMockPlanByKey(MOCK_CURRENT_SUBSCRIPTION.planKey);
  const currentPrice = getMockRecurringPrice(
    currentPlan,
    MOCK_CURRENT_SUBSCRIPTION.billingInterval,
  );

  return {
    status: MOCK_CURRENT_SUBSCRIPTION.status,
    plan: currentPrice
      ? {
          id: `plan_${currentPlan.key}`,
          name: currentPlan.name,
          price: currentPrice.amount,
          currencyCode: currentPrice.currencyCode,
          interval: MOCK_CURRENT_SUBSCRIPTION.billingInterval,
        }
      : null,
    currentPeriodEndAt: MOCK_CURRENT_SUBSCRIPTION.currentPeriodEndAt,
    cancelAtPeriodEnd: false,
    trialEndsAt: null,
  };
}

function buildMockPlanManagementSnapshot(): BillingPlanManagementSnapshot {
  return {
    current: MOCK_CURRENT_SUBSCRIPTION,
    availablePlans: MOCK_AVAILABLE_PLANS,
    permissions: {
      canManagePlan: true,
      canCancel: true,
      canDowngradeToFree: true,
    },
    contactSalesHref: MOCK_CONTACT_SALES_HREF,
  };
}

function buildMockBillingOverview(): BillingOverviewResponse {
  const plan = buildMockPlanSummary();
  const planAmount = plan.plan?.price ?? 0;
  const managedWorkspaceCharges = 65;
  const adjustmentAmount = 0;

  return {
    plan,
    upcomingBill: {
      state: 'open_invoice',
      asOf: '2026-04-15T00:00:00.000Z',
      periodStartAt: '2026-04-01T00:00:00.000Z',
      periodEndAt: '2026-05-01T00:00:00.000Z',
      dueAt: '2026-06-01T00:00:00.000Z',
      invoice: {
        id: 'inv_2026_06_001',
        number: 'INV-2026-06-001',
        hostedUrl: null,
      },
      currencyCode: plan.plan?.currencyCode ?? 'USD',
      total: {
        amount: planAmount + managedWorkspaceCharges + adjustmentAmount,
      },
      lines: [
        {
          id: 'l_firm_sub',
          category: 'firm_subscription',
          amount: planAmount,
          quantity: 1,
          meta: null,
        },
        {
          id: 'l_managed_subs',
          category: 'managed_clients_subscriptions',
          amount: managedWorkspaceCharges,
          quantity: null,
          meta: { clientCount: 7 },
        },
        {
          id: 'l_adj',
          category: 'adjustment',
          amount: adjustmentAmount,
          quantity: null,
          meta: null,
        },
      ],
    },
    upcomingPayout: {
      available: true,
      currencyCode: 'USD',
      period: {
        startAt: '2026-04-01T00:00:00.000Z',
        endAt: '2026-05-01T00:00:00.000Z',
        status: 'open',
      },
      asOf: '2026-04-15T00:00:00.000Z',
      ledger: {
        openingBalance: { amount: 120 },
        clientCollections: { amount: 980, clientCount: 7 },
        platformFee: { amount: -147, ratePercent: 15 },
        paidOut: { amount: -500 },
        adjustments: { amount: 12, entryCount: 1 },
        endingBalance: { amount: 465 },
      },
      payoutAccount: {
        id: 'pa_first_bank',
        displayName: 'First Bank',
        last4: '1234',
      },
      estimateConfidence: 'estimated',
    },
    wallet: {
      currencyCode: 'USD',
      available: { amount: 2.35 },
      buckets: {
        gifted: { amount: 2, expiresAt: null },
        monthly: {
          amount: 0,
          includedAmount: 20,
          resetsAt: '2026-06-01T00:00:00.000Z',
        },
        purchased: { amount: 0.35 },
      },
      autoRecharge: {
        enabled: false,
        threshold: null,
        topupAmount: null,
      },
      usageThisCycle: { units: 3 },
    },
    accounts: {
      paymentMethod: {
        id: 'pm_001',
        brand: 'mastercard',
        last4: '9909',
        expMonth: 10,
        expYear: 2028,
        isDefault: true,
      },
      payoutAccount: {
        id: 'pa_first_bank',
        bankName: 'First Bank',
        last4: '1234',
        accountKind: 'checking',
      },
    },
    clientsSummary: {
      totals: { active: 12, firmBilled: 7, platformBilled: 5 },
    },
  };
}

export function billingOverviewQueryKey(companyId?: string | null) {
  return ['billingOverview', companyId ?? 'unknown-company'] as const;
}

export async function fetchBillingOverview(args: {
  companyId: string;
}): Promise<BillingOverviewResponse> {
  if (!args.companyId) {
    throw new Error('companyId is required to fetch billing overview');
  }

  // const response = await api.get<BillingOverviewResponse>(
  //   `/api/companies/${args.companyId}/billing/overview`,
  // );
  // return response.data;

  return Promise.resolve(buildMockBillingOverview());
}

export function billingPlanManagementSnapshotQueryKey(
  companyId?: string | null,
) {
  return [
    'billingPlanManagementSnapshot',
    companyId ?? 'unknown-company',
  ] as const;
}

export async function fetchBillingPlanManagementSnapshot(args: {
  companyId: string;
}): Promise<BillingPlanManagementSnapshot> {
  if (!args.companyId) {
    throw new Error(
      'companyId is required to fetch the billing plan management snapshot',
    );
  }

  // const response = await api.get<BillingPlanManagementSnapshot>(
  //   `/api/companies/${args.companyId}/billing/plan-management/snapshot`,
  // );
  // return response.data;

  return Promise.resolve(buildMockPlanManagementSnapshot());
}

export async function changeBillingPlan(
  input: ChangeBillingPlanRequest,
): Promise<ChangeBillingPlanResponse> {
  // const response = await api.post<ChangeBillingPlanResponse>(
  //   `/api/companies/${input.companyId}/billing/plan-management/change`,
  //   {
  //     targetPlanKey: input.targetPlanKey,
  //     targetBillingInterval: input.targetBillingInterval,
  //   },
  // );
  // return response.data;

  const isDowngradeToFree = input.targetPlanKey === 'firm_free';

  return Promise.resolve({
    current: {
      planKey: input.targetPlanKey,
      billingInterval: input.targetBillingInterval,
      status: 'active',
      currentPeriodEndAt: isDowngradeToFree
        ? MOCK_CURRENT_SUBSCRIPTION.currentPeriodEndAt
        : '2026-07-01T00:00:00.000Z',
    },
    effectiveAt: isDowngradeToFree
      ? (MOCK_CURRENT_SUBSCRIPTION.currentPeriodEndAt ??
        new Date().toISOString())
      : new Date().toISOString(),
  });
}

export async function createBillingPlanCheckoutSession(
  input: CreateBillingPlanCheckoutSessionRequest,
): Promise<CreateBillingPlanCheckoutSessionResponse> {
  // const response = await api.post<CreateBillingPlanCheckoutSessionResponse>(
  //   `/api/companies/${input.companyId}/billing/plan-management/checkout-session`,
  //   {
  //     targetPlanKey: input.targetPlanKey,
  //     targetBillingInterval: input.targetBillingInterval,
  //   },
  // );
  // return response.data;

  return Promise.resolve({
    sessionId: `mock_checkout_${input.companyId}_${input.targetPlanKey}_${input.targetBillingInterval}`,
    checkoutUrl: 'mock://billing/checkout/session',
  });
}
