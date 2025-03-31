import { DebitCredit, FsKey, PrismaClient } from "@prisma/client";
import { Company } from "@prisma/client/wasm";
import generateSecureShortCode from "../utils/generateShortCode";
import e from "express";
import { checkAccountTypeDetails } from "./coaModel";

const prisma = new PrismaClient();

interface CompanyData {
  id?: string;
  shortCode?: string;
  name: string;
  website?: string | undefined;
  industry?: string | undefined;
  teamSize?: string | undefined;
  revenue?: string | undefined;
  countryId: string;
  reportingCurrencyId: string;
  createdById: string;
  yearEndDay: number;
  yearEndMonth: number;
}

interface CreateCompanyResponse {
  success: boolean;
  company?: Company;
  message?: string | {};
  error?: any;
}

interface DefaultCoa {
  accountCode?: string;
  accountName: string;
  description: string;
  accountTypeId: string;
  defaultSide: DebitCredit;
  currencyId: string;
  companyId?: string;
  fsKey?: FsKey;
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
    yearEndDay,
    yearEndMonth,
  } = companyData;

  const validationErrors: Record<string, string> = {};

  // Validation
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    validationErrors.companyName =
      "Company name is required and must be a non-empty string of appropriate length";
  }

  if (
    website &&
    (typeof website !== "string" ||
      website?.trim().length === 0 ||
      website.length > 255)
  ) {
    validationErrors.website = "Website must be a string of appropriate length";
  }

  if (
    industry &&
    (typeof industry !== "string" || industry.trim().length === 0)
  ) {
    validationErrors.industry = "Industry must be a string";
  }

  if (
    teamSize &&
    (typeof teamSize !== "string" ||
      teamSize.trim().length === 0 ||
      teamSize.length > 255)
  ) {
    validationErrors.teamSize = "Team Size must be a string";
  }

  if (
    revenue &&
    (typeof revenue !== "string" ||
      revenue.trim().length === 0 ||
      revenue.length > 255)
  ) {
    validationErrors.revenue = "Revenue must be a string";
  }

  if (!countryId || typeof countryId !== "string") {
    validationErrors.countryId = "Country ID is required";
  }

  if (!reportingCurrencyId || typeof reportingCurrencyId !== "string") {
    validationErrors.reportingCurrencyId = "Reporting Currency ID is required";
  }

  if (!createdById || typeof createdById !== "string") {
    validationErrors.createdById = "Created By ID is required";
  }

  if (Object.keys(validationErrors).length > 0) {
    return {
      success: false,
      message: validationErrors,
    };
  }

  try {
    const result = await prisma.$transaction(async (prisma: any) => {
      //Generate short code
      let shortCode: string;
      let exists;

      do {
        companyData.shortCode && createdById === "testId"
          ? (shortCode = companyData.shortCode)
          : (shortCode = generateSecureShortCode());
        exists = await prisma.company.findUnique({
          where: { shortCode },
        });
      } while (exists);

      if (!shortCode) throw new Error("Short code generation failed");

      // Create the company
      const newCompany = await prisma.company.create({
        data: {
          ...{
            name,
            website,
            industry,
            teamSize,
            revenue,
            countryId,
            reportingCurrencyId,
            createdById,
            shortCode,
          },
          ...(companyData.id && createdById === "testId"
            ? {
                id: companyData.id,
              }
            : {}),
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
          fsKey: true,
        },
      });

      if (defaultCOA.length === 0) {
        console.warn("Default COA template not found");
      } else {
        const accountsNeedingValidation = defaultCOA.filter(
          (account: DefaultCoa) =>
            !account.fsKey || !Object.values(FsKey).includes(account.fsKey)
        );

        const validatedAccounts = await Promise.all(
          accountsNeedingValidation.map(async (account: DefaultCoa) => {
            try {
              const result = await checkAccountTypeDetails({
                accountTypeId: account.accountTypeId,
              });
              if (result.success && result.data?.fsKey) {
                return {
                  ...account,
                  companyId: newCompany.id,
                  currencyId: newCompany.reportingCurrencyId,
                  fsKey: result.data.fsKey,
                };
              }
              return null;
            } catch (error) {
              console.error(
                `Error checking account type for account ${account.accountCode}:`,
                error
              );
              return null;
            }
          })
        );
        // Combine validated accounts with accounts that already have valid fsKey
        const allAccounts = [
          ...defaultCOA.filter(
            (account: DefaultCoa) =>
              account.fsKey && Object.values(FsKey).includes(account.fsKey)
          ),
          ...validatedAccounts.filter((account) => account !== null),
        ];

        if (allAccounts.length === 0) {
          console.warn(
            "No valid COA accounts found; skipping insertion of default COA."
          );
        } else {
          await prisma.coa.createMany({
            data: allAccounts,
          });
        }
      }
      return newCompany;
    });

    const response: CreateCompanyResponse = {
      success: true,
      company: result,
      message: "Company Created, Default Chart of Account Added",
    };

    return response;
  } catch (error: unknown) {
    console.error("Error creating company:", error);

    const response: CreateCompanyResponse = {
      success: false,
      message:
        error instanceof Error
          ? `An error occurred while creating the company: ${error.message}`
          : "An unexpected error occurred while creating the company",
    };

    return response;
  }
}

export async function getCompanies() {
  try {
    const companies = await prisma.company.findMany({
      select: {
        shortCode: true,
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
        updatedAt: false,
      },
    });

    const formattedCompanies = companies.map((company: any) => ({
      id: company.shortCode,
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
      // createdByFirstname: company.createdBy?.firstname || null,
      // createdByLastname: company.createdBy?.lastname || null,
      createdAt: company.createdAt,
    }));

    return {
      success: true,
      message: "Successfully retrieved all companies",
      data: formattedCompanies,
    };
  } catch (error: any) {
    console.error("Error retrieving companies", error);
    return {
      success: false,
      message: "Error retrieving companies",
      error: error.message,
    };
  }
}

export async function getCompany(identifier: string) {
  try {
    if (
      !identifier ||
      typeof identifier !== "string" ||
      identifier.length > 40
    ) {
      return {
        success: false,
        message: "Invalid company identifier",
        data: null,
      };
    }

    const isUUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        identifier
      );

    const company: any = await prisma.company.findFirst({
      where: isUUID ? { id: identifier } : { shortCode: identifier },
      select: {
        shortCode: true,
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
        message: `Company with ID ${identifier} not found`,
        data: null,
      };
    }

    const formattedCompany = {
      id: identifier,
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
      // createdByFirstname: company.createdBy?.firstname || null,
      // createdByLastname: company.createdBy?.lastname || null,
      createdAt: company.createdAt,
      // updatedAt: company.updatedAt,
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
