import Decimal from "decimal.js";
import { z } from "zod";

export const nodeEnv = z.enum([
  "local",
  "docker.dev",
  "docker.staging",
  "docker.production",
]);
export type NodeEnv = z.infer<typeof nodeEnv>;

export type DecimalFilter = {
  equals?: number | Decimal | string;
  in?: (number | Decimal | string)[];
  notIn?: (number | Decimal | string)[];
  lt?: number | Decimal | string;
  lte?: number | Decimal | string;
  gt?: number | Decimal | string;
  gte?: number | Decimal | string;
  not?: Decimal | DecimalFilter | number | string;
};

export type StringFilter = {
  equals?: string | null;
  in?: string[] | null;
  notIn?: string[] | null;
  lt?: string;
  lte?: string;
  gt?: string;
  gte?: string;
  contains?: string;
  startsWith?: string;
  endsWith?: string;
  mode?: "default" | "insensitive";
  not?: string | null | StringFilter;
};

export type DateTimeFilter = {
  equals?: Date | string;
  in?: (Date | string)[];
  notIn?: (Date | string)[];
  lt?: Date | string;
  lte?: Date | string;
  gt?: Date | string;
  gte?: Date | string;
  not?: DateTimeFilter | Date | string;
};

export type BoolFilter = {
  equals?: boolean;
  not?: boolean | BoolFilter;
};

export type EnumFilter<T> = {
  equals?: T;
  in?: T[];
  notIn?: T[];
  not?: T | EnumFilter<T>;
};

export type SortOrder = "asc" | "desc";

export interface ApiResponse {
  success: boolean;
  message: string;
  data?: any;
  error?: string | Record<string, any> | string[];
}

export const zDate = z.preprocess((val) => {
  if (
    typeof val === "string" ||
    typeof val === "number" ||
    val instanceof Date
  ) {
    const date = new Date(val);
    return isNaN(date.getTime()) ? undefined : date;
  }
  return undefined;
}, z.date());

export const zEmail = () =>
  z
    .string()
    .email()
    .transform((email) => email.trim().toLowerCase());
