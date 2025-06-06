import { Response } from "express";
import { AuthRequest } from "../../features/auth/auth.types";
import { errorResponse } from "../../shared/utils/response.utils";
import { getAllBanks, getBankByCountry, getSingleBank } from "./banks.model";

export async function getAllBanksController(req: AuthRequest, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json(errorResponse("Unauthorized"));
    }

    const response = await getAllBanks();
    return response.success
      ? res.status(200).json(response)
      : res.status(400).json(response);
  } catch (error) {
    return res.status(500).json(errorResponse("Internal server error"));
  }
}

export async function getBankByIdController(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json(errorResponse("Unauthorized"));
  const { id } = req.params;
  return handleBankLookup(res, id);
}

export async function getBankByKeyController(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json(errorResponse("Unauthorized"));
  const { key } = req.params;
  return handleBankLookup(res, key);
}

async function handleBankLookup(res: Response, keyOrId: string) {
  const response = await getSingleBank(keyOrId);
  return response.success
    ? res.status(200).json(response)
    : res.status(404).json(response);
}

export async function getBankByCountryController(
  req: AuthRequest,
  res: Response
) {
  try {
    if (!req.user) {
      return res.status(401).json(errorResponse("Unauthorized"));
    }

    const countryId = req.query.countryId?.toString();
    const countryCode = req.query.countryCode?.toString().toUpperCase();

    const identifier = countryId || countryCode;

    if (!identifier) {
      return res
        .status(400)
        .json(errorResponse("Country code or id is required"));
    }

    const response = await getBankByCountry(identifier);
    return response.success
      ? res.status(200).json(response)
      : res.status(400).json(response);
  } catch (error) {
    return res.status(500).json(errorResponse("Internal server error"));
  }
}
