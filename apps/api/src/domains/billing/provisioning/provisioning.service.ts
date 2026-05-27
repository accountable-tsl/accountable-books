import type { Knex } from 'knex';

import {
  createBillingAccount,
  getBillingAccountByOwnerCompanyId,
} from '../accounts/accounts.model.js';
import {
  createWorkspaceBillingOwnership,
  endWorkspaceBillingOwnership,
} from '../ownership/ownership.model.js';
import { upsertBillingAccountProfile } from '../profiles/profiles.model.js';

import type { BillingAccountRow } from '../accounts/accounts.model.js';
import type { BillingCommercialMode } from '../billing.types.js';

type CompanyBillingContext = {
  id: string;
  type: string;
  legal_name: string;
  assigned_firm_id: string | null;
  workspace_class: string;
  country_code: string;
  currency_code: string;
};

type RawCompanyBillingContext = {
  id: string;
  type: string;
  legal_name: string;
  assigned_firm_id: string | null;
  workspace_class: string | null;
  country_code: string | null;
  currency_code: string | null;
};

export type ProvisionBillingForCompanyInput = {
  billingEmail: string;
  db: Knex | Knex.Transaction;
};

export type ProvisionBillingForCompanyResult = {
  billingAccountId: string;
  ownershipId: string | null;
  commercialMode: BillingCommercialMode;
  createdAccount: boolean;
  createdOwnership: boolean;
};

async function loadCompanyBillingContext(
  companyId: string,
  db: Knex | Knex.Transaction,
): Promise<CompanyBillingContext> {
  const company = await db('companies as c')
    .leftJoin('countries', 'c.country_id', 'countries.id')
    .leftJoin('currencies', 'c.reporting_currency_id', 'currencies.id')
    .where('c.id', companyId)
    .select(
      'c.id',
      'c.type',
      'c.legal_name',
      'c.assigned_firm_id',
      'c.workspace_class',
      'countries.code as country_code',
      'currencies.code as currency_code',
    )
    .first<RawCompanyBillingContext>();

  if (!company?.currency_code) {
    throw new Error(
      `Company ${companyId} not found or missing reporting currency`,
    );
  }

  if (!company.country_code) {
    throw new Error(
      `Company ${companyId} not found or missing billing country`,
    );
  }

  if (!company.workspace_class) {
    throw new Error(
      `Company ${companyId} is missing workspace_class — cannot resolve billing`,
    );
  }

  return {
    ...company,
    country_code: company.country_code,
    currency_code: company.currency_code,
    workspace_class: company.workspace_class,
  };
}

async function resolveAssignedFirmId(
  company: CompanyBillingContext,
  db: Knex | Knex.Transaction,
): Promise<string | null> {
  if (company.assigned_firm_id) {
    return company.assigned_firm_id;
  }

  const assignment = await db('client_firm_assignments')
    .where({ client_company_id: company.id })
    .select('accounting_firm_company_id')
    .first<{ accounting_firm_company_id: string }>();

  return assignment?.accounting_firm_company_id ?? null;
}

export async function resolveCommercialModeForCompany(
  companyId: string,
  db: Knex | Knex.Transaction,
): Promise<BillingCommercialMode> {
  const company = await loadCompanyBillingContext(companyId, db);
  const assignedFirmId = await resolveAssignedFirmId(company, db);
  return resolveCommercialMode(company, assignedFirmId, db);
}

async function resolveCommercialMode(
  company: CompanyBillingContext,
  assignedFirmId: string | null,
  db: Knex | Knex.Transaction,
): Promise<BillingCommercialMode> {
  if (company.type === 'accounting_firm' && assignedFirmId === company.id) {
    return 'firm_internal';
  }

  if (
    company.type !== 'accounting_firm' &&
    assignedFirmId &&
    assignedFirmId !== company.id
  ) {
    const firm = await db('companies')
      .where({ id: assignedFirmId, type: 'accounting_firm' })
      .whereIn('workspace_class', ['customer', 'partner', 'platform'])
      .first('id');

    if (firm) {
      return 'firm_managed';
    }
  }

  return 'self_serve';
}

async function resolvePayerBillingAccount(
  commercialMode: BillingCommercialMode,
  company: CompanyBillingContext,
  assignedFirmId: string | null,
  db: Knex | Knex.Transaction,
): Promise<BillingAccountRow> {
  const ownerCompanyId =
    commercialMode === 'firm_managed' && assignedFirmId
      ? assignedFirmId
      : company.id;

  const account = await getBillingAccountByOwnerCompanyId(ownerCompanyId, db);
  if (!account) {
    throw new Error(
      `Billing account missing for owner company ${ownerCompanyId} (${commercialMode})`,
    );
  }

  return account;
}

export async function ensureBillingAccountForCompany(
  companyId: string,
  input: ProvisionBillingForCompanyInput,
): Promise<{ account: BillingAccountRow; created: boolean }> {
  const { billingEmail, db } = input;
  const company = await loadCompanyBillingContext(companyId, db);

  const existing = await getBillingAccountByOwnerCompanyId(companyId, db);
  if (existing) {
    await upsertBillingAccountProfile(
      {
        billingAccountId: existing.id,
        legalEntityName: company.legal_name,
        billingEmail,
        billingCountryCode: company.country_code,
      },
      db,
    );
    return { account: existing, created: false };
  }

  const account = await createBillingAccount(
    {
      ownerCompanyId: companyId,
      invoiceCurrencyCode: company.currency_code,
    },
    db,
  );

  await upsertBillingAccountProfile(
    {
      billingAccountId: account.id,
      legalEntityName: company.legal_name,
      billingEmail,
      billingCountryCode: company.country_code,
    },
    db,
  );

  return { account, created: true };
}

export async function ensureWorkspaceBillingOwnershipForCompany(
  companyId: string,
  db: Knex | Knex.Transaction,
): Promise<{
  ownershipId: string | null;
  created: boolean;
  commercialMode: BillingCommercialMode;
}> {
  const company = await loadCompanyBillingContext(companyId, db);
  const assignedFirmId = await resolveAssignedFirmId(company, db);
  const commercialMode = await resolveCommercialMode(
    company,
    assignedFirmId,
    db,
  );
  const payerAccount = await resolvePayerBillingAccount(
    commercialMode,
    company,
    assignedFirmId,
    db,
  );

  const active = await db('workspace_billing_ownership')
    .where({
      workspace_company_id: companyId,
      ended_at: null,
    })
    .first<{
      id: string;
      commercial_mode: string;
      billing_account_id: string;
    }>();

  if (
    active &&
    active.commercial_mode === commercialMode &&
    active.billing_account_id === payerAccount.id
  ) {
    return {
      ownershipId: active.id,
      created: false,
      commercialMode,
    };
  }

  const now = new Date();
  if (active) {
    await endWorkspaceBillingOwnership(companyId, now, db);
  }

  const ownership = await createWorkspaceBillingOwnership(
    {
      workspaceCompanyId: companyId,
      billingAccountId: payerAccount.id,
      commercialMode,
      softwarePayer: 'billing_account',
    },
    db,
  );

  return {
    ownershipId: ownership.id,
    created: true,
    commercialMode,
  };
}

export async function provisionBillingForCompany(
  companyId: string,
  input: ProvisionBillingForCompanyInput,
): Promise<ProvisionBillingForCompanyResult> {
  const { account, created: createdAccount } =
    await ensureBillingAccountForCompany(companyId, input);

  const {
    ownershipId,
    created: createdOwnership,
    commercialMode,
  } = await ensureWorkspaceBillingOwnershipForCompany(companyId, input.db);

  return {
    billingAccountId: account.id,
    ownershipId,
    commercialMode,
    createdAccount,
    createdOwnership,
  };
}

export async function finalizeAccountingFirmBillingBootstrap(
  companyId: string,
  input: ProvisionBillingForCompanyInput,
): Promise<ProvisionBillingForCompanyResult> {
  const company = await loadCompanyBillingContext(companyId, input.db);
  if (company.type !== 'accounting_firm') {
    throw new Error(
      `Company ${companyId} is not an accounting firm and cannot use firm billing bootstrap`,
    );
  }

  const assignedFirmId = await resolveAssignedFirmId(company, input.db);
  if (assignedFirmId !== company.id) {
    throw new Error(
      `Accounting firm ${companyId} must be self-assigned before billing bootstrap`,
    );
  }

  const result = await provisionBillingForCompany(companyId, input);

  if (result.commercialMode !== 'firm_internal') {
    throw new Error(
      `Accounting firm ${companyId} did not resolve to firm_internal during billing bootstrap`,
    );
  }

  return result;
}
