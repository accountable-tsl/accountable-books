import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface CompanyData {
  id?: string;
  name: string;
  countryId: number;
  reportingCurrencyId: number;
}

interface CreateCompanyWithCOAResponse {
  success: boolean;
  company?: any;
  message: string;
  error?: any;
}

export async function createCompanyWithCOA(
  companyData: CompanyData,
  createdById: number
): Promise<CreateCompanyWithCOAResponse> {
  try {
    const { id, name, countryId, reportingCurrencyId } = companyData;

    // Start a Prisma transaction to ensure atomicity
    const company = await prisma.$transaction(async (prisma: any) => {
      // 1. Create the company
      const newCompany = await prisma.company.create({
        data: {
          id,
          name,
          countryId,
          reportingCurrencyId,
          createdById,
        },
      });

      // Log after company creation to confirm it was created
      console.log("Company created:", newCompany);

      // 2. Fetch the default COA template
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

      // If the default COA template is not found, throw an error
      if (defaultCOA.length === 0) {
        throw new Error("Default COA template not found");
      }

      console.log(defaultCOA.length);

      // 3. Create COA entries for the new company
      const insertedCOAs = await prisma.coa.createMany({
        data: defaultCOA.map((account: any) => ({
          accountCode: account.accountCode,
          accountName: account.accountName,
          accountTypeId: account.accountTypeId,
          defaultSide: account.defaultSide as "debit" | "credit",
          description: account.description,
          companyId: newCompany.id, // Associate COA with the newly created company
          currencyId: newCompany.reportingCurrencyId, // Use the company's reporting currency
        })),
      });

      console.log(`Inserted ${insertedCOAs.count} COAs`);
      console.log("Default COA created for company:", newCompany.id);
      return newCompany;
    });

    // Return a success response with the created company
    return {
      success: true,
      company,
      message: "Company and default COA created successfully",
    };
  } catch (error: any) {
    // Log the error before returning it
    console.error("Error in createCompanyWithCOA:", error);

    // Return an error response if anything goes wrong
    return {
      success: false,
      message: "Error creating company and COA",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
