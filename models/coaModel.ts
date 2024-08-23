import { DefaultSide, PrismaClient } from "@prisma/client";
import { Interface } from "readline";
import { toTitleCase } from "../utils/utils";
const prisma = new PrismaClient();

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
    });

    if (existingAccCode) {
      return { accountCodeExists: true, message: "" };
    } else {
      return {
        accountCodeExists: false,
        message: "Account code does not exist",
      };
    }
  } catch (error: any) {
    console.error("Error checking account code:", error);
    return { accountCodeExists: false, message: "Error checking account code" };
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
        description: true,
        balance: true,
      },
    });

    if (existingAccName) {
      return { accountNameExists: true, message: existingAccName };
    } else {
      return {
        accountNameExists: false,
        message: "Account name does not exist",
      };
    }
  } catch (error: any) {
    console.error("Error checking account name:", error);
    return { accountNameExists: false, message: "Error checking account name" };
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

    const accountTypeDetails = await prisma.accountType.findUnique({
      where: whereClause,
      select: { id: true, typeName: true, description: true },
    });

    if (!accountTypeDetails) {
      return { success: false, message: "Account Type not found" };
    }

    return { success: true, message: accountTypeDetails };
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
  if (!data.accountName || !data.accountTypeId) {
    return { success: false, message: "Missing required fields" };
  }

  let verifyAccType;

  if (data.accountTypeId) {
    const verifyAccType = await checkAccountTypeDetails({
      accountTypeId: data.accountTypeId,
    });
  } else if (data.accountTypeName) {
    const verifyAccType = await checkAccountTypeDetails({
      accountTypeName: data.accountTypeName,
    });
  } else {
    return { success: false, message: "Account type information is missing" };
  }

  if (!verifyAccType.success) {
    return verifyAccType;
  }

  const acctCode =
    data.accountCode && (await checkAccCode(companyId, data.accountCode));
  const acctName =
    data.accountName && (await checkAccName(companyId, data.accountName));

  if (
    (!acctCode || acctCode.accountCodeExists === false) &&
    (!acctName || acctName.accountNameExists === false)
  ) {
    const [defaultside, reportingCurrency] = await Promise.all([
      prisma.accountType.findUnique({
        where: { id: data.accountTypeId },
        select: { accountElement: { select: { defaultSide: true } } },
      }),

      prisma.company.findUnique({
        where: { id: companyId },
        select: { reportingCurrencyId: true },
      }),
    ]);

    const defaultSideValue = defaultside?.accountElement?.defaultSide;
    const currency = reportingCurrency?.reportingCurrencyId;
    const stdAccountName = toTitleCase(data.accountName);

    try {
      const createdAccount = await prisma.coa.create({
        data: {
          accountCode: data.accountCode,
          accountName: stdAccountName,
          description: data.description,
          accountTypeId: verifyAccType.message.id,
          defaultSide: defaultSideValue as DefaultSide,
          currencyId: currency,
          companyId: companyId,
        },
      });

      return {
        success: true,
        message: "Account successfully created",
        data: createdAccount,
      };
    } catch (error: any) {
      console.error(error);
      return { success: false, message: error.message };
    }
  }
}

// CREATE MULTIPLE COA
export async function createManyCOAModel(params: type) {}
