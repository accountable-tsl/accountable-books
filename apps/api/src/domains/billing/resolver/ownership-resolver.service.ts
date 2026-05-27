import type { Knex } from 'knex';
import { billing } from '@accountable-books/contracts/schema';

import { knexClient } from '../../../db/knexClient.js';
import { getBillingAccountById } from '../accounts/accounts.model.js';
import { deriveBillingAccountOwnerType } from '../accounts/accounts.utils.js';
import { getCurrentWorkspaceBillingOwnership } from '../ownership/ownership.model.js';

import type { BillingAccountRow } from '../accounts/accounts.model.js';

export type ResolveWorkspaceBillingContextOptions = {
  at?: Date;
  db?: Knex | Knex.Transaction;
};

async function loadBillingAccountRecord(
  account: BillingAccountRow,
  db: Knex | Knex.Transaction,
): Promise<billing.BillingAccountRecord> {
  const company = await db('companies')
    .where({ id: account.owner_company_id })
    .select('type')
    .first<{ type: string }>();

  if (!company?.type) {
    throw new Error(
      `Owner company not found for billing account ${account.id}`,
    );
  }

  return billing.billingAccountRecordSchema.parse({
    id: account.id,
    ownerCompanyId: account.owner_company_id,
    ownerType: deriveBillingAccountOwnerType(company.type),
    invoiceCurrencyCode: account.invoice_currency_code,
    status: account.status,
  });
}

export async function resolveWorkspaceBillingContext(
  workspaceCompanyId: string,
  options: ResolveWorkspaceBillingContextOptions = {},
): Promise<billing.WorkspaceBillingContext | null> {
  const db = options.db ?? knexClient;
  const at = options.at ?? new Date();

  const ownership = await getCurrentWorkspaceBillingOwnership(
    workspaceCompanyId,
    db,
    at,
  );

  if (!ownership) {
    return null;
  }

  const payerAccount = await getBillingAccountById(
    ownership.billing_account_id,
    db,
  );
  if (!payerAccount) {
    throw new Error(
      `Billing account ${ownership.billing_account_id} not found for workspace ${workspaceCompanyId}`,
    );
  }

  const billingAccount = await loadBillingAccountRecord(payerAccount, db);

  let clientBillingAccount: billing.BillingAccountRecord | null = null;
  if (ownership.client_billing_account_id) {
    const clientAccount = await getBillingAccountById(
      ownership.client_billing_account_id,
      db,
    );
    if (!clientAccount) {
      throw new Error(
        `Client billing account ${ownership.client_billing_account_id} not found for workspace ${workspaceCompanyId}`,
      );
    }
    clientBillingAccount = await loadBillingAccountRecord(clientAccount, db);
  }

  const context: billing.WorkspaceBillingContext = {
    workspaceCompanyId,
    ownershipId: ownership.id,
    billingAccountId: ownership.billing_account_id,
    clientBillingAccountId: ownership.client_billing_account_id,
    commercialMode: ownership.commercial_mode,
    softwarePayer: ownership.software_payer,
    isFirmInternalWorkspace: ownership.commercial_mode === 'firm_internal',
    effectiveAt: ownership.effective_at.toISOString(),
    endedAt: ownership.ended_at?.toISOString() ?? null,
    billingAccount,
    clientBillingAccount,
  };

  return billing.workspaceBillingContextSchema.parse(context);
}
