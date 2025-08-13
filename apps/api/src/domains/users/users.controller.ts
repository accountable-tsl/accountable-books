import { Response } from "express";
import { AuthRequest } from "../../features/auth/auth.types";
import { getUserDetails } from "./users.model";
import { errorResponse } from "../../shared/utils/response.utils";

export async function getUserDetailsController(
  req: AuthRequest,
  res: Response
) {
  const userId = req.user?.id || String(req.query.id);
  try {
    const response = await getUserDetails(userId);
    return response.success
      ? res.status(200).json(response)
      : res.status(400).json(response);
  } catch (error) {
    return res.status(500).json(errorResponse("An unexpected error occurred"));
  }
}
