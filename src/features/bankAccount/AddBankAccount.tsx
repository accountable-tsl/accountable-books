import { useEffect, useState } from "react";
import { FormField } from "@/components/FormField";
import { AutocompleteDropdown } from "../../components/AutocompleteDropdown";
import { useCurrencies } from "@/hooks/useCurrencies";
import { useCountries } from "@/hooks/useCountries";
import ErrorPage from "../../components/ErrorPage";
import { getDefaultCountryAndCurrency } from "@/shared/utils/randomUtils";
import { companyType, CountryList } from "@/types/types";
import { useCompany } from "@/domains/company/store";
import { Controller, useForm } from "react-hook-form";
import {
  AddBankAccountProps,
  bankAccountType,
  NewBankAccountInput,
  newBankAccountInput,
} from "./types";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/components/ui/input";
import { toTitleCase } from "@/shared/utils/formattingUtils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBanks } from "@/domains/banks/hooks";
import { toast } from "sonner";
import { createNewBankAccount } from "./api";
import { cn } from "@/lib/utils";
import { SkeletonBlock } from "@/components/SkeletonBlock";

export default function AddBankAccount({
  onSuccess,
  onCancel,
}: AddBankAccountProps) {
  // States
  const [selectedCountry, setSelectedCountry] = useState<
    CountryList | undefined
  >();
  const [countryError, setCountryError] = useState("");

  // Hooks
  const { data: currenciesData, isLoading: isLoadingCurrencies } =
    useCurrencies();
  const { data: countriesData, isLoading: isLoadingCountries } = useCountries();
  const { data: bankData, isLoading: isLoadingBanks } = useBanks(
    "countryId",
    selectedCountry?.id
  );
  const { company } = useCompany();

  // Computed
  const currencies = currenciesData?.data ?? [];
  const countries = countriesData?.data ?? [];
  const banks = bankData?.data ?? [];
  const isIndividual = company?.companyType === companyType.enum.individual;

  const {
    register,
    control,
    reset,
    handleSubmit,
    getValues,
    setValue,
    formState: { errors: formErrors, isSubmitting, isValid },
  } = useForm<NewBankAccountInput>({
    resolver: zodResolver(newBankAccountInput),
    defaultValues: {
      currencyId: "",
      accountType: bankAccountType.enum.checkings_current,
    },
    mode: "onChange",
  });

  // Handle country selection
  const handleCountryChange = (countryId: string) => {
    const country = countries.find((country) => country.id === countryId);
    setSelectedCountry(country);
    setValue("bankId", "");
  };

  // Form submission handler
  const onSubmit = async (data: NewBankAccountInput) => {
    try {
      // Submit data to your backend API here
      // Example: await api.addBankAccount(data);
      if (!company?.id) {
        toast.error("Failed to add bank account. Please try again.");
        return;
      }

      const res = await createNewBankAccount({
        companyId: company.id,
        data,
      });

      if (!res.success) {
        toast.error(res.message || "Failed to add bank account");
        return;
      }

      console.log({ data: res.data, message: res.message });
      // Show success feedback & reset form
      toast.success("Bank account added successfully");
      reset();
      onSuccess?.(res.data);
    } catch (error) {
      toast.error("Failed to add bank account");
    }
  };

  // Set default country and currency
  useEffect(() => {
    if (company && currencies.length && countries.length) {
      const { country, currency } = getDefaultCountryAndCurrency({
        company,
        countries,
        currencies,
      });

      setSelectedCountry((prev) => (prev?.id === country.id ? prev : country));
      reset({
        ...getValues(), // preserves what the user already typed
        currencyId: currency.id,
        bankId: "",
      });
    }
  }, [company, countries, currencies]);

  if (isLoadingCurrencies || isLoadingCountries) {
    return (
      <div className="flex flex-col gap-4 p-4 max-w-md">
        <SkeletonBlock height="400px" />
      </div>
    );
  }
  // Handle loading and error states
  if (!currenciesData?.success || !countriesData?.success) {
    return <ErrorPage type="default" />;
  }

  return (
    <div className="flex flex-col gap-4 p-4 max-w-md">
      <div className="text-lg font-semibold">Add Bank Account</div>
      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
        <div className="flex w-full gap-2">
          {/* We need country to be able to filter the bank list */}
          <FormField
            id="select-country"
            label="Country"
            helpTooltip="In which country is this bank located?"
            tooltipStyle="w-full"
            className="flex-1"
            error={countryError}
          >
            <AutocompleteDropdown
              id="select-country"
              items={countries || []}
              mapItem={(item) => ({
                value: item.id,
                label: `${item.flag} ${item.name}`,
              })}
              placeholder="Select country"
              value={selectedCountry?.id || ""}
              onValueChange={handleCountryChange}
            />
          </FormField>

          <FormField
            id="select-currency"
            label="Currency"
            helpTooltip="Your bank account currency"
            tooltipStyle="w-full"
            className="flex-1"
            error={formErrors.currencyId?.message}
          >
            <Controller
              name="currencyId"
              control={control}
              render={({ field }) => (
                <AutocompleteDropdown
                  id="currencyId"
                  value={field.value}
                  onValueChange={field.onChange}
                  onBlur={field.onBlur}
                  ref={field.ref}
                  items={currencies || []}
                  mapItem={(item) => ({
                    value: item.id,
                    label: `${item.name} (${item.symbol})`,
                  })}
                  placeholder="Select currency"
                />
              )}
            />
          </FormField>
        </div>

        <div>
          <FormField
            id="bankId"
            label="Bank"
            helpTooltip="Select your bank"
            tooltipStyle="w-full"
            className="flex-1"
            error={formErrors.bankId?.message}
            required
          >
            <Controller
              name="bankId"
              control={control}
              render={({ field }) => (
                <AutocompleteDropdown
                  id="bankId"
                  value={field.value}
                  onValueChange={field.onChange}
                  onBlur={field.onBlur}
                  ref={field.ref}
                  items={banks || []}
                  mapItem={(bank) => ({
                    value: bank.id,
                    label: `${bank.countryFlag} ${bank.displayName}`,
                  })}
                  placeholder="Select bank"
                  disabled={!selectedCountry}
                />
              )}
            />
          </FormField>
        </div>

        <div>
          <FormField
            label="Bank Account Name"
            helpTooltip="A clear name to easily identify this account (e.g., 'Main Checking' or 'Savings - Travel Fund')"
            tooltipStyle="w-full max-w-[14rem] text-center"
            required
            error={formErrors.displayName?.message}
          >
            <Input
              {...register("displayName", { required: true })}
              placeholder="HSBX Operations Account"
            />
          </FormField>
        </div>

        <FormField
          label="Account Number"
          helpTooltip="Your official bank account number"
          className="flex-1"
          error={formErrors.accountNumber?.message}
        >
          <Input {...register("accountNumber")} placeholder="0011223344" />
        </FormField>

        <div className="grid grid-cols-2 gap-2">
          <FormField
            id="accountType"
            label="Account Type"
            className="flex-1"
            error={formErrors.accountType?.message}
          >
            <Controller
              name="accountType"
              control={control}
              defaultValue={bankAccountType.enum.checkings_current}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select account type" />
                  </SelectTrigger>
                  <SelectContent>
                    {bankAccountType.options
                      .filter((b) => ["checkings_current"].includes(b))
                      .map((b) => (
                        <SelectItem key={b} value={b}>
                          {toTitleCase(b, { delimiter: "_", joinWith: " / " })}
                        </SelectItem>
                      ))}
                    {bankAccountType.options
                      .filter((b) => !["checkings_current"].includes(b))
                      .map((b) => (
                        <SelectItem key={b} value={b}>
                          {toTitleCase(b, { delimiter: "_" })}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>
          {!isIndividual && (
            <FormField
              label="Internal Code"
              helpTooltip="Code for your bank account in coa"
              error={formErrors.accountCode?.message}
            >
              <Input
                {...register("accountCode")}
                placeholder="e.g. 123, Bank-001"
              />
            </FormField>
          )}
        </div>

        <div
          className={cn(
            "flex gap-2",
            onCancel ? "justify-between" : "justify-end"
          )}
        >
          {onCancel && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                reset();
                onCancel?.();
              }}
            >
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={isSubmitting || !isValid}>
            Add Bank Account
          </Button>
        </div>
      </form>
    </div>
  );
}
