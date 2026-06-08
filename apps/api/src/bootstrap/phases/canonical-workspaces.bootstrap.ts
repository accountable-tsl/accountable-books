import type { Knex } from 'knex';

import { ENV, isProd } from '../../config/env.js';
import { provisionCompanyWorkspace } from '../../domains/companies/company-provisioning.service.js';
import { upsertDirectCompanyRole } from '../../domains/user-roles/user-roles.model.js';
import { CANONICAL_WORKSPACES } from '../catalogs/workspaces/canonical-workspaces.js';

import type { WorkspaceProvisioningPolicy } from '../../domains/companies/company-provisioning.service.js';
import type { RoleKey } from '../../domains/roles/roles.types.js';
import type {
  CanonicalWorkspaceKey,
  CanonicalWorkspaceSeed,
} from '../catalogs/workspaces/canonical-workspaces.js';
import type { BootstrappedCountry } from './countries.bootstrap.js';
import type { BootstrappedCurrency } from './currencies.bootstrap.js';
import type { SystemUser } from './users.bootstrap.js';

const companiesTable = 'companies';
const accountingFirmsMetaTable = 'accounting_firms_meta';
const clientFirmAssignmentsTable = 'client_firm_assignments';

type BootstrapUser = {
  id: string;
  email: string;
};

type CanonicalWorkspaceAction = 'provisioned' | 'verified';

export type BootstrappedCanonicalWorkspace = {
  key: CanonicalWorkspaceKey;
  id: string;
  short_code: string;
  slug: string;
  workspace_class: 'platform' | 'partner';
  action: CanonicalWorkspaceAction;
};

export type BootstrapCanonicalWorkspacesOptions = {
  systemUser: SystemUser;
  countriesByCode: Record<string, BootstrappedCountry>;
  currenciesByCode: Record<string, BootstrappedCurrency>;
};

type ExistingCompany = {
  id: string;
  legal_name: string;
  display_name: string | null;
  short_code: string;
  type: string;
  workspace_class: string;
  country_id: string;
  reporting_currency_id: string;
  default_timezone: string;
  reporting_framework: string | null;
  accounting_basis: string;
  year_end_day: number;
  year_end_month: number;
  created_by_id: string;
  assigned_firm_id: string | null;
  is_deleted: boolean;
  deleted_at: Date | null;
};

type ExistingFirmMeta = {
  company_id: string;
  slug: string;
};

type ExistingAssignment = {
  client_company_id: string;
  accounting_firm_company_id: string;
};

type ExistingBillingShape = {
  billing_account_id: string;
  owner_company_id: string;
  commercial_mode: string;
  software_payer: string;
  client_billing_account_id: string | null;
};

type ExistingRoleGrant = {
  user_id: string;
  role_key: string;
};

type AdminBootstrapReference = {
  id?: string;
  email?: string;
};

class BootstrapCanonicalWorkspaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BootstrapCanonicalWorkspaceError';
  }
}

function getAdminBootstrapReference(): AdminBootstrapReference {
  return {
    id: isProd ? ENV.ADMIN_ID : ENV.TEST_ADMIN_ID,
    email: (isProd ? ENV.ADMIN_EMAIL : ENV.TEST_ADMIN_EMAIL)
      ?.trim()
      .toLowerCase(),
  };
}

async function resolveBootstrapAdmin(
  trx: Knex.Transaction,
): Promise<BootstrapUser> {
  const reference = getAdminBootstrapReference();

  if (isProd && (!reference.id || !reference.email)) {
    throw new BootstrapCanonicalWorkspaceError(
      'Canonical workspace bootstrap requires both ADMIN_ID and ADMIN_EMAIL in staging/production.',
    );
  }

  if (!reference.id && !reference.email) {
    throw new BootstrapCanonicalWorkspaceError(
      'Canonical workspace bootstrap requires a configured platform admin user.',
    );
  }

  const admin = await trx('users')
    .select('id', 'email')
    .where((builder) => {
      let hasCondition = false;

      if (reference.id) {
        builder.where('id', reference.id);
        hasCondition = true;
      }

      if (reference.email) {
        if (hasCondition) {
          builder.orWhereRaw('LOWER(email) = ?', [reference.email]);
        } else {
          builder.whereRaw('LOWER(email) = ?', [reference.email]);
        }
      }
    })
    .first<BootstrapUser>();

  if (!admin?.id || !admin.email) {
    throw new BootstrapCanonicalWorkspaceError(
      'Canonical workspace bootstrap could not resolve the configured platform admin user.',
    );
  }

  if (reference.id && admin.id !== reference.id) {
    throw new BootstrapCanonicalWorkspaceError(
      `Canonical workspace bootstrap admin mismatch: ADMIN_ID/TEST_ADMIN_ID expected "${reference.id}", but resolved user "${admin.id}".`,
    );
  }

  if (reference.email && admin.email.trim().toLowerCase() !== reference.email) {
    throw new BootstrapCanonicalWorkspaceError(
      `Canonical workspace bootstrap admin mismatch: ADMIN_EMAIL/TEST_ADMIN_EMAIL expected "${reference.email}", but resolved user "${admin.email}".`,
    );
  }

  return { id: admin.id, email: admin.email.trim().toLowerCase() };
}

function requireSeedCountry(
  seed: CanonicalWorkspaceSeed,
  countriesByCode: Record<string, BootstrappedCountry>,
): BootstrappedCountry {
  const country = countriesByCode[seed.countryCode];
  if (!country) {
    throw new BootstrapCanonicalWorkspaceError(
      `Canonical workspace "${seed.key}" references country "${seed.countryCode}", but it was not bootstrapped.`,
    );
  }

  return country;
}

function requireSeedCurrency(
  seed: CanonicalWorkspaceSeed,
  currenciesByCode: Record<string, BootstrappedCurrency>,
): BootstrappedCurrency {
  const currency = currenciesByCode[seed.reportingCurrencyCode];
  if (!currency) {
    throw new BootstrapCanonicalWorkspaceError(
      `Canonical workspace "${seed.key}" references currency "${seed.reportingCurrencyCode}", but it was not bootstrapped.`,
    );
  }

  return currency;
}

function getWorkspacePolicy(
  seed: CanonicalWorkspaceSeed,
): WorkspaceProvisioningPolicy {
  return seed.workspaceClass === 'platform'
    ? { kind: 'platform_bootstrap' }
    : { kind: 'system_seed' };
}

function getWorkspaceRoleKey(seed: CanonicalWorkspaceSeed): RoleKey {
  return seed.workspaceClass === 'platform' ? 'super_admin' : 'admin';
}

async function loadMatchingCompanies(
  trx: Knex.Transaction,
  seed: CanonicalWorkspaceSeed,
): Promise<ExistingCompany[]> {
  return trx(companiesTable)
    .where((builder) =>
      builder.where({ id: seed.id }).orWhere({ short_code: seed.shortCode }),
    )
    .select(
      'id',
      'legal_name',
      'display_name',
      'short_code',
      'type',
      'workspace_class',
      'country_id',
      'reporting_currency_id',
      'default_timezone',
      'reporting_framework',
      'accounting_basis',
      'year_end_day',
      'year_end_month',
      'created_by_id',
      'assigned_firm_id',
      'is_deleted',
      'deleted_at',
    );
}

async function assertNoIdentityCollisions(
  trx: Knex.Transaction,
  seed: CanonicalWorkspaceSeed,
): Promise<void> {
  const matchingCompanies = await loadMatchingCompanies(trx, seed);
  const wrongCompany = matchingCompanies.find(
    (company) => company.id !== seed.id,
  );

  if (wrongCompany) {
    throw new BootstrapCanonicalWorkspaceError(
      `Canonical workspace "${seed.key}" identity collision: short code "${seed.shortCode}" belongs to company ${wrongCompany.id}, expected ${seed.id}.`,
    );
  }

  if (matchingCompanies.length > 1) {
    throw new BootstrapCanonicalWorkspaceError(
      `Canonical workspace "${seed.key}" matched multiple companies by id/short code.`,
    );
  }

  const slugOwner = await trx(accountingFirmsMetaTable)
    .where({ slug: seed.slug })
    .select('company_id', 'slug')
    .first<ExistingFirmMeta>();

  if (slugOwner && slugOwner.company_id !== seed.id) {
    throw new BootstrapCanonicalWorkspaceError(
      `Canonical workspace "${seed.key}" slug collision: slug "${seed.slug}" belongs to company ${slugOwner.company_id}, expected ${seed.id}.`,
    );
  }

  if (seed.workspaceClass === 'platform') {
    const platformWorkspace = await trx(companiesTable)
      .where({ workspace_class: 'platform', is_deleted: false })
      .select('id')
      .first<{ id: string }>();

    if (platformWorkspace && platformWorkspace.id !== seed.id) {
      throw new BootstrapCanonicalWorkspaceError(
        `Canonical platform workspace collision: company ${platformWorkspace.id} is already marked as platform, expected ${seed.id}.`,
      );
    }
  }
}

function collectCompanyInvariantViolations(
  company: ExistingCompany,
  seed: CanonicalWorkspaceSeed,
  country: BootstrappedCountry,
  currency: BootstrappedCurrency,
  admin: BootstrapUser,
): string[] {
  const violations: string[] = [];

  if (company.is_deleted || company.deleted_at !== null) {
    violations.push('company must not be soft-deleted');
  }
  if (company.legal_name !== seed.legalName) {
    violations.push(
      `legal_name expected "${seed.legalName}", found "${company.legal_name}"`,
    );
  }
  if (company.display_name !== seed.displayName) {
    violations.push(
      `display_name expected "${seed.displayName}", found "${company.display_name ?? 'null'}"`,
    );
  }
  if (company.short_code !== seed.shortCode) {
    violations.push(
      `short_code expected "${seed.shortCode}", found "${company.short_code}"`,
    );
  }
  if (company.type !== 'accounting_firm') {
    violations.push(`type expected "accounting_firm", found "${company.type}"`);
  }
  if (company.workspace_class !== seed.workspaceClass) {
    violations.push(
      `workspace_class expected "${seed.workspaceClass}", found "${company.workspace_class}"`,
    );
  }
  if (company.country_id !== country.id) {
    violations.push(
      `country_id expected "${country.id}", found "${company.country_id}"`,
    );
  }
  if (company.reporting_currency_id !== currency.id) {
    violations.push(
      `reporting_currency_id expected "${currency.id}", found "${company.reporting_currency_id}"`,
    );
  }
  if (company.default_timezone !== seed.defaultTimezone) {
    violations.push(
      `default_timezone expected "${seed.defaultTimezone}", found "${company.default_timezone}"`,
    );
  }
  if (company.reporting_framework !== seed.reportingFramework) {
    violations.push(
      `reporting_framework expected "${seed.reportingFramework}", found "${company.reporting_framework ?? 'null'}"`,
    );
  }
  if (company.accounting_basis !== 'modified_accrual_basis') {
    violations.push(
      `accounting_basis expected "modified_accrual_basis", found "${company.accounting_basis}"`,
    );
  }
  if (company.year_end_day !== 31 || company.year_end_month !== 12) {
    violations.push(
      `year_end expected "31/12", found "${company.year_end_day}/${company.year_end_month}"`,
    );
  }
  if (company.created_by_id !== admin.id) {
    violations.push(
      `created_by_id expected admin "${admin.id}", found "${company.created_by_id}"`,
    );
  }
  if (company.assigned_firm_id !== seed.id) {
    violations.push(
      `assigned_firm_id expected "${seed.id}", found "${company.assigned_firm_id ?? 'null'}"`,
    );
  }

  return violations;
}

async function verifyExistingCanonicalWorkspace(
  trx: Knex.Transaction,
  seed: CanonicalWorkspaceSeed,
  country: BootstrappedCountry,
  currency: BootstrappedCurrency,
  admin: BootstrapUser,
): Promise<BootstrappedCanonicalWorkspace> {
  const [company] = await loadMatchingCompanies(trx, seed);

  if (!company) {
    throw new BootstrapCanonicalWorkspaceError(
      `Canonical workspace "${seed.key}" disappeared during bootstrap verification.`,
    );
  }

  const violations = collectCompanyInvariantViolations(
    company,
    seed,
    country,
    currency,
    admin,
  );

  const firmMeta = await trx(accountingFirmsMetaTable)
    .where({ company_id: seed.id })
    .select('company_id', 'slug')
    .first<ExistingFirmMeta>();

  if (!firmMeta) {
    violations.push(`firm metadata is missing for company ${seed.id}`);
  } else if (firmMeta.slug !== seed.slug) {
    violations.push(`slug expected "${seed.slug}", found "${firmMeta.slug}"`);
  }

  const assignment = await trx(clientFirmAssignmentsTable)
    .where({ client_company_id: seed.id, is_deleted: false })
    .select('client_company_id', 'accounting_firm_company_id')
    .first<ExistingAssignment>();

  if (!assignment) {
    violations.push(
      `active self firm assignment is missing for company ${seed.id}`,
    );
  } else if (assignment.accounting_firm_company_id !== seed.id) {
    violations.push(
      `active firm assignment expected "${seed.id}", found "${assignment.accounting_firm_company_id}"`,
    );
  }

  const billing = await trx('workspace_billing_ownership as ownership')
    .join(
      'billing_accounts as account',
      'account.id',
      'ownership.billing_account_id',
    )
    .where({
      'ownership.workspace_company_id': seed.id,
      'ownership.ended_at': null,
    })
    .select(
      'ownership.billing_account_id',
      'ownership.commercial_mode',
      'ownership.software_payer',
      'ownership.client_billing_account_id',
      'account.owner_company_id',
    )
    .first<ExistingBillingShape>();

  if (!billing) {
    violations.push(
      `active billing ownership is missing for company ${seed.id}`,
    );
  } else {
    if (billing.owner_company_id !== seed.id) {
      violations.push(
        `billing account owner expected "${seed.id}", found "${billing.owner_company_id}"`,
      );
    }
    if (billing.commercial_mode !== 'firm_internal') {
      violations.push(
        `billing commercial_mode expected "firm_internal", found "${billing.commercial_mode}"`,
      );
    }
    if (billing.software_payer !== 'billing_account') {
      violations.push(
        `billing software_payer expected "billing_account", found "${billing.software_payer}"`,
      );
    }
    if (billing.client_billing_account_id !== null) {
      violations.push(
        `billing client_billing_account_id expected null, found "${billing.client_billing_account_id}"`,
      );
    }
  }

  const coa = await trx('coa')
    .where({ company_id: seed.id, is_deleted: false })
    .first<{ id: string }>('id');

  if (!coa) {
    violations.push(`chart of accounts is missing for company ${seed.id}`);
  }

  const settings = await trx('company_settings')
    .where({ company_id: seed.id, is_deleted: false })
    .first<{ company_id: string }>('company_id');

  if (!settings) {
    violations.push(`company settings are missing for company ${seed.id}`);
  }

  const adminRole = await trx('user_company_roles as ucr')
    .join('roles as role', 'role.id', 'ucr.role_id')
    .where({
      'ucr.company_id': seed.id,
      'ucr.user_id': admin.id,
      'ucr.is_deleted': false,
      'role.key': getWorkspaceRoleKey(seed),
    })
    .select('ucr.user_id', 'role.key as role_key')
    .first<ExistingRoleGrant>();

  if (!adminRole) {
    violations.push(
      `admin role "${getWorkspaceRoleKey(seed)}" is missing for user ${admin.id}`,
    );
  }

  if (violations.length > 0) {
    throw new BootstrapCanonicalWorkspaceError(
      `Canonical workspace "${seed.key}" already exists but failed verification: ${violations.join('; ')}.`,
    );
  }

  return {
    key: seed.key,
    id: company.id,
    short_code: company.short_code,
    slug: seed.slug,
    workspace_class: seed.workspaceClass,
    action: 'verified',
  };
}

async function provisionCanonicalWorkspace(
  trx: Knex.Transaction,
  seed: CanonicalWorkspaceSeed,
  input: {
    admin: BootstrapUser;
    systemUser: SystemUser;
    country: BootstrappedCountry;
    currency: BootstrappedCurrency;
  },
): Promise<BootstrappedCanonicalWorkspace> {
  const result = await provisionCompanyWorkspace({
    trx,
    actorUserId: input.systemUser.id,
    ownerUserId: input.admin.id,
    billingEmail: input.admin.email,
    policy: getWorkspacePolicy(seed),
    company: {
      id: seed.id,
      legal_name: seed.legalName,
      display_name: seed.displayName,
      short_code: seed.shortCode,
      type: 'accounting_firm',
      country_id: input.country.id,
      reporting_currency_id: input.currency.id,
      default_timezone: seed.defaultTimezone,
      reporting_framework: seed.reportingFramework,
      created_by_id: input.admin.id,
      year_end_day: 31,
      year_end_month: 12,
      accounting_basis: 'modified_accrual_basis',
      workspace_class: seed.workspaceClass,
      onboarding_state: {
        steps: {
          company_details_confirmed: true,
          first_bank_account_added: true,
        },
        completed_at: {
          company_details_confirmed: new Date(),
          first_bank_account_added: new Date(),
        },
        metadata: null,
      },
      slug: seed.slug,
      firm_type: null,
      coa_template_name: seed.coaTemplateName,
      skip_side_effects: true,
    },
  });

  return {
    key: seed.key,
    id: result.company.id,
    short_code: result.company.short_code,
    slug: seed.slug,
    workspace_class: seed.workspaceClass,
    action: 'provisioned',
  };
}

async function ensureAdminRoleGrant(
  trx: Knex.Transaction,
  seed: CanonicalWorkspaceSeed,
  admin: BootstrapUser,
  systemUser: SystemUser,
): Promise<void> {
  await upsertDirectCompanyRole({
    trx,
    userId: admin.id,
    companyUUID: seed.id,
    roleKey: getWorkspaceRoleKey(seed),
    grantedBy: systemUser.id,
  });
}

export async function bootstrapCanonicalWorkspaces(
  trx: Knex.Transaction,
  options: BootstrapCanonicalWorkspacesOptions,
): Promise<{
  canonicalWorkspacesByKey: Record<
    CanonicalWorkspaceKey,
    BootstrappedCanonicalWorkspace
  >;
  adminUserId: string;
}> {
  const admin = await resolveBootstrapAdmin(trx);
  const bootstrapped: BootstrappedCanonicalWorkspace[] = [];

  for (const seed of CANONICAL_WORKSPACES) {
    const country = requireSeedCountry(seed, options.countriesByCode);
    const currency = requireSeedCurrency(seed, options.currenciesByCode);

    await assertNoIdentityCollisions(trx, seed);
    const [existing] = await loadMatchingCompanies(trx, seed);

    if (!existing) {
      const workspace = await provisionCanonicalWorkspace(trx, seed, {
        admin,
        systemUser: options.systemUser,
        country,
        currency,
      });
      bootstrapped.push(workspace);
      continue;
    }

    const workspace = await verifyExistingCanonicalWorkspace(
      trx,
      seed,
      country,
      currency,
      admin,
    );
    bootstrapped.push(workspace);
  }

  return {
    canonicalWorkspacesByKey: Object.fromEntries(
      bootstrapped.map((workspace) => [workspace.key, workspace]),
    ) as Record<CanonicalWorkspaceKey, BootstrappedCanonicalWorkspace>,
    adminUserId: admin.id,
  };
}
