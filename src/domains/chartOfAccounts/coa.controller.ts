import { Response } from "express";
import { AuthRequest } from "../../features/auth/auth.types";
import { errorResponse } from "../../shared/utils/response.utils";
import { fetchCompanyCoa } from "./coa.model";

export const getCoaController = async (req: AuthRequest, res: Response) => {
  const { companyId, id, code, active, key } = req.query;

  if (!companyId || typeof companyId !== "string") {
    return res.status(400).json(errorResponse("Missing or invalid companyId"));
  }

  try {
    const result = await fetchCompanyCoa({
      companyId,
      ...(id ? { id: String(id) } : {}),
      ...(code ? { code: String(code) } : {}),
      ...(active
        ? {
            active:
              active === "true" ? true : active === "false" ? false : undefined,
          }
        : {}),
      ...(key ? { accountTypeKey: String(key) } : {}),
    });

    return result.success
      ? res.status(200).json(result)
      : res.status(400).json(result);
  } catch (error) {
    return res
      .status(500)
      .json(errorResponse("An unexpected error occurred", error));
  }
};
