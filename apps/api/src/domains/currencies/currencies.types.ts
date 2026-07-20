export type CurrencyRow = {
  id: string;
  code: string;
  name: string;
  symbol: string;
  minor_unit: number;
};

export type CurrencyRes = {
  id: string;
  code: string;
  name: string;
  symbol: string;
  minorUnit: number;
};

export function toCurrencyRes(row: CurrencyRow): CurrencyRes {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    symbol: row.symbol,
    minorUnit: row.minor_unit,
  };
}
