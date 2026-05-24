import type { Knex } from 'knex';
import {
  getDefaultTimezoneForCountry,
  normalizeTimezoneId,
} from '@accountable-books/utils/timezone';
import z from 'zod';

import { createInitialCompanyOnboardingState } from '../../features/onboarding/onboarding.utils.js';
import generateSecureShortCode, {
  shortCodelooksWeird,
} from '../../shared/utils/crypto.utils.js';
import { logger } from '../../shared/utils/logger.js';
import { AppError } from '../../shared/utils/response.utils.js';
import { isReservedSlug, isValidSlug } from '../accountingFirms/firms.utils.js';
import { resolvePartnerFirmForCompany } from '../accountingFirms/partner-firm.service.js';
import { provisionBillingForCompany } from '../billing/provisioning/provisioning.service.js';
import { loadCoaTemplateForCompany } from '../chart-of-accounts/coa-template.model.js';
import { createDefaultAccounts } from '../chart-of-accounts/coa.model.js';
import {
  getCountryFromCode,
  getCountryFromId,
} from '../countries/countries.utils.js';
import { getCurrency } from '../currencies/currencies.utils.js';
import { type RoleKey } from '../roles/roles.types.js';
import { initializeCompanySettings } from '../settings/settings.service.js';
import { upsertDirectCompanyRole } from '../user-roles/user-roles.model.js';
import {
  company as companySchema,
  newCompanyInput,
} from './companies.types.js';
import {
  writeAccountingFirmMetaProvisioningAudit,
  writeFirmAssignmentProvisioningAudit,
  writeWorkspaceRoleGrantProvisioningAudit,
} from './company-provisioning.audit.js';
import {
  PLATFORM_COA_TEMPLATE,
  VEYRA_COA_TEMPLATE,
} from './workspace-provisioning.constants.js';

import type { CompanyOnboardingState } from '../../features/onboarding/onboarding.types.js';
import type { NewAccFirmInput } from '../accountingFirms/firms.types.js';
import type { ProvisionBillingForCompanyResult } from '../billing/provisioning/provisioning.service.js';
import type { GrantAccessResponse } from '../user-roles/user-roles.types.js';
import type {
  Company,
  NewCompany,
  NewCompanyInput,
  WorkspaceClass,
} from './companies.types.js';

export type WorkspaceProvisioningPolicy =
  | { kind: 'signup' }
  | { kind: 'platform_bootstrap' }
  | { kind: 'system_seed' }
  | { kind: 'demo' }
  | { kind: 'admin' };

/**
 * How to resolve the managing accounting firm for a workspace:
 * - self: the workspace acts as its own managing firm
 * - explicit: caller provides the firm ID directly via assignedFirmId
 * - auto: system resolves the appropriate partner firm by jurisdiction, falling back to platform
 * - default: explicitly assign to the platform workspace
 */
export type CompanyAssignmentStrategy =
  | 'self'
  | 'explicit'
  | 'auto'
  | 'default';
export type CompanyCoaMode = 'template' | 'default';
export type WorkspaceSideEffectMode = 'normal' | 'skip_jobs';

export type ProvisionCompanyWorkspaceInput = {
  trx: Knex.Transaction;
  actorUserId: string;
  ownerUserId: string;
  billingEmail: string;
  company: NewCompanyInput & {
    assignment_strategy?: CompanyAssignmentStrategy;
    coa_mode?: CompanyCoaMode;
    coa_template_name?: string;
    firm_type?: NewAccFirmInput['firm_type'];
    role_key?: RoleKey;
    skip_side_effects?: boolean;
    additional_role_grants?: Array<{
      user_id: string;
      role_key: RoleKey;
    }>;
  };
  policy: WorkspaceProvisioningPolicy;
};

export type ReconcileCompanyWorkspaceInput = ProvisionCompanyWorkspaceInput & {
  companyId: string;
};

export type EnsureAccountingFirmMetaInput = {
  trx: Knex.Transaction;
  companyId: string;
  actorUserId: string;
  meta: NewAccFirmInput;
  allowUpdate?: boolean;
  allowReservedSlug?: boolean;
};

export type EnsureCompanyFirmAssignmentInput = {
  trx: Knex.Transaction;
  companyId: string;
  actorUserId: string;
  strategy: CompanyAssignmentStrategy;
  assignedFirmId?: string | null;
  allowReassignment?: boolean;
};

export type EnsureCompanyChartOfAccountsInput = {
  trx: Knex.Transaction;
  companyId: string;
  userId: string;
  mode: CompanyCoaMode;
  templateName?: string;
};

export type EnsureWorkspaceRoleGrantInput = {
  trx: Knex.Transaction;
  companyId: string;
  userId: string;
  roleKey: RoleKey;
  grantedBy: string;
};

type ResolvedCompanyInsertInput = Omit<
  NewCompanyInput,
  'country_code' | 'reporting_currency_code'
> & {
  country_id: string;
  reporting_currency_id: string;
  default_timezone?: string;
  display_name: string;
  onboarding_state: CompanyOnboardingState;
  short_code: string;
  year_end_day: number;
  year_end_month: number;
  accounting_basis: NewCompany['accounting_basis'];
  reporting_framework: NewCompany['reporting_framework'];
  workspace_class: WorkspaceClass;
  industry: string | null;
  last_updated_by_id: string;
};

type ProvisioningRoleGrant = {
  userId: string;
  roleKey: RoleKey;
};

type ResolvedProvisioningPlan = {
  workspaceClass: WorkspaceClass;
  assignmentStrategy: CompanyAssignmentStrategy;
  roleKey: RoleKey;
  sideEffectMode: WorkspaceSideEffectMode;
  coaMode: CompanyCoaMode;
  coaTemplateName?: string;
  requireFirmMeta: boolean;
  allowFirmMetaUpdate: boolean;
  allowReservedSlug: boolean;
  allowReassignment: boolean;
  additionalRoleGrants: ProvisioningRoleGrant[];
};

const DEMO_BUSINESS_TEMPLATES = [
  'biz:int_design:adv:code:v1',
  'biz:int_design:adv:nocode:v1',
  'biz:saas:basic:code:v1',
  'biz:none:basic:nocode:v1',
  'biz:saas:basic:nocode:v1',
] as const;

function resolveDefaultYearEnd(
  countryCode: string | undefined,
  companyType: NewCompanyInput['type'],
) {
  if (countryCode === 'GB' && companyType === 'individual') {
    return { year_end_day: 5, year_end_month: 4 };
  }

  return { year_end_day: 31, year_end_month: 12 };
}

async function generateUniqueShortCode(
  trx: Knex.Transaction,
  providedShortCode: string | undefined,
): Promise<string> {
  let shortCode: string;
  let exists = false;
  let attempts = 0;
  const maxAttempts = 5;

  do {
    shortCode = providedShortCode || generateSecureShortCode();

    if (!providedShortCode && shortCodelooksWeird(shortCode, 4)) {
      attempts++;
      continue;
    }

    exists = !!(await trx('companies')
      .where({ short_code: shortCode })
      .first());
    attempts++;

    if (providedShortCode && exists) {
      throw new AppError(
        'Provided short code already exists',
        { shortCode: providedShortCode },
        true,
      );
    }
  } while (exists && attempts < maxAttempts);

  if (exists) {
    throw new AppError(
      `Unable to generate unique short code after ${maxAttempts} attempts`,
      { attempts: maxAttempts },
      true,
    );
  }

  return shortCode;
}

async function resolveCompanyInsertInput(
  trx: Knex.Transaction,
  input: NewCompanyInput,
): Promise<ResolvedCompanyInsertInput> {
  const validateInput = newCompanyInput.safeParse(input);

  if (!validateInput.success) {
    throw new AppError(
      'Invalid input provided for company creation',
      z.flattenError(validateInput.error),
      true,
    );
  }

  if (!validateInput.data.created_by_id) {
    throw new AppError('User ID is required for company creation');
  }

  const creator = await trx('users')
    .where({ id: validateInput.data.created_by_id })
    .first(['id']);

  if (!creator?.id) {
    throw new AppError(
      'Unauthorized',
      `Non-existent user attempting to create company: ${validateInput.data.legal_name} with userId: ${validateInput.data.created_by_id}`,
      true,
    );
  }

  const {
    slug: _slug,
    assigned_firm_id: _assignedFirmId,
    load_coa_template: _loadCoaTemplate,
    reporting_currency_id,
    reporting_currency_code,
    country_code,
    country_id,
    default_timezone,
    ...rest
  } = validateInput.data;

  const resolvedCountry = country_code
    ? await getCountryFromCode(country_code)
    : country_id
      ? await getCountryFromId(country_id)
      : undefined;

  const countryId = country_id ?? resolvedCountry?.id;
  const countryCode = country_code ?? resolvedCountry?.code;

  const reportingCurrencyId = reporting_currency_id
    ? reporting_currency_id
    : reporting_currency_code
      ? (await getCurrency(reporting_currency_code)).id
      : undefined;

  if (!countryId) {
    throw new AppError('Country is required for company creation');
  }

  if (!reportingCurrencyId) {
    throw new AppError('Reporting currency is required for company creation');
  }

  const timezone =
    normalizeTimezoneId(default_timezone) ??
    getDefaultTimezoneForCountry(countryCode);
  const defaultYearEnd = resolveDefaultYearEnd(countryCode, rest.type);

  return {
    ...rest,
    ...(rest.id ? { id: rest.id } : {}),
    country_id: countryId,
    reporting_currency_id: reportingCurrencyId,
    display_name: rest.display_name || rest.legal_name,
    default_timezone: timezone,
    onboarding_state:
      rest.onboarding_state || createInitialCompanyOnboardingState(rest.type),
    short_code: await generateUniqueShortCode(
      trx,
      validateInput.data.short_code,
    ),
    year_end_day: rest.year_end_day || defaultYearEnd.year_end_day,
    year_end_month: rest.year_end_month || defaultYearEnd.year_end_month,
    reporting_framework: rest.reporting_framework ?? 'ifrs',
    created_by_id: creator.id,
    last_updated_by_id: creator.id,
    accounting_basis: rest.accounting_basis ?? 'modified_cash_basis',
    workspace_class: rest.workspace_class ?? 'customer',
    industry:
      rest.industry ||
      (rest.type === 'accounting_firm' ? 'professional_services' : null),
  };
}

async function resolvePlatformFirmId(trx: Knex.Transaction): Promise<string> {
  const firm = await trx('accounting_firms_meta as af')
    .join('companies as c', 'af.company_id', 'c.id')
    .where('c.workspace_class', 'platform')
    .select('af.company_id as id')
    .first<{ id: string }>();

  if (!firm?.id) {
    throw new AppError(
      'Platform workspace is required before assigning customer workspaces',
    );
  }

  return firm.id;
}

async function loadProvisionedCompany(
  trx: Knex.Transaction,
  companyId: string,
): Promise<
  Pick<Company, 'id' | 'type' | 'reporting_currency_id' | 'short_code'>
> {
  const company = await trx('companies')
    .where({ id: companyId })
    .select('id', 'type', 'reporting_currency_id', 'short_code')
    .first<
      Pick<Company, 'id' | 'type' | 'reporting_currency_id' | 'short_code'>
    >();

  if (!company?.id) {
    throw new AppError(`Company ${companyId} not found`);
  }

  return company;
}

async function loadCompanyRecord(
  trx: Knex.Transaction,
  companyId: string,
): Promise<Company> {
  const company = await trx('companies').where({ id: companyId }).first();

  const parsed = companySchema.safeParse(company);
  if (!parsed.success) {
    throw new AppError(
      `Failed to validate existing company ${companyId}`,
      z.flattenError(parsed.error),
      true,
    );
  }

  return parsed.data;
}

function resolveSideEffectMode(
  policy: WorkspaceProvisioningPolicy,
  company: ProvisionCompanyWorkspaceInput['company'],
): WorkspaceSideEffectMode {
  if (company.skip_side_effects) {
    return 'skip_jobs';
  }

  return policy.kind === 'demo' ||
    policy.kind === 'platform_bootstrap' ||
    policy.kind === 'system_seed'
    ? 'skip_jobs'
    : 'normal';
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function resolveDemoCoaTemplateName(
  company: ProvisionCompanyWorkspaceInput['company'],
): string {
  if (company.type === 'individual') {
    return 'ind:none:basic:nocode:v1';
  }

  if (company.type === 'accounting_firm') {
    return VEYRA_COA_TEMPLATE;
  }

  const seed = company.short_code ?? company.legal_name;
  return DEMO_BUSINESS_TEMPLATES[
    hashString(seed) % DEMO_BUSINESS_TEMPLATES.length
  ];
}

function resolveCoaTemplateName(
  policy: WorkspaceProvisioningPolicy,
  company: ProvisionCompanyWorkspaceInput['company'],
): string | undefined {
  if (company.coa_template_name) {
    return company.coa_template_name;
  }

  if (policy.kind === 'platform_bootstrap') {
    return PLATFORM_COA_TEMPLATE;
  }

  if (policy.kind === 'system_seed') {
    return VEYRA_COA_TEMPLATE;
  }

  if (policy.kind === 'demo') {
    return resolveDemoCoaTemplateName(company);
  }

  return undefined;
}

function resolveProvisioningPlan(
  input: ProvisionCompanyWorkspaceInput,
): ResolvedProvisioningPlan {
  const { company, policy } = input;
  const requireFirmMeta = company.type === 'accounting_firm';
  const sideEffectMode = resolveSideEffectMode(policy, company);
  const assignmentStrategy =
    company.assignment_strategy ??
    (company.type === 'accounting_firm' ? 'self' : 'auto');
  const roleKey =
    company.role_key ??
    (company.type === 'accounting_firm' ? 'admin' : 'client_owner');
  const coaMode =
    company.coa_mode ??
    (company.load_coa_template === false ? 'default' : 'template');
  const coaTemplateName = resolveCoaTemplateName(policy, company);
  const additionalRoleGrants =
    company.additional_role_grants?.map((grant) => ({
      userId: grant.user_id,
      roleKey: grant.role_key,
    })) ?? [];

  switch (policy.kind) {
    case 'platform_bootstrap':
      return {
        workspaceClass: 'platform',
        assignmentStrategy: 'self',
        roleKey: 'super_admin',
        sideEffectMode,
        coaMode: company.coa_mode ?? 'template',
        coaTemplateName,
        requireFirmMeta: true,
        allowFirmMetaUpdate: true,
        allowReservedSlug: true,
        allowReassignment: true,
        additionalRoleGrants,
      };
    case 'system_seed':
      return {
        workspaceClass: 'partner',
        assignmentStrategy: 'self',
        roleKey: 'admin',
        sideEffectMode,
        coaMode: company.coa_mode ?? 'template',
        coaTemplateName,
        requireFirmMeta: true,
        allowFirmMetaUpdate: true,
        allowReservedSlug: true,
        allowReassignment: true,
        additionalRoleGrants,
      };
    case 'demo':
      return {
        workspaceClass: 'demo',
        assignmentStrategy,
        roleKey,
        sideEffectMode,
        coaMode: company.coa_mode ?? 'template',
        coaTemplateName,
        requireFirmMeta,
        allowFirmMetaUpdate: false,
        allowReservedSlug: false,
        allowReassignment: company.type === 'accounting_firm',
        additionalRoleGrants,
      };
    case 'admin':
    case 'signup':
      return {
        workspaceClass: company.workspace_class ?? 'customer',
        assignmentStrategy,
        roleKey,
        sideEffectMode,
        coaMode,
        coaTemplateName,
        requireFirmMeta,
        allowFirmMetaUpdate: false,
        allowReservedSlug: false,
        allowReassignment: company.type === 'accounting_firm',
        additionalRoleGrants,
      };
  }
}

export async function insertCompanyRecord({
  trx,
  company,
}: {
  trx: Knex.Transaction;
  company: NewCompanyInput;
}): Promise<Company> {
  const companyData = await resolveCompanyInsertInput(trx, company);
  const [inserted] = await trx('companies').insert(companyData).returning('*');

  const parsed = companySchema.safeParse(inserted);
  if (!parsed.success) {
    throw new AppError(
      'Failed to validate inserted company',
      z.flattenError(parsed.error),
      true,
    );
  }

  return parsed.data;
}

export async function ensureAccountingFirmMeta({
  trx,
  companyId,
  actorUserId,
  meta,
  allowUpdate = false,
  allowReservedSlug = false,
}: EnsureAccountingFirmMetaInput): Promise<{
  companyId: string;
  slug: string;
  created: boolean;
  updated: boolean;
}> {
  if (!meta.slug) {
    throw new AppError('Accounting firm slug is required');
  }

  if (!isValidSlug(meta.slug)) {
    throw new AppError('Invalid slug format');
  }

  if (!allowReservedSlug && isReservedSlug(meta.slug)) {
    throw new AppError('Slug is reserved');
  }

  const existing = await trx('accounting_firms_meta')
    .where({ company_id: companyId })
    .first<{ company_id: string; slug: string; firm_type: string | null }>();

  if (!existing) {
    const [created] = await trx('accounting_firms_meta')
      .insert({
        company_id: companyId,
        slug: meta.slug,
        firm_type: meta.firm_type,
      })
      .returning(['company_id', 'slug']);

    await writeAccountingFirmMetaProvisioningAudit({
      companyId,
      entityId: companyId,
      actor: { type: 'user', userId: actorUserId },
      payload: {
        slug: created.slug,
        firmType: meta.firm_type ?? null,
        operation: 'created',
      },
      trx,
    });

    return {
      companyId,
      slug: created.slug,
      created: true,
      updated: false,
    };
  }

  if (
    existing.slug === meta.slug &&
    existing.firm_type === (meta.firm_type ?? null)
  ) {
    return {
      companyId,
      slug: existing.slug,
      created: false,
      updated: false,
    };
  }

  if (!allowUpdate) {
    throw new AppError(
      `Accounting firm metadata already exists for ${companyId} and differs from requested input`,
    );
  }

  const [updated] = await trx('accounting_firms_meta')
    .where({ company_id: companyId })
    .update({
      slug: meta.slug,
      firm_type: meta.firm_type ?? null,
    })
    .returning(['company_id', 'slug']);

  await writeAccountingFirmMetaProvisioningAudit({
    companyId,
    entityId: companyId,
    actor: { type: 'user', userId: actorUserId },
    payload: {
      slug: updated.slug,
      firmType: meta.firm_type ?? null,
      operation: 'updated',
    },
    trx,
  });

  return {
    companyId: updated.company_id,
    slug: updated.slug,
    created: false,
    updated: true,
  };
}

export async function ensureCompanyFirmAssignment({
  trx,
  companyId,
  actorUserId,
  strategy,
  assignedFirmId,
  allowReassignment = false,
}: EnsureCompanyFirmAssignmentInput): Promise<{
  assignedFirmId: string;
  created: boolean;
  updated: boolean;
}> {
  const targetFirmId =
    strategy === 'self'
      ? companyId
      : strategy === 'default'
        ? await resolvePlatformFirmId(trx)
        : strategy === 'auto'
          ? ((await resolvePartnerFirmForCompany({
              trx,
              companyUUID: companyId,
            })) ?? (await resolvePlatformFirmId(trx)))
          : assignedFirmId;

  if (!targetFirmId) {
    throw new AppError('Company must be assigned to a firm');
  }

  const targetFirm = await trx('companies')
    .where({ id: targetFirmId, type: 'accounting_firm' })
    .first(['id']);

  if (!targetFirm) {
    throw new AppError(`Firm ${targetFirmId} not found`);
  }

  const company = await trx('companies')
    .where({ id: companyId })
    .select('assigned_firm_id')
    .first<{ assigned_firm_id: string | null }>();

  if (!company) {
    throw new AppError(`Company ${companyId} not found`);
  }

  const existingAssignment = await trx('client_firm_assignments')
    .where({ client_company_id: companyId })
    .first<{ accounting_firm_company_id: string }>();

  const requiresAssignmentUpdate =
    !!existingAssignment &&
    existingAssignment.accounting_firm_company_id !== targetFirmId;
  const requiresCompanyUpdate = company.assigned_firm_id !== targetFirmId;

  if (
    !allowReassignment &&
    ((existingAssignment && requiresAssignmentUpdate) ||
      (company.assigned_firm_id && requiresCompanyUpdate))
  ) {
    throw new AppError(
      `Company ${companyId} is already assigned to a different firm`,
    );
  }

  let created = false;
  let updated = false;

  if (!existingAssignment) {
    await trx('client_firm_assignments').insert({
      client_company_id: companyId,
      accounting_firm_company_id: targetFirmId,
      created_by_id: actorUserId,
      updated_by_id: actorUserId,
    });
    created = true;
  } else if (requiresAssignmentUpdate) {
    await trx('client_firm_assignments')
      .where({ client_company_id: companyId })
      .update({
        accounting_firm_company_id: targetFirmId,
        updated_by_id: actorUserId,
      });
    updated = true;
  }

  if (requiresCompanyUpdate) {
    await trx('companies')
      .where({ id: companyId })
      .update({ assigned_firm_id: targetFirmId });
    updated = true;
  }

  if (created || updated) {
    await writeFirmAssignmentProvisioningAudit({
      companyId,
      entityId: companyId,
      actor: { type: 'user', userId: actorUserId },
      payload: {
        assignedFirmId: targetFirmId,
        operation: created ? 'created' : 'updated',
      },
      trx,
    });
  }

  return {
    assignedFirmId: targetFirmId,
    created,
    updated,
  };
}

export async function ensureCompanyBilling({
  trx,
  companyId,
  billingEmail,
}: {
  trx: Knex.Transaction;
  companyId: string;
  billingEmail: string;
}): Promise<ProvisionBillingForCompanyResult> {
  const company = await trx('companies')
    .where({ id: companyId })
    .select('id', 'type', 'assigned_firm_id')
    .first<{ id: string; type: string; assigned_firm_id: string | null }>();

  if (!company?.id) {
    throw new AppError(`Company ${companyId} not found`);
  }

  if (
    company.type === 'accounting_firm' &&
    company.assigned_firm_id !== company.id
  ) {
    throw new AppError(
      `Accounting firm ${companyId} must be self-assigned before billing bootstrap`,
    );
  }

  return provisionBillingForCompany(companyId, {
    billingEmail,
    db: trx,
  });
}

export async function ensureCompanyChartOfAccounts({
  trx,
  companyId,
  userId,
  mode,
  templateName,
}: EnsureCompanyChartOfAccountsInput): Promise<{
  skipped: boolean;
  mode: CompanyCoaMode;
}> {
  const existing = await trx('coa')
    .where({ company_id: companyId })
    .first(['id']);

  if (existing) {
    return { skipped: true, mode };
  }

  const company = await loadProvisionedCompany(trx, companyId);

  if (!company.reporting_currency_id) {
    throw new AppError(`Company ${companyId} missing reporting currency`);
  }

  if (mode === 'default') {
    const response = await createDefaultAccounts({
      trx,
      companyUUID: companyId,
      userId,
      reportingCurrencyId: company.reporting_currency_id,
    });

    if (!response.success) {
      throw new AppError(
        response.message || 'Failed to create default chart of accounts',
        response.error,
      );
    }

    return { skipped: false, mode };
  }

  const response = await loadCoaTemplateForCompany(trx, {
    companyId,
    created_by_id: userId,
    template_name: templateName,
    use_code: true,
  });

  if (!response.success) {
    throw new AppError(
      response.message || 'Failed to provision chart of accounts',
      response.error,
    );
  }

  return { skipped: false, mode };
}

export async function ensureCompanySettings({
  trx,
  companyId,
  userId,
}: {
  trx: Knex.Transaction;
  companyId: string;
  userId: string;
}) {
  const response = await initializeCompanySettings({
    companyId,
    userId,
    trx,
  });

  if (!response.success) {
    throw new AppError(
      response.message || 'Failed to initialize company settings',
      response.error,
    );
  }

  return response.data;
}

export async function ensureWorkspaceRoleGrant({
  trx,
  companyId,
  userId,
  roleKey,
  grantedBy,
}: EnsureWorkspaceRoleGrantInput): Promise<GrantAccessResponse> {
  const result = await upsertDirectCompanyRole({
    trx,
    userId,
    companyUUID: companyId,
    roleKey,
    grantedBy,
  });

  if (result.action !== 'no change') {
    await writeWorkspaceRoleGrantProvisioningAudit({
      companyId,
      entityId: companyId,
      actor: { type: 'user', userId: grantedBy },
      payload: {
        userId,
        roleKey,
        operation: result.action === 'created' ? 'created' : 'updated',
      },
      trx,
    });
  }

  return result;
}

export async function runWorkspaceProvisioningSideEffects({
  companyId,
  userId,
  mode = 'normal',
}: {
  companyId: string;
  userId: string;
  mode?: WorkspaceSideEffectMode;
}): Promise<{ skipped: boolean; enqueued: boolean }> {
  if (mode === 'skip_jobs') {
    return { skipped: true, enqueued: false };
  }

  try {
    const { enqueueFiscalCalendarGeneration } = await import(
      '../reporting/fiscal-calendar/index.js'
    );

    await enqueueFiscalCalendarGeneration({
      type: 'generate-calendar',
      companyId,
      yearsBack: 2,
      yearsForward: 10,
      triggeredBy: 'company_creation',
      userId,
    });

    return { skipped: false, enqueued: true };
  } catch (error) {
    logger.error(
      {
        companyId,
        error: error instanceof Error ? error : new Error(String(error)),
      },
      'Failed to enqueue fiscal calendar generation (non-critical)',
    );

    return { skipped: false, enqueued: false };
  }
}

type WorkspacePipelineResult = {
  firmMeta: {
    companyId: string;
    slug: string;
    created: boolean;
    updated: boolean;
  } | null;
  assignment: { assignedFirmId: string; created: boolean; updated: boolean };
  billing: ProvisionBillingForCompanyResult | null;
  chartOfAccounts: { skipped: boolean; mode: CompanyCoaMode };
  roleGrant: GrantAccessResponse;
  additionalRoleGrants: GrantAccessResponse[];
  pendingSideEffects: {
    companyId: string;
    userId: string;
    mode: WorkspaceSideEffectMode;
  };
};

async function runWorkspacePipeline(
  company: Company,
  plan: ResolvedProvisioningPlan,
  input: ProvisionCompanyWorkspaceInput,
): Promise<WorkspacePipelineResult> {
  const firmMeta = plan.requireFirmMeta
    ? await ensureAccountingFirmMeta({
        trx: input.trx,
        companyId: company.id,
        actorUserId: input.actorUserId,
        meta: {
          company_id: company.id,
          slug: input.company.slug,
          firm_type: input.company.firm_type ?? null,
        },
        allowReservedSlug: plan.allowReservedSlug,
        allowUpdate: plan.allowFirmMetaUpdate,
      })
    : null;

  const assignment = await ensureCompanyFirmAssignment({
    trx: input.trx,
    companyId: company.id,
    actorUserId: input.actorUserId,
    strategy: plan.assignmentStrategy,
    assignedFirmId: input.company.assigned_firm_id,
    allowReassignment: plan.allowReassignment,
  });

  const billing = await ensureCompanyBilling({
    trx: input.trx,
    companyId: company.id,
    billingEmail: input.billingEmail,
  });

  const chartOfAccounts = await ensureCompanyChartOfAccounts({
    trx: input.trx,
    companyId: company.id,
    userId: input.ownerUserId,
    mode: plan.coaMode,
    templateName: plan.coaTemplateName,
  });

  await ensureCompanySettings({
    trx: input.trx,
    companyId: company.id,
    userId: input.ownerUserId,
  });

  const roleGrant = await ensureWorkspaceRoleGrant({
    trx: input.trx,
    companyId: company.id,
    userId: input.ownerUserId,
    roleKey: plan.roleKey,
    grantedBy: input.actorUserId,
  });

  const additionalRoleGrants: GrantAccessResponse[] = [];
  for (const grant of plan.additionalRoleGrants) {
    additionalRoleGrants.push(
      await ensureWorkspaceRoleGrant({
        trx: input.trx,
        companyId: company.id,
        userId: grant.userId,
        roleKey: grant.roleKey,
        grantedBy: input.actorUserId,
      }),
    );
  }

  return {
    firmMeta,
    assignment,
    billing,
    chartOfAccounts,
    roleGrant,
    additionalRoleGrants,
    pendingSideEffects: {
      companyId: company.id,
      userId: input.actorUserId,
      mode: plan.sideEffectMode,
    },
  };
}

export async function provisionCompanyWorkspace(
  input: ProvisionCompanyWorkspaceInput,
): Promise<
  {
    company: Company;
    policy: WorkspaceProvisioningPolicy;
  } & WorkspacePipelineResult
> {
  const plan = resolveProvisioningPlan(input);
  if (plan.requireFirmMeta && !input.company.slug) {
    throw new AppError(
      'Accounting firm workspace provisioning requires a slug',
    );
  }

  const company = await insertCompanyRecord({
    trx: input.trx,
    company: {
      ...input.company,
      workspace_class: plan.workspaceClass,
    },
  });

  return {
    company,
    policy: input.policy,
    ...(await runWorkspacePipeline(company, plan, input)),
  };
}

export async function reconcileCompanyWorkspace(
  input: ReconcileCompanyWorkspaceInput,
): Promise<
  {
    company: Company;
    policy: WorkspaceProvisioningPolicy;
  } & WorkspacePipelineResult
> {
  const plan = resolveProvisioningPlan(input);
  if (plan.requireFirmMeta && !input.company.slug) {
    throw new AppError(
      'Accounting firm workspace provisioning requires a slug',
    );
  }

  const company = await loadCompanyRecord(input.trx, input.companyId);

  return {
    company,
    policy: input.policy,
    ...(await runWorkspacePipeline(company, plan, input)),
  };
}
