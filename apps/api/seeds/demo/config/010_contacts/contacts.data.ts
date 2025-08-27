import type { Knex } from 'knex';
import type { DemoCompanyType, DemoFilter } from '../../shared/config.js';
import { getDemoCompanies } from '../../shared/utils.js';
import { generateDemoCompaniesMap } from '../002_companies/companies.data.js';
import { demoContactsByCompanyMap, type DemoContact } from './contacts.state.js';
import { generateRandomContacts } from './contacts.utils.js';
import * as ngContacts from './raw/ng_contacts.json';
import * as usContacts from './raw/us_contacts.json';

export type DemoContactData = {
  displayName: string;
  email: string;
  address?: string;
  notes?: string;
  status?: 'active' | 'inactive';
};

// Single type for contact mapping - contacts can be with or without IDs
export type CompanyContactsMap<T = DemoContactData> = {
  company: { id: string; shortCode: string; companyType: DemoCompanyType };
  user: { id: string; email: string };
  country: { code: string };
  contacts: T[];
};

/**
 * Get contact data for a specific company type and country
 */
function getContactsForCompanyType(
  companyType: DemoCompanyType,
  countryCode: string,
): DemoContactData[] {
  const randomContacts = generateRandomContacts();

  if (countryCode === 'NG') {
    switch (companyType) {
      case 'business':
        return [...ngContacts.business, ...randomContacts];
      case 'accounting_firm':
        return [...ngContacts.business, ...ngContacts.firm, ...randomContacts];
      case 'individual':
        return [...ngContacts.individual, ...randomContacts];
    }
  }

  if (countryCode === 'US') {
    switch (companyType) {
      case 'business':
        return [...usContacts.business, ...randomContacts];
      case 'accounting_firm':
        return [...usContacts.business, ...usContacts.firm, ...randomContacts];
      case 'individual':
        return [...usContacts.individual, ...randomContacts];
    }
  }

  return randomContacts;
}

/**
 * Get raw contact data for insertion (used during creation phase)
 */
export const getRawContactsForInsertion = async (
  trx: Knex,
  filters?: DemoFilter,
): Promise<CompanyContactsMap[]> => {
  const companies = await getDemoCompanies(trx, filters);
  const companiesMap = generateDemoCompaniesMap(filters);

  return companies.map((company) => {
    const companyMapData = companiesMap.find((c) => c.company.shortCode === company.short_code);
    if (!companyMapData) {
      throw new Error(`Company map data not found for ${company.short_code}`);
    }

    return {
      company: {
        id: company.id,
        shortCode: company.short_code,
        companyType: companyMapData.company.companyType,
      },
      user: {
        id: companyMapData.user.id || '',
        email: companyMapData.user.email,
      },
      country: companyMapData.country,
      contacts: getContactsForCompanyType(
        companyMapData.company.companyType,
        companyMapData.country.code,
      ),
    };
  });
};

/**
 * Get demo contacts map from created contacts (reads from state)
 * This should be called AFTER contacts have been created and stored in demoContactsByCompanyMap
 */
export const generateDemoContactsMap = async (
  trx: Knex,
  filters?: DemoFilter,
): Promise<CompanyContactsMap<DemoContact>[]> => {
  if (demoContactsByCompanyMap.size === 0) {
    throw new Error(
      'generateDemoContactsMap called before contacts were created. ' +
        'Call createDemoContacts(trx, filters) first.',
    );
  }

  const companies = await getDemoCompanies(trx, filters);
  const companiesMap = generateDemoCompaniesMap(filters);

  return companies.map((company) => {
    const companyMapData = companiesMap.find((c) => c.company.shortCode === company.short_code);
    if (!companyMapData) {
      throw new Error(`Company map data not found for ${company.short_code}`);
    }

    return {
      company: {
        id: company.id,
        shortCode: company.short_code,
        companyType: companyMapData.company.companyType,
      },
      user: {
        id: companyMapData.user.id ?? '',
        email: companyMapData.user.email,
      },
      country: companyMapData.country,
      contacts: demoContactsByCompanyMap.get(company.id) || [],
    };
  });
};
