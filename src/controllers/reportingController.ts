import { Request, Response } from "express";
import { retrieveLedgerEntries } from "../models/reportingModel";

export async function fetchLedgerEntries(req: Request, res: Response) {
  try {
    const companyId = req.company!.id || req.params.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, message: "Bad Request" });
    }

    const { accountIds, startDate, endDate } = req.body;

    if (!accountIds.length || !startDate || !endDate) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
    }

    const response = await await retrieveLedgerEntries({
      companyIdentifier: companyId,
      accountIds,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return res
      .status(500)
      .json({ success: false, message: "An unexpected error occured" });
  }
}
