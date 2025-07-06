import { Response } from "express";
import { AuthRequest } from "../../features/auth/auth.types";
import { errorResponse } from "../../shared/utils/response.utils";
import {
  createNewBankAccount,
  getBankAccountsWithDetails,
} from "./bankAccounts.model";

export async function createBankAccountController(
  req: AuthRequest,
  res: Response
) {
  try {
    const companyId =
      req.company?.id || req.params.companyId || req.body.companyId;
    const userId = req.user?.id || req.body.userId;

    if (!companyId || !userId) {
      return res.status(400).json(errorResponse("Unauthorized"));
    }

    const response = await createNewBankAccount({
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

export async function getBankAccountsForCompany(
  req: AuthRequest,
  res: Response
) {
  try {
    const companyId = req.company?.id || req.params.companyId;
    const response = await getBankAccountsWithDetails(companyId);
    return response.success
      ? res.status(200).json(response)
      : res.status(400).json(response);
  } catch (error) {
    return res.status(500).json(errorResponse("An unexpected error occurred"));
  }
}
