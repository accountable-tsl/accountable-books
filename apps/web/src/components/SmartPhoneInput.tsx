import {
  AlertCircle,
  Check,
  ChevronDownIcon,
  ChevronUpIcon,
  SearchIcon,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useCountries } from '@/shared/hooks/useCountries';
import type { Country } from '@/shared/types/core';
import { formatPhoneNumber } from '@/shared/utils/formatting-utils';

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
  showLabel?: boolean;
}

const getCountryFromLocale = (countries: Country[]): Country => {
  const locale = navigator.language;
  const countryCode = locale.split('-')[1];
  const userCountry = countries.find((country) => country.code === countryCode);
  return userCountry || countries[0];
};

export function SmartPhoneInput({
  value,
  onChange,
  isValid,
  label,
  showLabel = true,
}: SmartPhoneInputProps) {
  const countriesHook = useCountries();
  const countries = (countriesHook.data?.data ?? []).sort((a, b) =>
    a.phoneCode.localeCompare(b.phoneCode),
  );

  const phoneCodeMap = new Map<string, Country[]>();
  const allCountries = useMemo(() => {
    return countries.length
      ? [
          ...countries,
          {
            id: 'UNKNOWN',
            code: 'UNKNOWN',
            name: 'Other Country',
            phoneCode: '',
            flag: '🌐',
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
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [focused, setFocused] = useState(false);
  const [unknownCountryCode, setUnknownCountryCode] = useState('');
  const [countryDetectionActive, setCountryDetectionActive] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState<Country>(
    getCountryFromLocale(allCountries),
  );

  const [searchQuery, setSearchQuery] = useState('');

  const isUnknownCountry = value?.countryCode === 'UNKNOWN';
  const maxLength = 15;

  const filteredCountries = countries.filter((country) => {
    if (!searchQuery) return true;

    const query = searchQuery.toLowerCase();
    return (
      country.name.toLowerCase().includes(query) ||
      country.phoneCode.includes(query) ||
      country.code.toLowerCase().includes(query)
    );
  });

  // Extract standardized country code from input (for unknown countries)
  const extractCountryCode = (input: string): string => {
    if (!input.startsWith('+')) return '';

    // Extract just the country code part (typically 1-3 digits after +)
    // For standardization, we'll take up to 3 digits after the +
    const match = input.match(/^\+(\d{1,3})/);
    if (match && match[1]) {
      return '+' + match[1];
    }
    return '';
  };

  const detectCountryFromInput = (
    input: string,
  ): { country: Country; remainingDigits: string } | null => {
    if (!input || !input.startsWith('+')) return null;

    // Try to match the input against known country codes
    // Start with longer codes first to avoid partial matches
    const sortedPhoneCodes = Array.from(phoneCodeMap.keys()).sort(
      (a, b) => b.length - a.length,
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
    const input = e.target.value;

    // Check max length for digits only, excluding +
    if (
      input.replace(/\D/g, '').length > maxLength &&
      input.length > inputValue.length
    ) {
      return;
    }

    // Filter input to only allow numbers and + (only at the beginning)
    const cleanedInput = input.startsWith('+')
      ? '+' + input.substring(1).replace(/[^\d]/g, '')
      : input.replace(/[^\d]/g, '');

    // let strippedInput = cleanedInput;
    // if (
    //   cleanedInput.startsWith("+") &&
    //   selectedCountry.phoneCode &&
    //   cleanedInput.startsWith(selectedCountry.phoneCode)
    // ) {
    //   const remaining = cleanedInput.substring(
    //     selectedCountry.phoneCode.length
    //   );
    //   // Only strip if input exactly matches phoneCode or remaining is digits
    //   if (remaining === "" || /^\d*$/.test(remaining)) {
    //     strippedInput = remaining;
    //   }
    // }

    console.log('Cleaned input', cleanedInput);

    setInputValue(cleanedInput);
    setCountryDetectionActive(cleanedInput.startsWith('+'));

    // If input starts with +, try to detect country
    if (cleanedInput.startsWith('+')) {
      const detectedCountry = detectCountryFromInput(input);
      console.log('Detected country', detectedCountry);

      if (detectedCountry) {
        setSelectedCountry(detectedCountry.country);
        setInputValue(detectedCountry.remainingDigits);

        console.log('Selected country', selectedCountry);

        const formattedPhoneNumber = formatPhoneNumber(
          detectedCountry.remainingDigits,
          detectedCountry.country,
        );

        console.log(formattedPhoneNumber);

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
            countryCode: 'UNKNOWN',
            completeNumber: input,
          });
        }
      }
    } else if (isUnknownCountry) {
      if (onChange) {
        onChange({
          phoneNumber: input,
          countryCode: 'UNKNOWN',
          completeNumber:
            unknownCountryCode +
            (unknownCountryCode && input ? ' ' : '') +
            input,
        });
      }
    } else {
      // Normal input handling for known country
      const formattedPhoneNumber = formatPhoneNumber(
        cleanedInput,
        selectedCountry,
      );
      const completeNumber =
        `${selectedCountry.phoneCode} ${formattedPhoneNumber}`.trim();

      console.log(completeNumber);
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
    if (countryCode === 'UNKNOWN') {
      // For unknown country, start with the unknown code if we have one
      const initialValue = unknownCountryCode || '+';
      if (onChange) {
        onChange({
          phoneNumber: initialValue,
          countryCode: 'UNKNOWN',
          completeNumber: initialValue,
        });
      }
      setInputValue(initialValue);
    } else {
      // For known countries, keep only the digits from the national number
      let phoneNumber = value.phoneNumber;
      if (isUnknownCountry) {
        // If coming from unknown country, extract only the digits
        phoneNumber = value.phoneNumber.replace(/\D/g, '');
      }

      const newCountry = countries?.find((c) => c.code === countryCode);
      if (!newCountry) return;
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

  // Handle paste event
  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');

    // Set the input value to the pasted text to trigger the change handler
    handleChange({
      target: { value: pastedText },
    } as React.ChangeEvent<HTMLInputElement>);
  };

  // Handle keydown to prevent non-numeric input
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Allow: backspace, delete, tab, escape, enter, and navigation keys
    if (
      [8, 9, 13, 27, 46, 37, 38, 39, 40].indexOf(e.keyCode) !== -1 ||
      // Allow: Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
      (e.ctrlKey === true && [65, 67, 86, 88].indexOf(e.keyCode) !== -1) ||
      // Allow: home, end, page up, page down
      (e.keyCode >= 35 && e.keyCode <= 40)
    ) {
      return;
    }

    // Allow + only at the beginning of an empty field
    if (e.key === '+' && inputValue === '') {
      return;
    }

    // Prevent if not a number or if max length reached
    if (
      !/^\d$/.test(e.key) ||
      (!isUnknownCountry && inputValue.replace(/\D/g, '').length >= maxLength)
    ) {
      e.preventDefault();
    }
  };

  // Handle dropdown toggle
  const handleDropdownToggle = () => {
    const newDropdownState = !dropdownOpen;
    setDropdownOpen(newDropdownState);

    if (newDropdownState) {
      // When opening dropdown, pre-fill search with current country's dial code
      if (!isUnknownCountry) {
        setSearchQuery(selectedCountry.phoneCode);
      } else if (unknownCountryCode) {
        setSearchQuery(unknownCountryCode);
      }

      // Focus the search input
      setTimeout(() => {
        if (searchInputRef.current) {
          searchInputRef.current.focus();
        }
      }, 10);
    } else {
      // Clear search when closing
      setSearchQuery('');
    }
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

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
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
  }, [allCountries, selectedCountry, countries.length, countryDetectionActive, value?.countryCode]);

  useEffect(() => {
    if (dropdownOpen && selectedRef.current) {
      selectedRef.current.scrollIntoView({ block: 'center' });
    }
  }, [dropdownOpen]);

  if (!countries.length) {
    return <div>Loading...</div>;
  }

  return (
    <div className="space-y-4">
      {showLabel && (
        <Label
          htmlFor="phone"
          className={cn('transition-colors', focused ? 'text-primary' : '')}
        >
          {label ?? 'Phone Number'}
        </Label>
      )}
      <div className="relative" ref={dropdownRef}>
        <div
          className={cn(
            'flex items-center overflow-hidden rounded-md border transition-all',
          )}
        >
          {/* Country Selector */}
          <div
            className="flex cursor-pointer items-center border-r px-3 py-2 text-sm"
            onClick={handleDropdownToggle}
          >
            <span>{selectedCountry?.flag}</span>
            <span className="px-1 font-medium">
              {selectedCountry?.phoneCode}
            </span>
            <span>
              {dropdownOpen ? (
                <ChevronUpIcon className="text-muted-foreground h-4 w-4" />
              ) : (
                <ChevronDownIcon className="text-muted-foreground h-4 w-4" />
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
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={
              isUnknownCountry
                ? 'Enter full number with country code'
                : '000 000 0000'
            }
            className={cn(
              'flex-1 border-none bg-transparent focus:outline-none focus-visible:ring-0',
            )}
            aria-invalid={isValid === false}
            aria-describedby={isValid === false ? 'phone-error' : undefined}
          />
        </div>
        {/* Country Dropdown */}
        {dropdownOpen && (
          <div className="bg-background absolute z-10 mt-1 flex max-h-80 w-full flex-col overflow-hidden rounded-md border shadow-lg">
            {/* Search Input */}
            <div className="bg-background sticky top-0 z-20 border-b p-2">
              <div className="relative">
                <SearchIcon className="text-muted-foreground absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2 transform" />
                <Input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search countries..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 pr-8 pl-8"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 transform"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Countries List */}
            <div className="max-h-60 overflow-auto">
              {filteredCountries.length === 0 ? (
                <div className="text-muted-foreground p-4 text-center">
                  No countries found
                </div>
              ) : (
                filteredCountries.map((country) => (
                  <div
                    key={country.code}
                    ref={
                      country.code === selectedCountry?.code
                        ? selectedRef
                        : null
                    }
                    className={cn(
                      'hover:bg-muted flex cursor-pointer items-center px-3 py-2',
                      country.code === selectedCountry?.code ? 'bg-muted' : '',
                    )}
                    onClick={() => {
                      handleCountryChange(country.code);
                    }}
                  >
                    <span>{country.flag}</span>
                    <span className="px-1 font-medium">
                      {country.phoneCode}
                    </span>
                    <span className="text-muted-foreground ml-1 text-sm">
                      {country.name}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        <p className="text-muted-foreground mt-1.5 text-xs">
          {isUnknownCountry ? (
            <span className="flex items-center text-purple-500">
              <AlertCircle className="mr-1 h-3 w-3" />
              Unknown country code - enter your full number including country
              code
            </span>
          ) : !isUnknownCountry && inputValue.length >= maxLength ? (
            <span className="flex items-center text-green-500">
              <Check className="mr-1 h-3 w-3" />
              Maximum length reached
            </span>
          ) : countryDetectionActive ? (
            'Enter country code (e.g. +44) to auto-detect country'
          ) : (
            `Format example: 000 000 0000`
          )}
        </p>
      </div>
    </div>
  );
}
