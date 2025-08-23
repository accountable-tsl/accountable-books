import { faker } from '@faker-js/faker';
import { NewProjectInput, projectStatus } from '../../../../src/domains/projects/projects.types';
import { DemoCompanyType, DemoCountryCode } from '../../shared/config';

export type DemoProject = NewProjectInput & {
  id: string;
};

export const generateDemoProjects = ({
  countryCodes,
  companyTypes,
}: {
  countryCodes: DemoCountryCode[];
  companyTypes: DemoCompanyType[];
}) => {};

export function getFirmProjects(contactIds: string[]): DemoProject[] {
  return [
    {
      id: '0198d37b-036c-7ca3-9c15-d97e21399fd8',
      name: 'Q2 Bookkeeping - Top Clients',
      code: 'BK-Q2',
      description: 'Monthly bookkeeping and reporting for top-tier clients.',
      status: 'in_progress',
      contactId: faker.helpers.arrayElement(contactIds),
      startDate: new Date('2024-04-01'),
      endDate: new Date('2024-06-30'),
    },
    {
      id: '0198d37b-036c-7d4a-8b26-f7f40ff9ede9',
      name: 'Tax Filing 2024',
      code: 'TX-24',
      description: 'Annual tax preparation and compliance project.',
      status: 'in_progress',
      contactId: faker.helpers.arrayElement(contactIds),
      startDate: new Date('2024-01-10'),
      endDate: new Date('2024-04-30'),
    },
  ];
}

export function getBusinessProjects(
  contactIds: string[],
  countryCode: DemoCountryCode,
): DemoProject[] {
  return [
    {
      id: '0198d37b-036c-7802-adcd-837d8480b5ca',
      name: 'E-commerce Site Redesign',
      code: 'ECOM-REDO',
      description: 'Overhaul of online store and UI/UX improvements.',
      status: 'in_progress',
      contactId: faker.helpers.arrayElement(contactIds),
      startDate: new Date('2024-03-01'),
      endDate: new Date('2024-08-01'),
    },
    {
      id: '0198d37b-036c-74ad-87e3-eb0b8e4fdf78',
      name: countryCode === 'NG' ? 'Lagos Mainland Store Launch' : 'Local Market Expansion',
      code: 'EXP-01',
      description:
        countryCode === 'NG'
          ? 'Opening new retail location in Lagos Mainland.'
          : 'Expanding presence to new region.',
      status: 'on_hold',
      contactId: faker.helpers.arrayElement(contactIds),
      startDate: new Date('2024-02-15'),
      endDate: new Date('2024-12-01'),
    },
  ];
}

export function generateRandomProjects(count: number, contactIds: string[]): DemoProject[] {
  return Array.from({ length: count }).map((_, index) => {
    const startDate = faker.date.past({ years: 1 });
    const endDate = faker.date.future({ years: 1, refDate: startDate });

    return {
      id: PROJECTS_UUID[index] || faker.string.uuid(),
      name: faker.company.catchPhrase(),
      code:
        faker.helpers.maybe(() => faker.string.alphanumeric(6).toUpperCase(), {
          probability: 0.7,
        }) ?? null,
      description: faker.lorem.sentence(10),
      status: faker.helpers.arrayElement(projectStatus.options),
      contactId: faker.helpers.arrayElement(contactIds),
      startDate,
      endDate,
    };
  });
}

const PROJECTS_UUID = [
  '0198d388-0c73-7fae-b088-5b09a245d26f',
  '0198d388-0c73-7c22-9329-6d7d7591611e',
  '0198d388-0c74-713c-8903-e1aa7326e478',
  '0198d388-0c74-716e-9bb7-446227800f54',
  '0198d388-0c74-74f7-bcb3-b78248c3b7e1',
  '0198d388-0c74-766f-b586-4a23df8e64e8',
  '0198d388-0c74-7bdf-bc86-2cc85c8aeec9',
  '0198d388-0c74-737e-a482-b62bf2698ab1',
  '0198d388-0c74-7b7b-a3a9-54f00b54c1e5',
  '0198d388-0c74-7998-aa8d-554925e10e63',
];
