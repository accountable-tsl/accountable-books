import { Response } from "express";
import { AuthRequest } from "../../features/auth/auth.types";
import { errorResponse } from "../../shared/utils/response.utils";
import { addNewBankTransactions } from "./bankTransactions.model";

export async function handleTransactionImport(req: AuthRequest, res: Response) {
  const companyId = String(req.company?.id || req.params.companyId);
  const userId = String(req.user?.id || req.body.userId);

  if (!companyId || !userId) {
    return res.status(400).json(errorResponse("Unauthorized"));
  }

  try {
    const response = await addNewBankTransactions({
      companyId,
      data: req.body,
      userId,
    });

    return response.success
      ? res.status(200).json(response)
      : res.status(400).json(response);
  } catch (error) {
    return res.status(500).json(errorResponse("An unexpected error occurred"));
  }
}
