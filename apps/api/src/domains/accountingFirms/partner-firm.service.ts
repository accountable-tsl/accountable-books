import type { Knex } from 'knex';

import { AppError } from '../../shared/utils/response.utils.js';
import {
  VEYRA_NG_PARTNER_SLUG,
  VEYRA_US_PARTNER_SLUG,
} from '../companies/workspace-bootstrap.config.js';

type LaunchPartnerFirmIds = {
  defaultPartnerId: string | null;
  nigeriaPartnerId: string | null;
};

type CompanyCountryRow = {
  country_code: string | null;
  id: string;
};

type PartnerFirmLookupRow = {
  company_id: string;
  country_code: string | null;
  slug: string;
};

async function getLaunchPartnerFirmIds(
  trx: Knex.Transaction,
): Promise<LaunchPartnerFirmIds> {
  const rows = await trx('accounting_firms_meta as af')
    .join('companies as c', 'af.company_id', 'c.id')
    .leftJoin('countries as country', 'c.country_id', 'country.id')
    .whereIn('af.slug', [VEYRA_NG_PARTNER_SLUG, VEYRA_US_PARTNER_SLUG])
    .andWhere('c.workspace_class', 'partner')
    .andWhere('c.type', 'accounting_firm')
    .andWhere('c.is_deleted', false)
    .select<
      PartnerFirmLookupRow[]
    >(['af.company_id', 'af.slug', 'country.code as country_code']);

  return {
    nigeriaPartnerId:
      rows.find((row) => row.slug === VEYRA_NG_PARTNER_SLUG)?.company_id ??
      null,
    defaultPartnerId:
      rows.find((row) => row.slug === VEYRA_US_PARTNER_SLUG)?.company_id ??
      null,
  };
}

/**
 * Launch-stage partner routing engine.
 *
 * The consumer should only care whether a valid partner firm ID was resolved.
 * If this returns `null`, the caller can fall back to the platform workspace.
 *
 * Current launch rule:
 * - Nigerian companies route to the Nigeria launch partner when present.
 * - US companies and all other companies route to the default launch partner.
 * - If the Nigeria partner is missing, Nigerian companies fall back to the default partner.
 * - If no launch partner can be resolved, return `null`.
 *
 * Longer-term routing can replace the internals of this function without changing
 * the provisioning consumer contract.
 */
export async function resolvePartnerFirmForCompany({
  trx,
  companyUUID,
}: {
  trx: Knex.Transaction;
  companyUUID: string;
}): Promise<string | null> {
  const company = await trx('companies')
    .leftJoin('countries', 'companies.country_id', 'countries.id')
    .where('companies.id', companyUUID)
    .where('companies.is_deleted', false)
    .select<CompanyCountryRow>({
      country_code: 'countries.code',
      id: 'companies.id',
    })
    .first();

  if (!company) {
    throw new AppError(`Company ${companyUUID} not found`);
  }

  const { defaultPartnerId, nigeriaPartnerId } =
    await getLaunchPartnerFirmIds(trx);

  if (company.country_code === 'NG') {
    return nigeriaPartnerId ?? defaultPartnerId ?? null;
  }

  return defaultPartnerId ?? null;
}
