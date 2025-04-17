import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { NewCompany, NewFirm } from "./SignupTypes";
import { CompanyType, CountryList } from "@/types/types";
import { useIndustries } from "@/hooks/useIndustries";
import { CircleHelp } from "lucide-react";
import { useState } from "react";
import { AutocompleteDropdown } from "@/components/AutocompleteDropdown/AutocompleteDropdown";
import { useCountries } from "@/hooks/useCountries";
import { useCurrencies } from "@/hooks/useCurrencies";
export function SignupCompanyInfo({
  data,
  onChange,
  userType,
}: {
  companyDetails: NewCompany;
  firmDetails: NewFirm;
  onChange: (field: keyof NewCompany | keyof NewFirm, value: string) => void;
  userType: CompanyType;
}) {
  const {
    data: industries,
    isLoading: isIndustriesLoading,
    isError: isIndustriesError,
  } = useIndustries();

  const {
    data: currencies,
    isLoading: isCurrencyLoading,
    isError: isCurrencyError,
  } = useCurrencies();

  const {
    data: countries,
    isLoading: isCountryLoading,
    isError: isCountryError,
  } = useCountries();

  const [currenciesOpen, setCurrenciesOpen] = useState(false);
  const [industryOpen, setIndustryOpen] = useState(false);
  const [countriesOpen, setCountriesOpen] = useState(false);
  //   const isDesktop = useMedia

  const getCountryFromLocale = (): CountryList | undefined => {
    const locale = navigator.language;
    const countryCode = locale.split("-")[1];
    const country =
      countries && countries?.data?.find((item) => item.code === locale);
    return country;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-2">
        <Label>
          {userType === "accounting_firm" ? "Practice Name" : "Company Name"}
        </Label>
        <Input
        //   value={data.companyName}
        //   onChange={(e) => onChange("companyName", e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label>Country</Label>

        <AutocompleteDropdown
          items={
            isCountryLoading
              ? [{ value: "loading", label: "Loading..." }]
              : isCountryError
              ? [{ value: "error", label: "Error loading countries" }]
              : countries?.data || []
          }
          mapItem={(item) => ({
            value: item.id,
            label: item.name,
          })}
          onChange={(v) => console.log(v)}
          placeholder="Select country"
        />
      </div>
      <div className="grid grid-cols-[1.25fr_1fr] gap-2">
        <div className="space-y-2 w-full">
          <Label>Country</Label>
          <Select
          //   onValueChange={(v) => onChange("industry", v)}
          //   value={data.industry}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select country" />
            </SelectTrigger>
            <SelectContent>
              {!countries && (
                <SelectItem key="countriesLoading" value="loading">
                  Loading...
                </SelectItem>
              )}
              {countries?.data &&
                countries?.data.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.flag} {item.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>{" "}
        <div className="space-y-2 w-full">
          <div className="flex gap-1">
            <Label className="flex gap-0.5">
              Reporting Currency<span className="">*</span>
            </Label>
            <CircleHelp size={14} />
          </div>
          <Select
          //   onValueChange={(v) => onChange("industry", v)}
          //   value={data.industry}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select currency" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem key={`notSure${Math.random()}`} value="notSure">
                I'm not sure
              </SelectItem>
              {!currencies && (
                <SelectItem key="currenciesLoading" value="loading">
                  Loading...
                </SelectItem>
              )}
              {currencies?.data &&
                currencies?.data.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.code} ({item.symbol})
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Industry</Label>
        <Select
        //   onValueChange={(v) => onChange("industry", v)}
        //   value={data.industry}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Select industry" />
          </SelectTrigger>
          <SelectContent className="w-[200px]">
            {!industries && <SelectItem value="loading">Loading...</SelectItem>}
            {industries?.map((item) => (
              <SelectItem key={item.code} value={item.label}>
                {item.shortLabel}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div></div>
      <div className="space-y-2">
        {/* <Label>Company Size</Label>
        <Select onValueChange={(v) => onChange("size", v)} value={""}>
          <SelectTrigger>
            <SelectValue placeholder="Select size" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1-10">1-10 employees</SelectItem>
            <SelectItem value="11-50">11-50 employees</SelectItem>
            <SelectItem value="51-200">51-200 employees</SelectItem>
          </SelectContent>
        </Select> */}
      </div>
    </div>
  );
}
