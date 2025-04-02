import { Decimal } from "@prisma/client/runtime/library";

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
