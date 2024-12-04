import { Request, Response } from "express";
import { getAllCurrencies } from "../models/currenciesModel";

export async function allCurrencies(req: Request, res: Response) {
  try {
    const result = await getAllCurrencies();

    if (result.success) {
      res.status(200).json(result);
    } else if (result.message === "No currency found") {
      return res.status(404).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error("Unexpected error in allCurrencies:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
}
