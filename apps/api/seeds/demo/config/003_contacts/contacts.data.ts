import { ContactInput } from '../../../../src/domains/contacts/contact.types.js';
import { DemoCompanyType, DemoFilter } from '../../shared/config.js';
import { resolveFiltersToIds } from '../../shared/utils.js';
import { DemoUser, NG_USER, US_USER } from '../001_users/users.data.js';
import {
  DEMO_COMPANIES_MAP,
  DemoCompaniesMap,
  DemoCompany,
  NG_DEMO_COMPANIES,
  US_DEMO_COMPANIES,
} from '../002_companies/companies.data.js';
import { generateRandomContacts } from './contacts.utils.js';
import * as ngContacts from './raw/ng_contacts.json';
import * as usContacts from './raw/us_contacts.json';

export type DemoContact = ContactInput & {
  id: string;
};
const randomContacts: DemoContact[] = generateRandomContacts();

const NG_BIZ_CONTACTS = [...ngContacts.business, ...randomContacts];
const NG_FIRM_CONTACTS = [...ngContacts.business, ...ngContacts.firm, ...randomContacts];
const NG_IND_CONTACTS = [...ngContacts.individual, ...randomContacts];
export const NG_DEMO_CONTACTS: Record<DemoCompanyType, DemoContact[]> = {
  business: NG_BIZ_CONTACTS,
  accounting_firm: NG_FIRM_CONTACTS,
  individual: NG_IND_CONTACTS,
};
const NG_DEMO_CONTACTS_ARRAY = [...NG_BIZ_CONTACTS, ...NG_FIRM_CONTACTS, ...NG_IND_CONTACTS];

const US_BIZ_CONTACTS = [...usContacts.business, ...randomContacts];
const US_FIRM_CONTACTS = [...usContacts.business, ...usContacts.firm, ...randomContacts];
const US_IND_CONTACTS = [...usContacts.individual, ...randomContacts];
export const US_DEMO_CONTACTS: Record<DemoCompanyType, DemoContact[]> = {
  business: US_BIZ_CONTACTS,
  accounting_firm: US_FIRM_CONTACTS,
  individual: US_IND_CONTACTS,
};
const US_DEMO_CONTACTS_ARRAY = [...US_BIZ_CONTACTS, ...US_FIRM_CONTACTS, ...US_IND_CONTACTS];
export const DEMO_CONTACTS: DemoContact[] = [...NG_DEMO_CONTACTS_ARRAY, ...US_DEMO_CONTACTS_ARRAY];

export type DemoContactsMap = DemoCompaniesMap & {
  contacts: DemoContact[];
};

export const generateDemoContactsMap = (filters?: DemoFilter): DemoContactsMap[] => {
  const map = DEMO_COMPANIES_MAP.map((c) => {
    if (c.countryCode === 'NG') {
      return {
        ...c,
        contacts: NG_DEMO_CONTACTS[c.company.companyType],
      };
    }
    if (c.countryCode === 'US') {
      return {
        ...c,
        contacts: US_DEMO_CONTACTS[c.company.companyType],
      };
    }
    return {
      ...c,
      contacts: [],
    };
  });

  const filteredMap = filters
    ? map.filter((input) => resolveFiltersToIds(filters).includes(input.company.id))
    : map;
  return filteredMap;
};

export const DEMO_CONTACTS_MAP: DemoContactsMap[] = generateDemoContactsMap();
