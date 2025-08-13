import { type Response } from "express";
import type { AuthRequest } from "../../features/auth/auth.types.js";
import { errorResponse } from "../../shared/utils/response.utils.js";
import { handleMonoConnection } from "./baccons.model.js";

export const addNewBankAccountConnection = async (
  req: AuthRequest,
  res: Response,
) => {
  const userId: string = (req.user?.id || "").trim().toString();
  const companyId: string = (req.params?.companyId || req.body.companyId)
    .trim()
    .toString();

  if (!userId || !companyId)
    return res.status(400).json(errorResponse("Bad Request"));

  const { provider, data } = req.body;
  if (!provider || !data)
    return res.status(400).json(errorResponse("Required fields missing"));

  let connectionRes;
  try {
    switch (provider) {
      case "mono":
        connectionRes = await handleMonoConnection({
          code: String(data.code),
          userId,
          companyId,
        });
        break;

      // case "plaid":
      //   return handlePlaidConnection({ companyId, userId, data });

      default:
        return res.status(400).json({ error: "Unsupported provider" });
    }

    return connectionRes.success
      ? res.status(200).json(connectionRes)
      : res.status(400).json(connectionRes);
  } catch (error) {
    return res.status(500).json(errorResponse("An unexpected error occurred"));
  }
};
