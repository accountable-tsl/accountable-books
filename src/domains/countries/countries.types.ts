export type GetCountriesOptions = Partial<{
  skipCache?: boolean;
}>;

export type CountryRes = {
  id: string;
  name: string;
  code: string;
  flag: string;
  phoneCode: string;
  continent: string;
};
