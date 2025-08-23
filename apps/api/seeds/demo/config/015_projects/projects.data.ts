import { DemoCompanyType, DemoFilter } from '../../shared/config';
import { resolveFiltersToIds } from '../../shared/utils';
import {
  DEMO_CONTACTS_MAP,
  DemoContactsMap,
  NG_DEMO_CONTACTS,
  US_DEMO_CONTACTS,
} from '../010_contacts/contacts.data';
import {
  SeedProject,
  generateRandomProjects,
  getBusinessProjects,
  getFirmProjects,
} from './projects.utils';

const US_FIRM_PROJECTS: SeedProject[] = [...getFirmProjects(), ...generateRandomProjects(5)];
const NG_FIRM_PROJECTS: SeedProject[] = [...getFirmProjects(), ...generateRandomProjects(5)];

const US_BUSINESS_PROJECTS: SeedProject[] = [
  ...getBusinessProjects('US'),
  ...generateRandomProjects(5),
];
const NG_BUSINESS_PROJECTS: SeedProject[] = [
  ...getBusinessProjects('NG'),
  ...generateRandomProjects(5),
];

export const US_DEMO_PROJECTS: Record<Exclude<DemoCompanyType, 'individual'>, SeedProject[]> = {
  accounting_firm: US_FIRM_PROJECTS,
  business: US_BUSINESS_PROJECTS,
};
export const NG_DEMO_PROJECTS: Record<Exclude<DemoCompanyType, 'individual'>, SeedProject[]> = {
  accounting_firm: NG_FIRM_PROJECTS,
  business: NG_BUSINESS_PROJECTS,
};

export const US_DEMO_PROJECTS_ARRAY = [...US_FIRM_PROJECTS, ...US_BUSINESS_PROJECTS];
export const NG_DEMO_PROJECTS_ARRAY = [...NG_FIRM_PROJECTS, ...NG_BUSINESS_PROJECTS];

const contacts = DEMO_CONTACTS_MAP;
export type DemoProjectsMap = DemoContactsMap & {
  projects?: SeedProject[];
};
export const generateDemoProjectsMap = (filters?: DemoFilter): DemoProjectsMap[] => {
  const map = DEMO_CONTACTS_MAP.map((c) => {
    // No projects for individual companies
    if (c.companyType === 'individual') return { ...c };

    if (c.countryCode === 'NG') {
      return {
        ...c,
        projects: NG_DEMO_PROJECTS[c.companyType],
      };
    }
    if (c.countryCode === 'US') {
      return {
        ...c,
        projects: US_DEMO_PROJECTS[c.companyType],
      };
    }
    return {
      ...c,
      projects: [],
    };
  });

  const filteredMap = filters
    ? map.filter((input) => resolveFiltersToIds(filters).includes(input.company.id))
    : map;
  return filteredMap;
};

const DEMO_PROJECTS_MAP: DemoProjectsMap[] = generateDemoProjectsMap();
