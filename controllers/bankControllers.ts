import { Request, Response } from "express";
import { getAllBanks, getSingleBank, createNewBank } from "../models/bankModel";

export async function allBanks(req: Request, res: Response) {
  try {
    const result = await getAllBanks();

    if (result.success && result.data) {
      if (result.data.length > 0) {
        return res.status(200).json(result);
      } else {
        return res.status(404).json({
          success: false,
          message: "No banks found",
        });
      }
    } else {
      return res.status(404).json(result);
    }
  } catch (error: any) {
    console.error(error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
}
export async function singleBank(req: Request, res: Response) {}

export async function createBank(req: Request, res: Response) {}
