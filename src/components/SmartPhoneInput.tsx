import { cn } from "@/lib/utils";
import { Label } from "./ui/label";
import { useEffect, useMemo, useRef, useState } from "react";
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
  isValid?: boolean | null;
  label?: string;
}

const getCountryFromLocale = (countries: CountryList[]): CountryList => {
  const locale = navigator.language;
  const countryCode = locale.split("-")[1];
  const userCountry = countries.find((country) => country.code === countryCode);
  return userCountry || countries[0];
};

export function SmartPhoneInput({
  value,
  onChange,
  isValid,
  label,
}: SmartPhoneInputProps) {
  const countriesHook = useCountries();
  let countries = (countriesHook.data?.data ?? []).sort((a, b) =>
    a.phoneCode.localeCompare(b.phoneCode)
  );

  console.log(countries);
  let phoneCodeMap = new Map<string, CountryList[]>();
  const allCountries = useMemo(() => {
    return countries.length
      ? [
          ...countries,
          {
            id: "UNKNOWN",
            code: "UNKNOWN",
            name: "Other Country",
            phoneCode: "",
            flag: "🌐",
          },
        ]
      : [];
  }, [countries]);

  allCountries.forEach((country) => {
    if (country.phoneCode) {
      const existing = phoneCodeMap.get(country.phoneCode) || [];
      phoneCodeMap.set(country.phoneCode, [...existing, country]);
    }
  });

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLDivElement | null>(null);

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [unknownCountryCode, setUnknownCountryCode] = useState("");
  const [countryDetectionActive, setCountryDetectionActive] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState<CountryList>(
    getCountryFromLocale(allCountries)
  );

  const isUnknownCountry = value?.countryCode === "UNKNOWN";
  const maxLength = 16;

  // Extract standardized country code from input (for unknown countries)
  const extractCountryCode = (input: string): string => {
    if (!input.startsWith("+")) return "";

    // Extract just the country code part (typically 1-3 digits after +)
    // For standardization, we'll take up to 3 digits after the +
    const match = input.match(/^\+(\d{1,3})/);
    if (match && match[1]) {
      return "+" + match[1];
    }
    return "";
  };

  const detectCountryFromInput = (
    input: string
  ): { country: CountryList; remainingDigits: string } | null => {
    if (!input || !input.startsWith("+")) return null;

    // Try to match the input against known country codes
    // Start with longer codes first to avoid partial matches
    const sortedPhoneCodes = Array.from(phoneCodeMap.keys()).sort(
      (a, b) => b.length - a.length
    );

    for (const phoneCode of sortedPhoneCodes) {
      if (input.startsWith(phoneCode)) {
        const countries = phoneCodeMap.get(phoneCode);
        if (countries) {
          return {
            country: countries[0],
            remainingDigits: input.substring(phoneCode.length),
          };
        }
      }
    }

    return null;
  };

  // Handle input change
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let input = e.target.value;

    // Check max length for digits only, excluding +
    if (
      input.replace(/\D/g, "").length > maxLength &&
      input.length > inputValue.length
    ) {
      return;
    }

    // Filter input to only allow numbers and + (only at the beginning)
    let cleanedInput = input.startsWith("+")
      ? "+" + input.substring(1).replace(/[^\d]/g, "")
      : input.replace(/[^\d]/g, "");

    let strippedInput = cleanedInput;
    if (
      cleanedInput.startsWith("+") &&
      selectedCountry.phoneCode &&
      cleanedInput.startsWith(selectedCountry.phoneCode)
    ) {
      const remaining = cleanedInput.substring(
        selectedCountry.phoneCode.length
      );
      // Only strip if input exactly matches phoneCode or remaining is digits
      if (remaining === "" || /^\d*$/.test(remaining)) {
        strippedInput = remaining;
      }
    }

    setInputValue(strippedInput);
    setCountryDetectionActive(cleanedInput.startsWith("+"));

    // If input starts with +, try to detect country
    if (cleanedInput.startsWith("+")) {
      const detectedCountry = detectCountryFromInput(input);

      if (detectedCountry) {
        setSelectedCountry(detectedCountry.country);

        const formattedPhoneNumber = formatPhoneNumber(
          detectedCountry.remainingDigits,
          detectedCountry.country
        );

        console.log("formattedPhoneNumber", formattedPhoneNumber);

        const completeNumber =
          `${detectedCountry.country.phoneCode} ${formattedPhoneNumber}`.trim();

        if (onChange) {
          onChange({
            phoneNumber: formattedPhoneNumber,
            countryCode: detectedCountry.country.code,
            completeNumber: completeNumber,
          });
        }
      } else if (input.length >= 2) {
        // Unknown country code - extract standardized country code
        const standardizedCode = extractCountryCode(input);
        setUnknownCountryCode(standardizedCode);

        if (onChange) {
          onChange({
            phoneNumber: input,
            countryCode: "UNKNOWN",
            completeNumber: input,
          });
        }
      }
    } else if (isUnknownCountry && selectedCountry) {
      // For unknown country with no + prefix, just use the input as is
      const formattedPhoneNumber = formatPhoneNumber(
        cleanedInput,
        selectedCountry
      );
      const completeNumber =
        `${selectedCountry.phoneCode} ${formattedPhoneNumber}`.trim();

      if (onChange) {
        onChange({
          phoneNumber: formattedPhoneNumber,
          countryCode: selectedCountry.code,
          completeNumber,
        });
      }
    }
  };

  // Handle country change from dropdown
  const handleCountryChange = (countryCode: string) => {
    if (countryCode === "UNKNOWN") {
      // For unknown country, start with the unknown code if we have one
      const initialValue = unknownCountryCode || "+";
      if (onChange) {
        onChange({
          phoneNumber: initialValue,
          countryCode: "UNKNOWN",
          completeNumber: initialValue,
        });
      }
      setInputValue(initialValue);
    } else {
      // For known countries, keep only the digits from the national number
      let phoneNumber = value.phoneNumber;
      if (isUnknownCountry) {
        // If coming from unknown country, extract only the digits
        phoneNumber = value.phoneNumber.replace(/\D/g, "");
      }

      const newCountry = countries?.find((c) => c.code === countryCode)!;
      setSelectedCountry(newCountry);
      const formattedPhoneNumber = formatPhoneNumber(phoneNumber, newCountry);
      const completeNumber = `${newCountry?.phoneCode}${phoneNumber}`;

      if (onChange) {
        onChange({
          phoneNumber: formattedPhoneNumber,
          countryCode: countryCode,
          completeNumber,
        });
      }
      setInputValue(formattedPhoneNumber);
    }

    setDropdownOpen(false);
    inputRef.current?.focus();
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Sync input value with the national number when country changes
  useEffect(() => {
    setInputValue(value.phoneNumber);
  }, [value.phoneNumber, value.countryCode]);

  useEffect(() => {
    setInputValue(value.phoneNumber);
  }, [value.phoneNumber, value.countryCode]);

  useEffect(() => {
    if (!countryDetectionActive && countries.length) {
      const initialCountry =
        allCountries.find((c) => c.code === value?.countryCode) ||
        getCountryFromLocale(allCountries) ||
        allCountries[0];

      setSelectedCountry(initialCountry);
    }
  }, [countries]);

  useEffect(() => {
    if (dropdownOpen && selectedRef.current) {
      selectedRef.current.scrollIntoView({ block: "center" });
    }
  }, [dropdownOpen]);

  if (!countries.length) {
    return <div>Loading...</div>;
  }

  console.log(selectedCountry);

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
            value={inputValue}
            onChange={handleChange}
            placeholder={
              isUnknownCountry
                ? "Enter full number with country code"
                : "000 000 0000"
            }
            className={cn(
              "border-none focus-visible:ring-0 flex-1 focus:outline-none bg-transparent"
            )}
          ></Input>
        </div>
        {/* Country Dropdown */}
        {dropdownOpen && (
          <div className="absolute z-10 mt-1 w-full bg-background border rounded-md shadow-lg max-h-60 overflow-auto">
            {allCountries.map((country) => (
              <div
                key={country.code}
                ref={
                  country.code === selectedCountry?.code ? selectedRef : null
                }
                className={cn(
                  "flex items-center cursor-pointer hover:bg-muted px-3 py-2",
                  country.code === selectedCountry?.code ? "bg-muted" : ""
                )}
                onClick={() => {
                  handleCountryChange(country.code);
                }}
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

        <p>{}</p>
      </div>
    </div>
  );
}
