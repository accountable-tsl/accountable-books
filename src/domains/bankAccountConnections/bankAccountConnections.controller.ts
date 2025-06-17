import { Response } from "express";
import { AuthRequest } from "../../features/auth/auth.types";
import { errorResponse } from "../../shared/utils/response.utils";
import { handleMonoConnection } from "./bankAccountConnections.model";

export const addNewBankAccountConnection = async (
  req: AuthRequest,
  res: Response
) => {
  const userId = (req.user?.id || req.body.userId).trim().toString();
  const companyId = (req.company?.id || req.params.companyId).trim().toString();

  if (!userId || !companyId)
    return res.status(400).json(errorResponse("Unauthorized"));

  const { provider, data } = req.body;
  if (!provider)
    return res.status(400).json(errorResponse("Provider is required"));

  switch (provider) {
    case "mono":
      return handleMonoConnection({ companyId, userId, code: data.code });

    // case "plaid":
    //   return handlePlaidConnection({ companyId, userId, data });

    default:
      return res.status(400).json({ error: "Unsupported provider" });
  }
};
