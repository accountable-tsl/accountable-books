import type { Knex } from 'knex';
import type { DemoCompanyType, DemoFilter, DemoCountryCode } from '../../shared/config.js';
import { getDemoCompanies } from '../../shared/utils.js';
import { generateDemoCompaniesMap } from '../002_companies/companies.data.js';
import { demoProjectsByCompanyMap, type DemoProject } from './projects.state.js';
import {
  type SeedProject,
  generateRandomProjects,
  getBusinessProjects,
  getFirmProjects,
} from './projects.utils.js';

export type DemoProjectData = SeedProject;

export type CompanyProjectsMap<T = DemoProject> = {
  company: { id: string; shortCode: string; companyType: DemoCompanyType };
  user: { id: string };
  country: { code: DemoCountryCode };
  projects: T[];
};

/**
 * Get project data for a specific company type and country
 */
function getProjectsForCompanyType(
  companyType: DemoCompanyType,
  countryCode: DemoCountryCode,
): DemoProjectData[] {
  // Individual companies don't have projects
  if (companyType === 'individual') {
    return [];
  }

  const randomProjects = generateRandomProjects(5);

  if (companyType === 'accounting_firm') {
    return [...getFirmProjects(), ...randomProjects];
  }

  if (companyType === 'business') {
    return [...getBusinessProjects(countryCode), ...randomProjects];
  }

  return [];
}

/**
 * Get raw project data for insertion (used during creation phase)
 */
export const getRawProjectsForInsertion = async (
  trx: Knex,
  filters?: DemoFilter,
): Promise<CompanyProjectsMap<DemoProjectData>[]> => {
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
      user: companyMapData.user,
      country: companyMapData.country,
      projects: getProjectsForCompanyType(
        companyMapData.company.companyType,
        companyMapData.country.code,
      ),
    };
  });
};

/**
 * Get demo projects map from created projects (reads from state)
 * This should be called AFTER projects have been created and stored in demoProjectsByCompanyMap
 * For automatic creation, use getOrCreateDemoProjectsMap instead
 */
export const generateDemoProjectsMap = async (
  trx: Knex,
  filters?: DemoFilter,
): Promise<CompanyProjectsMap[]> => {
  if (demoProjectsByCompanyMap.size === 0) {
    throw new Error(
      'generateDemoProjectsMap called before projects were created. ' +
        'Use getOrCreateDemoProjectsMap(trx, filters) instead for automatic creation, ' +
        'or call createDemoProjects(trx, filters) first.',
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
      user: companyMapData.user,
      country: companyMapData.country,
      projects: demoProjectsByCompanyMap.get(company.id) || [],
    };
  });
};
