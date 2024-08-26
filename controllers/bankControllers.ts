import { Request, Response } from "express";
import {
  getAllBanks,
  getSingleBank,
  createNewBank,
  updateBankData,
} from "../models/bankModel";

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

export async function singleBank(req: Request, res: Response) {
  try {
    const result = await getSingleBank(parseInt(req.params.id));

    if (result.success) {
      res.status(200).json(result);
    } else if (result.message === "Bank not found") {
      return res.status(404).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error: any) {
    console.error("Unexpected error in singleBank:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
}

export async function createBank(req: Request, res: Response) {
  try {
    const { name, bankLogo, countryId } = req.body;

    const missingFields: string[] = [];

    if (!name) missingFields.push("name");
    if (!countryId) missingFields.push("countryId");

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `The following required fields are missing: ${missingFields.join(
          ", "
        )}`,
      });
    }
    if (isNaN(countryId) || typeof countryId === "string") {
      return res
        .status(400)
        .json({ success: false, message: "Country ID is not a number" });
    }

    const result = await createNewBank({ name, bankLogo, countryId });
    return res.status(result.success ? 201 : 400).json(result);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
}

export async function updateBank(req: Request, res: Response) {
  try {
    const { name, bankLogo, countryId } = req.body;
    const id = parseInt(req.params.id);

    if (!id || isNaN(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid bank ID" });
    }

    const missingFields: string[] = [];

    if (!name) missingFields.push("name");
    if (!countryId) missingFields.push("countryId");

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `The following required fields are missing: ${missingFields.join(
          ", "
        )}`,
      });
    }

    if (isNaN(countryId) || typeof countryId === "string") {
      return res
        .status(400)
        .json({ success: false, message: "Country ID is not a number" });
    }

    const result = await updateBankData(id, { name, bankLogo, countryId });
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
}
