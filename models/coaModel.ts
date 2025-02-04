import { PrismaClient } from "@prisma/client";
import {
  filterUndefined,
  getIdentifierType,
  toTitleCase,
  truncateText,
} from "../utils/utils";
import { DebitCredit, Prisma } from "@prisma/client/wasm";
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

    const formattedAccountTypes = allAccountTypes.map((type: any) => ({
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
  companyId: string,
  page: number = 1,
  limit: number = 50, // default page size
  sortBy: string = "accountCode", // default sort
  sortOrder: "asc" | "desc" = "asc"
) {
  try {
    const offset = (page - 1) * limit;
    const idType = getIdentifierType(companyId);

    const coaPerCompany = await prisma.coa.findMany({
      where:
        idType === "uuid"
          ? { companyId }
          : { company: { shortCode: companyId } },
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

    const formattedCoa = coaPerCompany.map((coa: any) => ({
      id: coa.id,
      accountCode: coa.accountCode,
      accountName: coa.accountName,
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

//Get Single COA
export async function getACOA(companyId: string, id: string) {
  try {
    const idType = getIdentifierType(companyId);

    const singleCOA = await prisma.coa.findFirst({
      where:
        idType === "uuid"
          ? { companyId, id }
          : { company: { shortCode: companyId }, id },
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

    if (singleCOA) {
      const formattedCoa = {
        id: singleCOA.id,
        accountCode: singleCOA.accountCode,
        accountTypeName: singleCOA.accountType.typeName,
        accountElement: singleCOA.accountType.accountElement?.elementName,
        parentElement:
          singleCOA.accountType.accountElement?.parent?.elementName,
        fsKey:
          singleCOA.accountType.accountElement?.financialStatement.statementKey,
        ifrsLabel:
          singleCOA.accountType.accountElement?.financialStatement.ifrsLabel,
        usGaapLabel:
          singleCOA.accountType.accountElement?.financialStatement.usGaapLabel,
        currencyCode: singleCOA.currency.code,
        currencyName: singleCOA.currency.name,
        currencySymbol: singleCOA.currency.symbol,
        defaultSide: singleCOA.defaultSide,
        isActive: singleCOA.isActive,
        balance: singleCOA.balance,
      };

      return {
        success: true,
        message: "Successfully retrieved account",
        data: formattedCoa,
      };
    } else {
      return {
        success: false,
        message: "Account not found",
      };
    }
  } catch (error: any) {
    console.error("Error getting account", error);
    return {
      success: false,
      message: "Error getting account",
    };
  }
}

//Check Account Code
export async function checkAccCode(companyId: string, accountCode: string) {
  try {
    const idType = getIdentifierType(companyId);

    const existingAccCode = await prisma.coa.findFirst({
      where: {
        ...(idType === "uuid"
          ? { companyId }
          : { company: { shortCode: companyId } }),
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
export async function checkAccName(companyId: string, accountName: string) {
  try {
    const idType = getIdentifierType(companyId);

    const existingAccName = await prisma.coa.findFirst({
      where: {
        ...(idType === "uuid"
          ? { companyId }
          : { company: { shortCode: companyId } }),
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
  accountTypeId?: string;
  accountTypeName?: string;
}
export async function checkAccountTypeDetails(accountType: checkAccountType) {
  const accountTypeId = accountType.accountTypeId;
  const accountTypeName = accountType.accountTypeName;

  if (!accountTypeId && !accountTypeName) {
    return { success: false, message: "Invalid account type details provided" };
  }
  try {
    const whereClause = accountTypeId
      ? { id: accountTypeId }
      : {
          typeName: {
            equals: accountTypeName,
            mode: Prisma.QueryMode.insensitive,
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
  accountTypeId?: string;
  accountTypeName?: string;
}

interface CoaItems {
  accountCode?: string;
  accountName: string;
  description?: string;
  accountTypeId: string;
  defaultSide: DebitCredit;
  currencyId: string;
  companyId: string;
}

export async function createCOAModel(companyId: string, data: COAInput) {
  const stdAccountName = toTitleCase(data.accountName);
  const companyIdType = getIdentifierType(companyId);

  const verifyAccType = data.accountTypeId
    ? await checkAccountTypeDetails({ accountTypeId: data.accountTypeId })
    : await checkAccountTypeDetails({
        accountTypeName: data.accountTypeName,
      });

  if (!verifyAccType.success || !verifyAccType.data) {
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
    const [defaultside, companyData] = await Promise.all([
      prisma.accountType.findFirst({
        where: { id: data.accountTypeId },
        select: { accountElement: { select: { defaultSide: true } } },
      }),

      prisma.company.findFirst({
        where:
          companyIdType === "uuid"
            ? { id: companyId }
            : { shortCode: companyId },
        select: { id: true, reportingCurrencyId: true },
      }),
    ]);

    if (!companyData) {
      throw new Error("Company not found");
    }

    const defaultSideValue = defaultside?.accountElement?.defaultSide;
    const currency = companyData.reportingCurrencyId;
    const actualCompanyId = companyData.id;

    if (!defaultSideValue) {
      return {
        success: false,
        message: "Default side not found for account type",
      };
    }

    if (!currency) {
      return {
        success: false,
        message: "Currency error",
      };
    }

    try {
      const createdAccount = await prisma.coa.create({
        data: {
          accountCode: data.accountCode,
          accountName: stdAccountName,
          description: data.description,
          accountTypeId: verifyAccType.data.id,
          defaultSide: defaultSideValue as DebitCredit,
          currencyId: currency,
          companyId: actualCompanyId,
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
        id: createdAccount.id,
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
export async function createBulkCOAModel(companyId: string, data: COAInput[]) {
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

        const [defaultside, companyData] = await Promise.all([
          prisma.accountType.findFirst({
            where: { id: item.accountTypeId },
            select: { accountElement: { select: { defaultSide: true } } },
          }),

          prisma.company.findFirst({
            where: { id: companyId },
            select: { id: true, reportingCurrencyId: true },
          }),
        ]);

        if (!companyData) {
          throw new Error("Company not found");
        }

        const defaultSideValue = defaultside?.accountElement?.defaultSide;
        const currency = companyData?.reportingCurrencyId;
        const actualCompanyId = companyData.id;

        if (!defaultSideValue) {
          return {
            success: false,
            message: "Default side not found for account type",
            item,
          };
        }

        if (!currency) {
          return {
            success: false,
            message: "Currency error",
            item,
          };
        }

        if (!verifyAccType.data || verifyAccType.data.id) {
          return { success: false, message: "Account type not found", item };
        }

        return {
          success: true,
          data: {
            ...(item.accountCode && { accountCode: item.accountCode }),
            accountName: stdAccountName,
            ...(item.description && { description: item.description }),
            accountTypeId: verifyAccType.data.id,
            defaultSide: defaultSideValue as DebitCredit,
            currencyId: currency,
            companyId: actualCompanyId,
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
  const newValidRecords = validRecords.filter((record) => record !== undefined);

  const failedRecords = results.filter((singleResult) => !singleResult.success);

  try {
    const createdAccounts = await prisma.coa.createMany({
      data: newValidRecords,
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

//Update COA
interface UpdateCOAInput {
  id: string;
  accountCode?: string;
  accountName: string;
  description?: string;
  accountTypeId?: string;
  accountTypeName?: string;
}

export async function updateCOAModel(
  companyId: string,
  id: string,
  data: UpdateCOAInput
) {
  try {
    const coaId = id || data.id;
    const idType = getIdentifierType(companyId);

    const oldAccount = await prisma.coa.findFirst({
      where: {
        ...(idType === "uuid"
          ? { companyId }
          : { company: { shortCode: companyId } }),
        id: coaId,
      },
      select: {
        id: true,
        accountCode: true,
        accountName: true,
        description: true,
        accountType: { select: { typeName: true } },
      },
    });

    if (!oldAccount) {
      return {
        success: false,
        message: "Account not found",
      };
    }

    let accountTypeId;

    const accountTypeData = data.accountTypeId || data.accountTypeName;

    if (accountTypeData) {
      const accountType =
        typeof accountTypeData === "string"
          ? await checkAccountTypeDetails({
              accountTypeName: data.accountTypeName,
            })
          : await checkAccountTypeDetails({
              accountTypeId: data.accountTypeId,
            });

      accountTypeId = accountType?.data?.id;

      if (!accountTypeId) {
        return {
          success: false,
          message: "Invalid account type provided",
        };
      }
    }

    // Prepare update data conditionally
    const updateData: Partial<{
      accountCode: string;
      accountName: string;
      description: string;
      accountTypeId: string;
    }> = {
      ...(data.accountCode && { accountCode: data.accountCode }),
      ...(data.accountName && { accountName: data.accountName }),
      ...(data.description && { description: data.description }),
      ...(accountTypeId !== undefined && { accountTypeId }),
    };

    // Check if there's anything to update
    if (Object.keys(updateData).length === 0) {
      return {
        success: false,
        message: "No fields provided for update",
      };
    }

    const updatedAccount = await prisma.coa.update({
      where: {
        ...(idType === "uuid"
          ? { companyId }
          : { company: { shortCode: companyId } }),
        id: coaId,
      },
      data: updateData,
      select: {
        id: true,
        accountCode: true,
        accountName: true,
        description: true,
        accountType: { select: { typeName: true } },
      },
    });

    const updatedAccountData = await prisma.coa.update({
      where: {
        ...(idType === "uuid"
          ? { companyId }
          : { company: { shortCode: companyId } }),
        id: coaId,
      },
      data: updateData,
      select: {
        id: true,
        accountCode: !!data.accountCode,
        accountName: !!data.accountName,
        description: !!data.description,
        accountType: accountTypeId ? { select: { typeName: true } } : false,
      },
    });

    const changes: any = {
      ...(oldAccount.accountName !== updatedAccount.accountName && {
        oldAccountName: oldAccount.accountName,
      }),
      ...(oldAccount.accountCode !== updatedAccount.accountCode && {
        oldAccountCode: oldAccount.accountCode,
      }),
      ...(oldAccount.description !== updatedAccount.description && {
        oldDescription: oldAccount.description,
      }),
      ...(oldAccount.accountType?.typeName !==
        updatedAccount.accountType.typeName && {
        oldAccountTypeName: oldAccount.accountType?.typeName,
      }),
    };

    const { accountType, ...rest } = updatedAccountData;

    const dataToDisplay = {
      ...rest,
      ...(accountType && {
        accountTypeName: updatedAccount.accountType.typeName,
      }),
      ...changes,
    };

    return {
      success: true,
      message: "Account successfully updated",
      data: dataToDisplay,
    };
  } catch (error: any) {
    console.error(error);
    return {
      success: false,
      message: "An unexpected error occurred",
    };
  }
}

export async function archiveCOAModel(companyId: string, id: string[]) {}

export async function archiveSingleCOAModel(companyId: string, id: string) {}
