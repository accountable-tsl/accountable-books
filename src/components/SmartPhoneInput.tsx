import { cn } from "@/lib/utils";
import { Label } from "./ui/label";
import { useRef, useState } from "react";
import { Input } from "./ui/input";
import { useCountries } from "@/hooks/useCountries";
import { CountryList } from "@/types/types";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { formatPhoneNumber } from "@/shared/utils/formattingUtils";

interface PhoneData {
  //   countryId: string;
  phoneNumber: string;
  countryCode: string;
  completeNumber: string;
}

interface SmartPhoneInputProps {
  value: PhoneData;
  onChange: (value: PhoneData) => void;
  isValid: boolean | null;
  label?: string;
}

export function SmartPhoneInput({
  value,
  onChange,
  isValid,
  label,
}: SmartPhoneInputProps) {
  const countriesHook = useCountries();
  let countries = countriesHook.data?.data;
  if (countries) {
    countries = [
      ...countries,
      {
        id: "UNKNOWN",
        code: "UNKNOWN",
        name: "Other Country",
        phoneCode: "",
        flag: "🌐",
      },
    ];
  }

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [unknownCountryCode, setUnknownCountryCode] = useState("");

  const getCountryFromLocale = (): CountryList | undefined => {
    const locale = navigator.language;
    const countryCode = locale.split("-")[1];
    const userCountry =
      countries && countries.find((country) => country.code === countryCode);
    return userCountry;
  };

  const selectedCountry =
    countries?.find((country) => country.code === value?.countryCode) ||
    getCountryFromLocale() ||
    countries?.[0];
  const isUnknownCountry = value?.countryCode === "UNKNOWN";

  // Handle country change from dropdown
  const handleCountryChange = (countryCode: string) => {
    if (countryCode === "UNKNOWN") {
      // For unknown country, start with the unknown code if we have one
      const initialValue = unknownCountryCode || "+";
      onChange({
        phoneNumber: initialValue,
        countryCode: "UNKNOWN",
        completeNumber: initialValue,
      });
      setInputValue(initialValue);
    } else {
      // For known countries, keep only the digits from the national number
      let phoneNumber = value.phoneNumber;
      if (isUnknownCountry) {
        // If coming from unknown country, extract only the digits
        phoneNumber = value.phoneNumber.replace(/\D/g, "");
      }

      const newCountry = countries?.find((c) => c.code === countryCode)!;
      const formattedPhoneNumber = formatPhoneNumber(phoneNumber, newCountry);
      const completeNumber = `${newCountry?.phoneCode}${phoneNumber}`;
    }
  };

  if (!countries) {
    return <div>Loading...</div>;
  }

  return (
    <div className="space-y-2">
      <Label
        htmlFor="phone"
        // className={cn("transition-colors", focused ? "text-primary" : "")}
      >
        {label ?? "Phone Number"}
      </Label>
      <div className="relative" ref={dropdownRef}>
        <div
          className={cn(
            "flex items-center border rounded-md overflow-hidden transition-all"
          )}
        >
          {/* Country Selector */}
          <div
            className="flex items-center text-sm cursor-pointer border-r px-3 py-2"
            onClick={() => setDropdownOpen(!dropdownOpen)}
          >
            <span>{selectedCountry?.flag}</span>
            <span className="px-1 font-medium">
              {selectedCountry?.phoneCode}
            </span>
            <span>
              {dropdownOpen ? (
                <ChevronUpIcon className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDownIcon className="h-4 w-4 text-muted-foreground" />
              )}
            </span>
          </div>

          {/* Phone Input */}
          <Input
            ref={inputRef}
            id="phone"
            type="tel"
            inputMode="numeric"
            className={cn(
              "border-none focus-visible:ring-0 flex-1 focus:outline-none bg-transparent"
            )}
          ></Input>
        </div>
        {/* Country Dropdown */}
        {dropdownOpen && (
          <div className="absolute z-10 mt-1 w-full bg-background border rounded-md shadow-lg max-h-60 overflow-auto">
            {countries.map((country) => (
              <div
                key={country.code}
                className={cn(
                  "flex items-center cursor-pointer hover:bg-muted px-3 py-2"
                  //   country.code === value.countryCode ? "bg-muted" : ""
                )}
                onClick={() => {}}
              >
                <span>{country.flag}</span>
                <span className="px-1 font-medium">{country.phoneCode}</span>
                <span className="ml-1 text-muted-foreground text-sm">
                  {country.name}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
