import { Request, Response } from "express";

export async function postAccountTransactions(req: Request, res: Response) {
  try {
    const companyId = req.company!.id || req.params.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, message: "Bad Request" });
    }
  } catch (error) {}
}
