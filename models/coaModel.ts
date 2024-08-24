import { DefaultSide, PrismaClient } from "@prisma/client";
import { Interface } from "readline";
import { toTitleCase, truncateText } from "../utils/utils";
import { parseCSVFile, validateCSVRow } from "../utils/csvUtils";
const prisma = new PrismaClient();

//Get all account types
export async function getAllAccountTypes() {
  try {
    const allAccountTypes = await prisma.accountType.findMany({
      select: {
        id: true,
        typeName: true,
        accountElement: {
          select: {
            elementName: true,
            parent: { select: { elementName: true } },
          },
        },
        description: true,
      },
    });

    const formattedAccountTypes = allAccountTypes.map((type) => ({
      id: type.id,
      typeName: type.typeName,
      accountElementChild: type.accountElement?.elementName,
      accountElementParent: type.accountElement?.parent?.elementName,
      description: type.description,
    }));

    return {
      success: true,
      message: "Successfully retrieved all account types",
      data: formattedAccountTypes,
    };
  } catch (error: any) {
    console.error("Error getting account types", error);
    return { success: false, message: "Error getting account types" };
  }
}

//Get all COA
export async function getAllCOA(
  companyId: number,
  page: number = 1,
  limit: number = 50, // default page size
  sortBy: string = "accountCode", // default sort
  sortOrder: "asc" | "desc" = "asc"
) {
  try {
    const offset = (page - 1) * limit;

    const coaPerCompany = await prisma.coa.findMany({
      where: { companyId },
      skip: offset,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
      select: {
        id: true,
        accountCode: true,
        accountName: true,
        accountType: {
          select: {
            typeName: true,
            accountElement: {
              select: {
                elementName: true,
                parent: { select: { elementName: true } },
                financialStatement: {
                  select: {
                    statementKey: true,
                    usGaapLabel: true,
                    ifrsLabel: true,
                  },
                },
              },
            },
          },
        },
        currency: { select: { code: true, name: true, symbol: true } },
        defaultSide: true,
        isActive: true,
        balance: true,
      },
    });

    // Fetch the total count for pagination metadata
    const totalItems = await prisma.coa.count({ where: { companyId } });
    const totalPages = Math.ceil(totalItems / limit);

    if (coaPerCompany.length === 0) {
      return {
        success: true,
        message: "Empty chart of accounts",
        data: [],
        pagination: {
          totalItems,
          totalPages,
          currentPage: page,
          limit,
        },
      };
    }

    const formattedCoa = coaPerCompany.map((coa) => ({
      id: coa.id,
      "account Code": coa.accountCode,
      accountTypeName: coa.accountType.typeName,
      accountElement: coa.accountType.accountElement?.elementName,
      parentElement: coa.accountType.accountElement?.parent?.elementName,
      fsKey: coa.accountType.accountElement?.financialStatement.statementKey,
      ifrsLabel: coa.accountType.accountElement?.financialStatement.ifrsLabel,
      usGaapLabel:
        coa.accountType.accountElement?.financialStatement.usGaapLabel,
      currencyCode: coa.currency.code,
      currencyName: coa.currency.name,
      currencySymbol: coa.currency.symbol,
      defaultSide: coa.defaultSide,
      isActive: coa.isActive,
      balance: coa.balance,
    }));

    return {
      success: true,
      message: "Successfully retrieved chart of accounts",
      pagination: {
        totalItems,
        totalPages,
        currentPage: page,
        limit,
      },
      data: formattedCoa,
    };
  } catch (error: any) {
    console.error("Error getting chart of accounts", error);
    return {
      success: false,
      message: "Error getting chart of accounts",
      error: error.message,
    };
  }
}

//Check Account Code
export async function checkAccCode(companyId: number, accountCode: string) {
  try {
    const existingAccCode = await prisma.coa.findFirst({
      where: {
        companyId,
        accountCode: {
          equals: accountCode,
          mode: "insensitive",
        },
      },
      select: {
        accountCode: true,
        accountName: true,
        accountType: {
          select: { typeName: true },
        },
        description: true,
        balance: true,
      },
    });

    if (existingAccCode) {
      const result = {
        accountCode: existingAccCode.accountCode,
        accountName: existingAccCode.accountName,
        accountType: existingAccCode.accountType?.typeName,
        ...(existingAccCode.description?.trim() && {
          description: truncateText(existingAccCode.description, 40),
        }),
        balance: existingAccCode.balance,
      };

      return {
        success: true,
        message: "Account code already exists",
        data: result,
      };
    } else {
      return {
        success: false,
        message: "Account code does not exist",
      };
    }
  } catch (error: any) {
    console.error("Error checking account code:", error);
    return { success: false, message: "Error checking account code" };
  }
}

//Check Account Name
export async function checkAccName(companyId: number, accountName: string) {
  try {
    const existingAccName = await prisma.coa.findFirst({
      where: {
        companyId,
        accountName: {
          equals: accountName,
          mode: "insensitive",
        },
      },
      select: {
        accountCode: true,
        accountName: true,
        accountType: {
          select: { typeName: true },
        },
        description: true,
        balance: true,
      },
    });

    if (existingAccName) {
      const result = {
        accountCode: existingAccName.accountCode,
        accountName: existingAccName.accountName,
        accountType: existingAccName.accountType?.typeName,
        ...(existingAccName.description && {
          description: truncateText(existingAccName.description, 40),
        }),
        balance: existingAccName.balance,
      };
      return {
        success: true,
        message: "Found Account Name",
        data: result,
      };
    } else {
      return {
        success: false,
        message: "Account name does not exist",
      };
    }
  } catch (error: any) {
    console.error("Error checking account name:", error);
    return { success: false, message: "Error checking account name" };
  }
}

//Check AccountType based on Account Type ID or Account Type Name
interface checkAccountType {
  accountTypeId?: number;
  accountTypeName?: string;
}
export async function checkAccountTypeDetails(accountType: checkAccountType) {
  const accountTypeId = Number(accountType.accountTypeId);
  const accountTypeName = accountType.accountTypeName;

  if (!accountType.accountTypeId && !accountType.accountTypeName) {
    return { success: false, message: "Invalid account type details provided" };
  }
  try {
    const whereClause = accountType.accountTypeId
      ? { id: accountType.accountTypeId }
      : {
          typeName: {
            equals: accountType.accountTypeName,
            mode: "insensitive",
          },
        };

    const accountTypeDetails = await prisma.accountType.findFirst({
      where: whereClause,
      select: { id: true, typeName: true, description: true },
    });

    if (!accountTypeDetails) {
      return { success: false, message: "Account Type not found" };
    }

    return {
      success: true,
      message: "Found Account Type",
      data: accountTypeDetails,
    };
  } catch (error: any) {
    console.error("Error fetching account type:", error);
    return {
      success: false,
      message: "An error occurred while fetching the account type",
    };
  }
}

//CREATE SINGLE COA
interface COAInput {
  accountCode?: string;
  accountName: string;
  description?: string;
  accountTypeId?: number;
  accountTypeName?: string;
}

interface CoaItems {
  accountCode?: string;
  accountName: string;
  description?: string;
  accountTypeId: number;
  defaultSide: DefaultSide;
  currencyId: number;
  companyId: number;
}

export async function createCOAModel(companyId: number, data: COAInput) {
  const stdAccountName = toTitleCase(data.accountName);

  const verifyAccType = data.accountTypeId
    ? await checkAccountTypeDetails({ accountTypeId: data.accountTypeId })
    : await checkAccountTypeDetails({
        accountTypeName: data.accountTypeName,
      });

  if (!verifyAccType.success) {
    return verifyAccType;
  }

  const acctCode = data.accountCode
    ? await checkAccCode(companyId, data.accountCode)
    : { success: false };

  const acctName = stdAccountName
    ? await checkAccName(companyId, stdAccountName)
    : { success: false };

  if (acctCode.success === true) {
    return { success: false, message: "Account code already exists" };
  }

  if (acctName.success === true) {
    return { success: false, message: "Account name already exists" };
  }

  if (
    (!acctCode || acctCode.success === false) &&
    (!acctName || acctName.success === false)
  ) {
    const [defaultside, reportingCurrency] = await Promise.all([
      prisma.accountType.findFirst({
        where: { id: data.accountTypeId },
        select: { accountElement: { select: { defaultSide: true } } },
      }),

      prisma.company.findFirst({
        where: { id: companyId },
        select: { reportingCurrencyId: true },
      }),
    ]);

    const defaultSideValue = defaultside?.accountElement?.defaultSide;
    const currency = reportingCurrency?.reportingCurrencyId;

    if (!defaultSideValue) {
      return {
        success: false,
        message: "Default side not found for account type",
      };
    }

    try {
      const createdAccount = await prisma.coa.create({
        data: {
          accountCode: data.accountCode,
          accountName: stdAccountName,
          description: data.description,
          accountTypeId: verifyAccType.data && verifyAccType.data.id,
          defaultSide: defaultSideValue as DefaultSide,
          currencyId: currency,
          companyId: companyId,
        },
      });

      const accTypeId = createdAccount.accountTypeId
        ? (
            await checkAccountTypeDetails({
              accountTypeId: createdAccount.accountTypeId,
            })
          ).data?.typeName
        : "";

      const result = {
        accountCode: createdAccount.accountCode,
        accountName: createdAccount.accountName,
        accountType: accTypeId,
        ...(createdAccount.description && {
          description: truncateText(createdAccount.description, 40),
        }),
        balance: createdAccount.balance,
      };

      return {
        success: true,
        message: "Account successfully created",
        data: result,
      };
    } catch (error: any) {
      console.error(error);
      return { success: false, message: error.message };
    }
  } else {
    return { success: false, message: "Account already exists" };
  }
}

// CREATE BULK COA

export async function createBulkCOAModel(companyId: number, data: COAInput[]) {
  const results = await Promise.all(
    data.map(async (item) => {
      try {
        const stdAccountName = toTitleCase(item.accountName);

        const verifyAccType = item.accountTypeId
          ? await checkAccountTypeDetails({ accountTypeId: item.accountTypeId })
          : await checkAccountTypeDetails({
              accountTypeName: item.accountTypeName,
            });

        if (!verifyAccType.success) {
          return { success: false, message: verifyAccType.message, item };
        }

        const acctCodeExists = await checkAccCode(companyId, item.accountCode!);
        const acctNameExists = await checkAccName(companyId, stdAccountName);

        if (!acctCodeExists.success || !acctNameExists.success) {
          throw new Error(
            `Account with code ${item.accountCode} or name ${stdAccountName} already exists`
          );
        }

        const [defaultside, reportingCurrency] = await Promise.all([
          prisma.accountType.findFirst({
            where: { id: item.accountTypeId },
            select: { accountElement: { select: { defaultSide: true } } },
          }),

          prisma.company.findFirst({
            where: { id: companyId },
            select: { reportingCurrencyId: true },
          }),
        ]);

        const defaultSideValue = defaultside?.accountElement?.defaultSide;
        const currency = reportingCurrency?.reportingCurrencyId;

        if (!defaultSideValue) {
          return {
            success: false,
            message: "Default side not found for account type",
            item,
          };
        }

        return {
          success: true,
          data: {
            accountCode: item.accountCode,
            accountName: stdAccountName,
            description: item.description,
            accountTypeId: verifyAccType.data?.id,
            defaultSide: defaultSideValue as DefaultSide,
            currencyId: currency,
            companyId: companyId,
          },
        };
      } catch (error: any) {
        return { success: false, message: error.message, item };
      }
    })
  );

  const validRecords = results
    .filter((singleResult) => singleResult.success)
    .map((singleResult) => singleResult.data);
  const failedRecords = results.filter((singleResult) => !singleResult.success);

  try {
    const createdAccounts = await prisma.coa.createMany({
      data: validRecords,
      skipDuplicates: true,
    });

    return {
      success: true,
      message: `${createdAccounts.count} accounts created successfully. Failed records shown below`,
      data: failedRecords,
    };
  } catch (error: any) {
    console.error(error);
    return {
      success: false,
      message: error.message,
      data: [...failedRecords, ...validRecords],
    };
  }
}
