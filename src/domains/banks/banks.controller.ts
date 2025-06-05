import { Response } from "express";
import { AuthRequest } from "../../features/auth/auth.types";
import { errorResponse } from "../../shared/utils/response.utils";
import { getAllBanks, getSingleBank } from "./banks.model";

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

export async function getSingleBankController(req: AuthRequest, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json(errorResponse("Unauthorized"));
    }

    const key = req.params.key;
    const id = req.params.id;

    if (!key && !id) {
      return res.status(400).json(errorResponse("Bank key or id is required"));
    }

    const response = await getSingleBank(id || key);
    return response.success
      ? res.status(200).json(response)
      : res.status(400).json(response);
  } catch (error) {
    return res.status(500).json(errorResponse("Internal server error"));
  }
}
