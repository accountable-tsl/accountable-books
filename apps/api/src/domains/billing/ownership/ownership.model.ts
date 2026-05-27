import type { Knex } from 'knex';

import {
  BILLING_COMMERCIAL_MODES,
  BILLING_SOFTWARE_PAYERS,
} from '../billing.constants.js';
import { assertAllowedOwnershipCombination } from './ownership.validation.js';

import type {
  BillingCommercialMode,
  BillingSoftwarePayer,
} from '../billing.types.js';

export type WorkspaceBillingOwnershipRow = {
  id: string;
  workspace_company_id: string;
  billing_account_id: string;
  client_billing_account_id: string | null;
  commercial_mode: BillingCommercialMode;
  software_payer: BillingSoftwarePayer;
  effective_at: Date;
  ended_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type CreateWorkspaceBillingOwnershipInput = {
  workspaceCompanyId: string;
  billingAccountId: string;
  clientBillingAccountId?: string | null;
  commercialMode: BillingCommercialMode;
  softwarePayer?: BillingSoftwarePayer;
  effectiveAt?: Date;
};

const OWNERSHIP_COLUMNS = [
  'id',
  'workspace_company_id',
  'billing_account_id',
  'client_billing_account_id',
  'commercial_mode',
  'software_payer',
  'effective_at',
  'ended_at',
  'created_at',
  'updated_at',
] as const;

function isExclusionViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === '23P01'
  );
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === '23505'
  );
}

function assertValidCreateInput(
  input: CreateWorkspaceBillingOwnershipInput,
): void {
  if (!BILLING_COMMERCIAL_MODES.includes(input.commercialMode)) {
    throw new Error(`Invalid commercial_mode: ${input.commercialMode}`);
  }

  const softwarePayer = input.softwarePayer ?? 'billing_account';
  if (!BILLING_SOFTWARE_PAYERS.includes(softwarePayer)) {
    throw new Error(`Invalid software_payer: ${softwarePayer}`);
  }

  assertAllowedOwnershipCombination({
    billingAccountId: input.billingAccountId,
    commercialMode: input.commercialMode,
    clientBillingAccountId: input.clientBillingAccountId,
    softwarePayer,
  });
}

function wrapOwnershipDbError(
  error: unknown,
  workspaceCompanyId: string,
): never {
  if (isUniqueViolation(error)) {
    throw new Error(
      `Active workspace billing ownership already exists for workspace ${workspaceCompanyId}`,
    );
  }
  if (isExclusionViolation(error)) {
    throw new Error(
      `Overlapping workspace billing ownership window for workspace ${workspaceCompanyId}`,
    );
  }
  throw error;
}

export async function createWorkspaceBillingOwnership(
  input: CreateWorkspaceBillingOwnershipInput,
  db: Knex | Knex.Transaction,
): Promise<WorkspaceBillingOwnershipRow> {
  assertValidCreateInput(input);

  const softwarePayer = input.softwarePayer ?? 'billing_account';

  const insertRow = {
    workspace_company_id: input.workspaceCompanyId,
    billing_account_id: input.billingAccountId,
    client_billing_account_id: input.clientBillingAccountId ?? null,
    commercial_mode: input.commercialMode,
    software_payer: softwarePayer,
    effective_at: input.effectiveAt ?? new Date(),
  };

  try {
    const [row] = await db('workspace_billing_ownership')
      .insert(insertRow)
      .returning(OWNERSHIP_COLUMNS);

    if (!row) {
      throw new Error('Failed to create workspace billing ownership');
    }

    return row as WorkspaceBillingOwnershipRow;
  } catch (error) {
    wrapOwnershipDbError(error, input.workspaceCompanyId);
  }
}

export async function endWorkspaceBillingOwnership(
  workspaceCompanyId: string,
  endedAt: Date,
  db: Knex | Knex.Transaction,
): Promise<WorkspaceBillingOwnershipRow | null> {
  const [row] = await db('workspace_billing_ownership')
    .where({
      workspace_company_id: workspaceCompanyId,
      ended_at: null,
    })
    .update({
      ended_at: endedAt,
      updated_at: db.fn.now(),
    })
    .returning(OWNERSHIP_COLUMNS);

  return (row as WorkspaceBillingOwnershipRow | undefined) ?? null;
}

export async function getCurrentWorkspaceBillingOwnership(
  workspaceCompanyId: string,
  db: Knex | Knex.Transaction,
  at: Date = new Date(),
): Promise<WorkspaceBillingOwnershipRow | null> {
  const row = await db('workspace_billing_ownership')
    .select(OWNERSHIP_COLUMNS)
    .where({ workspace_company_id: workspaceCompanyId })
    .where('effective_at', '<=', at)
    .where((builder) => {
      builder.whereNull('ended_at').orWhere('ended_at', '>', at);
    })
    .orderBy('effective_at', 'desc')
    .first();

  return (row as WorkspaceBillingOwnershipRow | undefined) ?? null;
}

export async function listWorkspaceBillingOwnershipHistory(
  workspaceCompanyId: string,
  db: Knex | Knex.Transaction,
): Promise<WorkspaceBillingOwnershipRow[]> {
  const rows = await db('workspace_billing_ownership')
    .select(OWNERSHIP_COLUMNS)
    .where({ workspace_company_id: workspaceCompanyId })
    .orderBy('effective_at', 'asc');

  return rows as WorkspaceBillingOwnershipRow[];
}
