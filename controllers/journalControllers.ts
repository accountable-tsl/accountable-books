import { Request, Response } from "express";
import {
  fetchJournals,
  insertJournalRecords,
  JournalData,
} from "../models/journalModel";

export async function getJournals(req: Request, res: Response) {
  try {
    const companyId = req.company!.id || req.params.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, message: "Bad Request" });
    }

    const { search, searchQuery } = req.query;
    const filters = {
      searchQuery: String(search).trim() || String(searchQuery).trim(),
    };

    const response = await fetchJournals(companyId, filters);
    if (response.success) {
      return res.status(200).json(response);
    } else {
      return res.status(400).json(response);
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
}
export async function getSingleJournal(req: Request, res: Response) {
  try {
    const companyId = req.company!.id || req.params.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, message: "Bad Request" });
    }
  } catch (error) {}
}
export async function createJournals(req: Request, res: Response) {
  try {
    const companyId = req.company!.id || req.params.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, message: "Bad Request" });
    }

    const journalData: JournalData[] = req.body.data;

    const response = await insertJournalRecords(
      companyId,
      "testId",
      journalData
    );

    if (response.success) {
      return res.status(201).json(response);
    } else {
      return res.status(400).json(response);
    }
  } catch (error) {
    console.error("Unexpected error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

export async function bulkCreateJournals(req: Request, res: Response) {}
export async function createRecurringJournals(req: Request, res: Response) {
  try {
    const companyId = req.company!.id || req.params.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, message: "Bad Request" });
    }
  } catch (error) {}
}
export async function reverseJournal(req: Request, res: Response) {
  try {
    const companyId = req.company!.id || req.params.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, message: "Bad Request" });
    }
  } catch (error) {}
}
export async function updateJournal(req: Request, res: Response) {
  try {
    const companyId = req.company!.id || req.params.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, message: "Bad Request" });
    }
  } catch (error) {}
}
export async function softDeleteJournals(req: Request, res: Response) {
  try {
    const companyId = req.company!.id || req.params.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, message: "Bad Request" });
    }
  } catch (error) {}
}
