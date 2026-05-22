import type { Knex } from 'knex';

import { BILLING_ACCOUNT_STATUSES } from '../billing.constants.js';

import type { BillingAccountStatus } from '../billing.types.js';

export type BillingAccountRow = {
  id: string;
  owner_company_id: string;
  invoice_currency_code: string;
  status: BillingAccountStatus;
  billing_cycle_anchor_day: number | null;
  billing_timezone: string | null;
  current_billing_period_start_at: Date | null;
  current_billing_period_end_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type CreateBillingAccountInput = {
  ownerCompanyId: string;
  invoiceCurrencyCode: string;
  status?: BillingAccountStatus;
  billingCycleAnchorDay?: number | null;
  billingTimezone?: string | null;
  currentBillingPeriodStartAt?: Date | null;
  currentBillingPeriodEndAt?: Date | null;
};

const BILLING_ACCOUNT_COLUMNS = [
  'id',
  'owner_company_id',
  'invoice_currency_code',
  'status',
  'billing_cycle_anchor_day',
  'billing_timezone',
  'current_billing_period_start_at',
  'current_billing_period_end_at',
  'created_at',
  'updated_at',
] as const;

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === '23505'
  );
}

function assertValidCreateInput(input: CreateBillingAccountInput): void {
  const currency = input.invoiceCurrencyCode?.trim().toUpperCase();
  if (!currency || !/^[A-Z]{3}$/.test(currency)) {
    throw new Error('invoiceCurrencyCode must be a 3-letter currency code');
  }

  if (
    input.status !== undefined &&
    !BILLING_ACCOUNT_STATUSES.includes(input.status)
  ) {
    throw new Error(`Invalid billing account status: ${input.status}`);
  }

  const anchorDay = input.billingCycleAnchorDay;
  if (
    anchorDay !== undefined &&
    anchorDay !== null &&
    (anchorDay < 1 || anchorDay > 31)
  ) {
    throw new Error('billingCycleAnchorDay must be between 1 and 31');
  }

  const periodStart = input.currentBillingPeriodStartAt;
  const periodEnd = input.currentBillingPeriodEndAt;
  if (
    periodStart &&
    periodEnd &&
    periodEnd.getTime() <= periodStart.getTime()
  ) {
    throw new Error(
      'currentBillingPeriodEndAt must be after currentBillingPeriodStartAt',
    );
  }
}

export async function createBillingAccount(
  input: CreateBillingAccountInput,
  db: Knex | Knex.Transaction,
): Promise<BillingAccountRow> {
  assertValidCreateInput(input);

  const insertRow = {
    owner_company_id: input.ownerCompanyId,
    invoice_currency_code: input.invoiceCurrencyCode.trim().toUpperCase(),
    status: input.status ?? 'active',
    billing_cycle_anchor_day: input.billingCycleAnchorDay ?? null,
    billing_timezone: input.billingTimezone ?? null,
    current_billing_period_start_at: input.currentBillingPeriodStartAt ?? null,
    current_billing_period_end_at: input.currentBillingPeriodEndAt ?? null,
  };

  try {
    const [row] = await db('billing_accounts')
      .insert(insertRow)
      .returning(BILLING_ACCOUNT_COLUMNS);

    if (!row) {
      throw new Error('Failed to create billing account');
    }

    return row as BillingAccountRow;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error(
        `Billing account already exists for owner company ${input.ownerCompanyId}`,
      );
    }
    throw error;
  }
}

export async function getBillingAccountById(
  id: string,
  db: Knex | Knex.Transaction,
): Promise<BillingAccountRow | null> {
  const row = await db('billing_accounts')
    .select(BILLING_ACCOUNT_COLUMNS)
    .where({ id })
    .first();

  return (row as BillingAccountRow | undefined) ?? null;
}

export async function getBillingAccountByOwnerCompanyId(
  ownerCompanyId: string,
  db: Knex | Knex.Transaction,
): Promise<BillingAccountRow | null> {
  const row = await db('billing_accounts')
    .select(BILLING_ACCOUNT_COLUMNS)
    .where({ owner_company_id: ownerCompanyId })
    .first();

  return (row as BillingAccountRow | undefined) ?? null;
}
