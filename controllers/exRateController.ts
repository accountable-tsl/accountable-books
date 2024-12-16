import { Request, response, Response } from "express";
import { findInvalidObjects } from "../utils/utils";
import { createNewExRates } from "../models/exRateModel";
import { Decimal } from "@prisma/client/runtime/library";

export async function createExchangeRates(req: Request, res: Response) {
  try {
    const { data } = req.body;
    const requiredKeys = ["date", "baseCurrencyId", "targetCurrencyId", "rate"];

    const invalidObjects = findInvalidObjects(data, requiredKeys);
    if (invalidObjects.length !== 0)
      return res.status(400).json({
        success: false,
        message: "All fields are required",
        error: invalidObjects,
      });

    const transformedData = data.map((tx: any) => ({
      date: new Date(tx.date),
      baseCurrencyId: tx.baseCurrencyId,
      targetCurrencyId: tx.targetCurrencyId,
      rate: new Decimal(tx.rate),
    }));

    const result = await createNewExRates(transformedData);

    res.status(200).json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "An unexpected error occurred" });
  }
}
