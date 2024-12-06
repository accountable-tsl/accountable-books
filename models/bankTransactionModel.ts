import { PrismaClient } from "@prisma/client";


const prisma = new PrismaClient()

export async function postBankTransactions () {
    //Convert string dates to actual dates
    //Determine latest and earliest dates
    //Add current bank balance to transaction batch table
    //Calculate bank balance after import
    //Run a prisma $transaction that does the following:
    //Add new line based on the information to BankTransactionBatch Table
    //Get required data from the BankTransactionBatch and add all the transactions to the BankTransactions Table
    //If successful, send success message and summary to front end, otherwise send error message
}