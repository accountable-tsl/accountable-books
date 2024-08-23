import { PrismaClient } from "@prisma/client";
import { Interface } from "readline";
const prisma = new PrismaClient();

export async function checkAccCode(companyId: number, accountCode: string) {
    try {
        const existingAccCode = await prisma.coa.findFirst({
            where: {
                companyId,
                accountCode,
            }
        });

        if (existingAccCode) {
            return { accountCodeExists: true, message: "" };
        } else {
            return { accountCodeExists: false, message: "Account code does not exist" };
        }
    } catch (error: any) {
        console.error("Error checking account code:", error);
        return { accountCodeExists: false, message: "Error checking account code" };
    }
}

export async function checkAccName(companyId: number, accountName: string) {
    try {
        const existingAccName = await prisma.coa.findFirst({
            where: {
                companyId,
                accountName,
            }
        });

        if (existingAccName) {
            return { accountNameExists: true, message: "" };
        } else {
            return { accountNameExists: false, message: "Account name does not exist" };
        }
    } catch (error: any) {
        console.error("Error checking account name:", error);
        return { accountNameExists: false, message: "Error checking account name" };
    }
}

//Check if COA array length is > 1
//If > 1, run function 1, if not run function 2

export async function createCOAModel(coaData) {
  return;
}


//Function 1 - Single COA Addition
// await prisma.coa.create{
//     data:{
        
//     }
// }


