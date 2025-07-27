import { Request, Response } from "express";
import { getAccountClassificationMeta } from "./account.model";
import { errorResponse } from "../../shared/utils/response.utils";

export async function accountMetaController(req: Request, res: Response) {
  try {
    const result = await getAccountClassificationMeta();
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    return res.status(500).json(errorResponse("Internal server error"));
  }
}
