import { DemoCompanyType, DemoFilter } from '../../shared/config';
import { resolveFiltersToIds } from '../../shared/utils';
import {
  DEMO_CONTACTS_MAP,
  DemoContactsMap,
  NG_DEMO_CONTACTS,
  US_DEMO_CONTACTS,
} from '../003_contacts/contacts.data';
import {
  DemoProject,
  generateRandomProjects,
  getBusinessProjects,
  getFirmProjects,
} from './projects.utils';

const US_DEMO_FIRM_CONTACT_IDS: string[] = US_DEMO_CONTACTS.accounting_firm.map((c) => c.id);
const NG_DEMO_FIRM_CONTACT_IDS: string[] = NG_DEMO_CONTACTS.accounting_firm.map((c) => c.id);

const US_DEMO_BUSINESS_CONTACT_IDS: string[] = US_DEMO_CONTACTS.business.map((c) => c.id);
const NG_DEMO_BUSINESS_CONTACT_IDS: string[] = NG_DEMO_CONTACTS.business.map((c) => c.id);

const US_FIRM_PROJECTS = [
  ...getFirmProjects(US_DEMO_FIRM_CONTACT_IDS),
  ...generateRandomProjects(5, US_DEMO_FIRM_CONTACT_IDS),
];
const NG_FIRM_PROJECTS = [
  ...getFirmProjects(NG_DEMO_FIRM_CONTACT_IDS),
  ...generateRandomProjects(5, NG_DEMO_FIRM_CONTACT_IDS),
];

const US_BUSINESS_PROJECTS = [
  ...getBusinessProjects(US_DEMO_BUSINESS_CONTACT_IDS, 'US'),
  ...generateRandomProjects(5, US_DEMO_BUSINESS_CONTACT_IDS),
];
const NG_BUSINESS_PROJECTS = [
  ...getBusinessProjects(NG_DEMO_BUSINESS_CONTACT_IDS, 'NG'),
  ...generateRandomProjects(5, NG_DEMO_BUSINESS_CONTACT_IDS),
];

export const US_DEMO_PROJECTS: Record<Exclude<DemoCompanyType, 'individual'>, DemoProject[]> = {
  accounting_firm: US_FIRM_PROJECTS,
  business: US_BUSINESS_PROJECTS,
};
export const NG_DEMO_PROJECTS: Record<Exclude<DemoCompanyType, 'individual'>, DemoProject[]> = {
  accounting_firm: NG_FIRM_PROJECTS,
  business: NG_BUSINESS_PROJECTS,
};

export const US_DEMO_PROJECTS_ARRAY = [...US_FIRM_PROJECTS, ...US_BUSINESS_PROJECTS];
export const NG_DEMO_PROJECTS_ARRAY = [...NG_FIRM_PROJECTS, ...NG_BUSINESS_PROJECTS];

const contacts = DEMO_CONTACTS_MAP;
export type DemoProjectsMap = DemoContactsMap & {
  projects?: DemoProject[];
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
