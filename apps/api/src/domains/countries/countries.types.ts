export type GetCountriesOptions = Partial<{
  skipCache?: boolean;
}>;

export type CountryRow = {
  id: string;
  code: string;
  name: string;
  phone_code: string;
  flag: string | null;
  continent: string | null;
};

export type CountryRes = {
  id: string;
  name: string;
  code: string;
  flag: string | null;
  phoneCode: string;
  continent: string | null;
};

export function toCountryRes(row: CountryRow): CountryRes {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    phoneCode: row.phone_code,
    flag: row.flag,
    continent: row.continent,
  };
}
