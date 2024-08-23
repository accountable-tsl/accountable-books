import { PrismaClient, Company } from "@prisma/client";

const prisma = new PrismaClient();

interface CompanyData {
  name: string;
  website?: string | undefined;
  industry?: string | undefined;
  teamSize?: string | undefined;
  revenue?: string | undefined;
  countryId: number;
  reportingCurrencyId: number;
  createdById: number;
}

interface CreateCompanyResponse {
  success: boolean;
  company?: Company;
  message?: string | {};
  error?: any;
}

export async function createACompany(
  companyData: CompanyData
): Promise<CreateCompanyResponse> {
  const {
    name,
    website,
    industry,
    teamSize,
    revenue,
    countryId,
    reportingCurrencyId,
    createdById,
  } = companyData;

  const validationErrors: Record<string, string> = {};

  // Validation
  if (!name || typeof name !== "string") {
    validationErrors.companyName =
      "Company name is required and must be a string";
  }

  if (website && typeof website !== "string") {
    validationErrors.website = "Website must be a string";
  }

  if (industry && typeof industry !== "string") {
    validationErrors.industry = "Industry must be a string";
  }

  if (teamSize && typeof teamSize !== "string") {
    validationErrors.teamSize = "Team Size must be a string";
  }

  if (revenue && typeof revenue !== "string") {
    validationErrors.revenue = "Revenue must be a string";
  }

  if (!countryId || typeof countryId !== "number") {
    validationErrors.countryId = "Country ID is required and must be a number";
  }

  if (!reportingCurrencyId || typeof reportingCurrencyId !== "number") {
    validationErrors.reportingCurrencyId =
      "Reporting Currency ID is required and must be a number";
  }

  if (!createdById || typeof createdById !== "number") {
    validationErrors.createdById =
      "Created By ID is required and must be a number";
  }

  if (Object.keys(validationErrors).length > 0) {
    return {
      success: false,
      message: validationErrors,
    };
  }

  try {
    const result = await prisma.$transaction(async (prisma) => {
      // Create the company
      const newCompany = await prisma.company.create({
        data: {
          name,
          website,
          industry,
          teamSize,
          revenue,
          countryId,
          reportingCurrencyId,
          createdById,
        },
      });

      // Fetch the default COA template
      const defaultCOA = await prisma.coaTemplate.findMany({
        where: { templateName: "Default Template" },
        select: {
          accountCode: true,
          accountName: true,
          accountTypeId: true,
          defaultSide: true,
          description: true,
        },
      });

      if (defaultCOA.length === 0) {
        throw new Error("Default COA template not found");
      }

      //Create COA entries for the new company
      await prisma.coa.createMany({
        data: defaultCOA.map((account) => ({
          ...account,
          companyId: newCompany.id,
          currencyId: newCompany.reportingCurrencyId,
        })),
      });

      return newCompany;
    });

    const response: CreateCompanyResponse = {
      success: true,
      company: result,
      message: "Company Created, Default Chart of Account Added",
    };

    return response;
  } catch (error: unknown) {
    const response: CreateCompanyResponse = {
      success: false,
      message: "An error occurred while creating the company",
    };

    console.error("Error creating company:", String(error));

    return response;
  }
}
