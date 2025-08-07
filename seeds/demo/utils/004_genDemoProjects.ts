import {
  NewProjectInput,
  projectStatus,
} from "../../../src/domains/projects/projects.types";
import { companyType as ct } from "../../../src/domains/companies/companies.types";
import { faker } from "@faker-js/faker";

type GenerateDemoProjectsParams = {
  companyType: string;
  countryCode: string;
  contactIds: string[]; // 👈 required input
};

export function generateDemoProjectsForCompany({
  companyType,
  countryCode,
  contactIds,
}: GenerateDemoProjectsParams): NewProjectInput[] {
  if (companyType === ct.enum.individual || contactIds.length === 0) return [];

  const coreProjects =
    companyType === ct.enum.accounting_firm
      ? getFirmProjects(contactIds)
      : getBusinessProjects(contactIds, countryCode);

  const randomProjects = generateRandomProjects(5, contactIds);

  return [...coreProjects, ...randomProjects];
}

function getFirmProjects(contactIds: string[]): NewProjectInput[] {
  return [
    {
      name: "Q2 Bookkeeping - Top Clients",
      code: "BK-Q2",
      description: "Monthly bookkeeping and reporting for top-tier clients.",
      status: "in_progress",
      contactId: faker.helpers.arrayElement(contactIds),
      startDate: new Date("2024-04-01"),
      endDate: new Date("2024-06-30"),
    },
    {
      name: "Tax Filing 2024",
      code: "TX-24",
      description: "Annual tax preparation and compliance project.",
      status: "in_progress",
      contactId: faker.helpers.arrayElement(contactIds),
      startDate: new Date("2024-01-10"),
      endDate: new Date("2024-04-30"),
    },
  ];
}

function getBusinessProjects(
  contactIds: string[],
  countryCode: string
): NewProjectInput[] {
  return [
    {
      name: "E-commerce Site Redesign",
      code: "ECOM-REDO",
      description: "Overhaul of online store and UI/UX improvements.",
      status: "in_progress",
      contactId: faker.helpers.arrayElement(contactIds),
      startDate: new Date("2024-03-01"),
      endDate: new Date("2024-08-01"),
    },
    {
      name:
        countryCode === "NG"
          ? "Lagos Mainland Store Launch"
          : "Local Market Expansion",
      code: "EXP-01",
      description:
        countryCode === "NG"
          ? "Opening new retail location in Lagos Mainland."
          : "Expanding presence to new region.",
      status: "on_hold",
      contactId: faker.helpers.arrayElement(contactIds),
      startDate: new Date("2024-02-15"),
      endDate: new Date("2024-12-01"),
    },
  ];
}

function generateRandomProjects(
  count: number,
  contactIds: string[]
): NewProjectInput[] {
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
      contactId: faker.helpers.arrayElement(contactIds),
      startDate,
      endDate,
    };
  });
}
