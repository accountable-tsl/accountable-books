import Decimal from "decimal.js";
import { ApiResponse } from "../types/generic";
import { NODE_ENV } from "../config/env";
import { mixpanelClient } from "../lib/mixpanel";




export const toNum = (val: Decimal | number | string) =>
  val instanceof Decimal ? val.toNumber() : Number(val);

export function safeDecimal(value: string | number): string {
  const decimal = new Decimal(value);
  if (decimal.isNaN() || !decimal.isFinite()) {
    throw new Error(`Invalid decimal: ${value}`);
  }
  return decimal.toString();
}





