import { Response } from "express";
import { AuthRequest } from "../../features/auth/auth.types";
import { errorResponse } from "../../shared/utils/response.utils";
import {
  archiveCoa,
  deleteCoa,
  editCoa,
  fetchCompanyCoa,
  unarchiveCoa,
} from "./coa.model";
import { CoaUpdateInput, coaUpdateInput } from "./coa.types";

export const getCoaController = async (req: AuthRequest, res: Response) => {
  const { companyId: companyIdFromQuery, id, code, active, key } = req.query;
  const companyId = companyIdFromQuery || req.params.companyId;
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

// Edit a single COA record
export const editCoaController = async (req: AuthRequest, res: Response) => {
  const obj = coaUpdatePreChecks(req, res);
  if (typeof obj === "string") {
    return res.status(400).json(errorResponse(obj));
  }

  try {
    const result = await editCoa(obj);

    return result.success
      ? res.status(200).json(result)
      : res.status(400).json(result);
  } catch (error) {
    return res
      .status(500)
      .json(errorResponse("An unexpected error occurred", error));
  }
};

export const deleteCoaController = async (req: AuthRequest, res: Response) => {
  const obj = coaUpdatePreChecks(req, res);
  if (typeof obj === "string") {
    return res.status(400).json(errorResponse(obj));
  }
  const { updates, ...rest } = obj;

  try {
    const result = await deleteCoa({
      ...rest,
      accountIds: updates.map(({ id }) => id),
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

export const archiveCoaController = async (req: AuthRequest, res: Response) => {
  const obj = coaUpdatePreChecks(req, res);
  if (typeof obj === "string") {
    return res.status(400).json(errorResponse(obj));
  }
  const { updates, ...rest } = obj;

  try {
    const result = await archiveCoa({
      ...rest,
      accountIds: updates.map(({ id }) => id),
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

// Bulk unarchive COA records
export const unarchiveCoaController = async (
  req: AuthRequest,
  res: Response
) => {
  const obj = coaUpdatePreChecks(req, res);
  if (typeof obj === "string") {
    return res.status(400).json(errorResponse(obj));
  }
  const { updates, ...rest } = obj;

  try {
    const result = await unarchiveCoa({
      ...rest,
      accountIds: updates.map(({ id }) => id),
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

function coaUpdatePreChecks(
  req: AuthRequest,
  res: Response
):
  | {
      updates: CoaUpdateInput[];
      companyId: string;
      userId: string;
    }
  | string {
  const companyId = String(req.params.companyId);
  const userId = req.user?.id;

  if (!companyId || !userId) return "Missing valid authorization details";

  const data = Array.isArray(req.body) ? req.body : [req.body];
  const validateData = coaUpdateInput.array().safeParse(data);
  if (!validateData.success) {
    return validateData.error.message;
  }
  return {
    companyId,
    userId,
    updates: validateData.data,
  };
}
