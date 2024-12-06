import { Request, Response } from "express";

export async function handleTransactionImport(req: Request, res: Response) {
  //Validate Company ID or return
  //Validate BankID or Return
  //Check that a valid "source" is included in the data sent
  //Check that there are transactions in the data sent from frontend
  //Run postBankTransaction function from bankTrasactionModel.ts

  try {
    const companyId = req.company!.id || req.params.companyId;
    if (!companyId) {
      return res.status(400).json({ message: "Bad Request" });
    }

    const bankAccountId = req.params.bankAccountId;
    if (!bankAccountId) {
      return res.status(400).json({ message: "Invalid Bank Account ID" });
    }
  } catch (error) {}
}
