import { getDefaultCurrencyCodeForCountry } from "@/constants/countryCurrencyMap";
import { CompanyData } from "@/domains/company/types";
import { CountryList, CurrencyList } from "@/types/types";


export const getUserLocale = () => {
  return navigator.language || navigator.languages?.[0] || "en-US";
};

export const getCountryFromLocale = (
  countries: CountryList[]
): CountryList | undefined => {
  const locale = navigator.language;
  const countryCode = locale.split("-")[1];

  const userCountry = countries.find((item) => item.code === countryCode);
  return userCountry;
};

export const getDefaultCurrency = (company: any, countries: CountryList[]) => {
  const countryCode = company.countryId
    ? countries.find((ctry) => ctry.id === company.countryId)
    : "";
  const userCountry = countryCode || getCountryFromLocale(countries);
  const curr = userCountry
    ? getDefaultCurrencyCodeForCountry(userCountry?.code)
    : "";

  return curr;
};
export const getDefaultCountryAndCurrency = ({
  company,
  countries,
  currencies,
}: {
  company?: CompanyData;
  countries: CountryList[];
  currencies: CurrencyList[];
}): { country: CountryList; currency: CurrencyList } => {
  if (!countries.length || !currencies.length) {
    return {
      country: countries?.[0],
      currency: currencies?.[0],
    };
  }

  // Determine country (company preference > locale detection > fallback)
  const country = company?.countryId
    ? countries.find((c) => c.id === company.countryId)
    : getCountryFromLocale(countries) || countries[0];

  if (!country) {
    return {
      country: countries[0],
      currency: currencies[0],
    };
  }

  // Find currency by country's currency code (e.g., "USD" for US)
  const currencyCode = getDefaultCurrencyCodeForCountry(country.code);
  const currency =
    currencies.find((c) => c.code === currencyCode) || currencies[0];

  return {
    country,
    currency,
  };
};
