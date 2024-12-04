import { PrismaClient } from "@prisma/client";
import { Company } from "@prisma/client/wasm";

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
    const result = await prisma.$transaction(async (prisma:any) => {
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
        data: defaultCOA.map((account:any) => ({
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

export async function getCompanies() {
  try {
    const companies = await prisma.company.findMany({      
      select: {
      id: true,
      name: true,
      website: true,
      industry: true,
      teamSize: true,
      revenue: true,
      country: {
        select: {
          id: true,
          code: true,
          name: true,
          phoneCode: true,
          flag: true,
          continent: true,
        },
      },
      reportingCurrency: {
        select: {
          id: true,
          code: true,
          name: true,
          symbol: true,
        },
      },
      createdBy: {
        select: {
          id: true,
          firstname: true,
          lastname: true,
        },
      },
      createdAt: true,
      updatedAt: true,
    }});

    const formattedCompanies = companies.map((company:any) => ({
      id: company.id,
      name: company.name,
      website: company.website,
      industry: company.industry,
      teamSize: company.teamSize,
      revenue: company.revenue,
      countryId: company.country?.id || null,
      countryCode: company.country?.code || null,
      countryName: company.country?.name || null,
      countryPhoneCode: company.country?.phoneCode || null,
      countryFlag: company.country?.flag || null,
      countryContinent: company.country?.continent || null,
      reportingCurrencyId: company.reportingCurrency?.id || null,
      reportingCurrencyCode: company.reportingCurrency?.code || null,
      reportingCurrencyName: company.reportingCurrency?.name || null,
      reportingCurrencySymbol: company.reportingCurrency?.symbol || null,
      createdById: company.createdBy?.id || null,
      createdByFirstname: company.createdBy?.firstname || null,
      createdByLastname: company.createdBy?.lastname || null,
      createdAt: company.createdAt,
      updatedAt: company.updatedAt,
    }));

    return {
      success: true,
      message: "Successfully retrieved all companies",
      data: formattedCompanies
    }
  } catch (error: any) {
    console.error("Error retrieving companies", error);
    return {
      success: false,
      message: "Error retrieving companies",
      error: error.message,
    };
  }
}

export async function getCompany(id: any) {
  try {
    const company: any = await prisma.company.findFirst({
      where: { id },
      select: {
        id: true,
        name: true,
        website: true,
        industry: true,
        teamSize: true,
        revenue: true,
        country: {
          select: {
            id: true,
            code: true,
            name: true,
            phoneCode: true,
            flag: true,
            continent: true,
          },
        },
        reportingCurrency: {
          select: {
            id: true,
            code: true,
            name: true,
            symbol: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
          },
        },
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!company) {
      return {
        success: false,
        message: `Company with ID ${id} not found`,
        data: null,
      };
    }

    const formattedCompany = {
      id: company.id,
      name: company.name,
      website: company.website,
      industry: company.industry,
      teamSize: company.teamSize,
      revenue: company.revenue,
      countryId: company.country?.id || null,
      countryCode: company.country?.code || null,
      countryName: company.country?.name || null,
      countryPhoneCode: company.country?.phoneCode || null,
      countryFlag: company.country?.flag || null,
      countryContinent: company.country?.continent || null,
      reportingCurrencyId: company.reportingCurrency?.id || null,
      reportingCurrencyCode: company.reportingCurrency?.code || null,
      reportingCurrencyName: company.reportingCurrency?.name || null,
      reportingCurrencySymbol: company.reportingCurrency?.symbol || null,
      createdById: company.createdBy?.id || null,
      createdByFirstname: company.createdBy?.firstname || null,
      createdByLastname: company.createdBy?.lastname || null,
      createdAt: company.createdAt,
      updatedAt: company.updatedAt,
    };

    return {
      success: true,
      message: `Successfully retrieved details for company ${company.name}`,
      data: formattedCompany,
    };
  } catch (error: unknown) {
    console.error("Error retrieving company:", error);

    return {
      success: false,
      message: "Error retrieving company details",
      data: null,
      error: (error as Error).message,
    };
  }
}