import { Request, response, Response } from "express";
import { findInvalidObjects } from "../utils/utils";
import { createNewExRates, fetchExchangeRate } from "../models/exRateModel";
import { Decimal } from "@prisma/client/runtime/library";

export async function createExchangeRates(req: Request, res: Response) {
  try {
    const { data } = req.body;
    const requiredKeys = ["date", "fromCurrencyId", "toCurrencyId", "rate"];

    const invalidObjects = findInvalidObjects(data, requiredKeys);
    if (invalidObjects.length !== 0)
      return res.status(400).json({
        success: false,
        message: "All fields are required",
        error: invalidObjects,
      });

    const transformedData = data.map((tx: any) => ({
      date: new Date(tx.date),
      fromCurrencyId: tx.fromCurrencyId,
      toCurrencyId: tx.toCurrencyId,
      rate: new Decimal(tx.rate),
    }));

    const result = await createNewExRates(transformedData);

    res.status(200).json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "An unexpected error occurred" });
  }
}

export async function getSingleExchangeRate(req: Request, res: Response) {
  try {
    const { date, fromCurrencyId, toCurrencyId } = req.query;

    if (
      !date ||
      !fromCurrencyId ||
      (fromCurrencyId as string).length > 40 ||
      !toCurrencyId ||
      (toCurrencyId as string).length > 40
    )
      return res.status(400).json({
        success: false,
        message: "All fields (date, fromCurrencyId, toCurrencyId) are required",
      });

    const result = await fetchExchangeRate(
      new Date(date as string),
      fromCurrencyId as string,
      toCurrencyId as string
    );

    if (result.success === false) {
      return res.status(400).json(result);
    } else {
      return res.status(200).json(result);
    }
  } catch (error) {
    console.error("Error in getSingleExchangeRate:", error);
    res.status(500).json({ message: "An unexpected error occurred" });
  }
}
