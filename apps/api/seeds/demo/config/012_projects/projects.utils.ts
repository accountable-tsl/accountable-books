import { faker } from '@faker-js/faker';
import {
  NewProjectInput,
  projectStatus,
} from '../../../../src/domains/projects/projects.types';
import { DemoCompanyType, DemoCountryCode } from '../../shared/config';

// Projects seed template without IDs or contact references.
export type SeedProject = Omit<NewProjectInput, 'id' | 'contactId'> & {
  // Optional hint to attach to a specific contact by name
  contactNameHint?: string;
};

export const generateDemoProjects = ({
  countryCodes,
  companyTypes,
}: {
  countryCodes: DemoCountryCode[];
  companyTypes: DemoCompanyType[];
}) => {};

export function getFirmProjects(): SeedProject[] {
  return [
    {
      name: 'Q2 Bookkeeping - Top Clients',
      code: 'BK-Q2',
      description: 'Monthly bookkeeping and reporting for top-tier clients.',
      status: 'in_progress',
      startDate: new Date('2024-04-01'),
      endDate: new Date('2024-06-30'),
    },
    {
      name: 'Tax Filing 2024',
      code: 'TX-24',
      description: 'Annual tax preparation and compliance project.',
      status: 'in_progress',
      startDate: new Date('2024-01-10'),
      endDate: new Date('2024-04-30'),
    },
  ];
}

export function getBusinessProjects(
  countryCode: DemoCountryCode,
): SeedProject[] {
  return [
    {
      name: 'E-commerce Site Redesign',
      code: 'ECOM-REDO',
      description: 'Overhaul of online store and UI/UX improvements.',
      status: 'in_progress',
      startDate: new Date('2024-03-01'),
      endDate: new Date('2024-08-01'),
    },
    {
      name:
        countryCode === 'NG'
          ? 'Lagos Mainland Store Launch'
          : 'Local Market Expansion',
      code: 'EXP-01',
      description:
        countryCode === 'NG'
          ? 'Opening new retail location in Lagos Mainland.'
          : 'Expanding presence to new region.',
      status: 'on_hold',
      startDate: new Date('2024-02-15'),
      endDate: new Date('2024-12-01'),
    },
  ];
}

export function generateRandomProjects(count: number): SeedProject[] {
  return Array.from({ length: count }).map(() => {
    const startDate = faker.date.past({ years: 1 });
    const endDate = faker.date.future({ years: 1, refDate: startDate });

    return {
      name: faker.company.catchPhrase(),
      code:
        faker.helpers.maybe(() => faker.string.alphanumeric(6).toUpperCase(), {
          probability: 0.7,
        }) ?? null,
      description: faker.lorem.sentence(10),
      status: faker.helpers.arrayElement(projectStatus.options),
      startDate,
      endDate,
    };
  });
}
