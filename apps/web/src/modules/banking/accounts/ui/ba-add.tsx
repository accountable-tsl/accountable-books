import type { CreateBankAccountRes } from '@/domains-pending-migration/bankConnection/shared/api';
import type {
  AddBankAccountProps,
  NewBankAccountInput,
} from '@/modules/banking/accounts';
import type { Country } from '@/shared/types/core';
import { useEffect, useMemo, useState } from 'react';
import { AutocompleteDropdown } from '@/components/AutocompleteDropdown';
import ErrorPage from '@/components/ErrorPage';
import { FormField } from '@/components/FormField';
import { SkeletonBlock } from '@/components/SkeletonBlock';
import { TooltipHelper } from '@/components/TooltipHelper';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createNewBankAccount } from '@/domains-pending-migration/bankConnection/shared/api';
import { cn } from '@/lib/utils';
import {
  bankAccountType,
  newBankAccountInput,
} from '@/modules/banking/accounts';
import { useBanks } from '@/modules/banking/institutions/model/hooks';
import { useCountries } from '@/shared/hooks/useCountries';
import { useCurrencies } from '@/shared/hooks/useCurrencies';
import { companyType } from '@/shared/types/core';
import { toTitleCase } from '@/shared/utils/formatting-utils';
import { getDefaultCountryAndCurrency } from '@/shared/utils/random-utils';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useSession } from '@session';
import {
  Building2,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  Coins,
  Wallet,
} from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';

export default function AddBankAccount({
  onSuccess,
  onCancel,
}: AddBankAccountProps) {
  // States
  const [selectedCountry, setSelectedCountry] = useState<Country | undefined>();
  const [countryError, setCountryError] = useState('');
  const [createdAccount, setCreatedAccount] =
    useState<CreateBankAccountRes | null>(null);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [showOptionalFields, setShowOptionalFields] = useState(false);
  const [displayValue, setDisplayValue] = useState('');

  // Hooks
  const { data: currenciesData, isLoading: isLoadingCurrencies } =
    useCurrencies();
  const { data: countriesData, isLoading: isLoadingCountries } = useCountries();
  const { data: bankData } = useBanks('countryId', selectedCountry?.id);
  const { company, loading } = useSession();

  // Computed
  const currencies = useMemo(() => currenciesData?.data ?? [], [currenciesData?.data]);
  const countries = useMemo(() => countriesData?.data ?? [], [countriesData?.data]);
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
    resolver: standardSchemaResolver(newBankAccountInput),
    defaultValues: {
      currencyId: '',
      accountType: bankAccountType.enum.checkings_current,
    },
    mode: 'onChange',
  });

  // Currency formatting
  const formatCurrency = (value: string) => {
    // Allow negative values by preserving the minus sign
    const isNegative = value.startsWith('-');
    const numeric = value.replace(/[^\d]/g, '');
    const num = Number(numeric);
    if (isNaN(num)) return '';

    const selectedCurrency = currencies.find(
      (c) => c.id === getValues('currencyId'),
    );
    if (!selectedCurrency) return num.toLocaleString();

    const formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: selectedCurrency.code,
      maximumFractionDigits: 2,
    }).format((isNegative ? -num : num) / 100);

    return formatted;
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;
    const isNegative = input.startsWith('-');
    const numeric = input.replace(/[^\d]/g, ''); // strip non-digits
    const numValue = Number(numeric);
    const finalValue = isNegative ? -numValue : numValue;

    setDisplayValue(formatCurrency(input));
    setValue('openingBalance', finalValue / 100);
  };

  // Handle country selection
  const handleCountryChange = (countryId: string) => {
    setHasUserInteracted(true);
    const country = countries.find((country) => country.id === countryId);
    setSelectedCountry(country);
    setValue('bankId', '');
  };

  // Form submission handler
  const onSubmit = async (data: NewBankAccountInput) => {
    console.log(data);
    try {
      if (!company?.id) {
        toast.error('Failed to add bank account. Please try again.');
        return;
      }

      if (!selectedCountry) {
        setCountryError('Please select a country');
        toast.error('Please select a country');
        return;
      }

      // Validate opening balance fields
      const hasBalance =
        data.openingBalance !== undefined && data.openingBalance !== null;
      const hasDate =
        data.openingBalanceDate && data.openingBalanceDate.trim() !== '';

      if (hasBalance && !hasDate) {
        toast.error('Please select a date for the opening balance');
        return;
      }
      if (hasDate && !hasBalance) {
        toast.error('Please enter an opening balance amount');
        return;
      }

      // Double confirmation for zero opening balance
      if (hasBalance && hasDate && data.openingBalance === 0) {
        const confirmed = window.confirm(
          'You are setting the opening balance to $0.00. This means the account will start with no balance on the selected date. Is this correct?',
        );
        if (!confirmed) {
          return;
        }
      }

      const { openingBalance, openingBalanceDate, ...rest } = data;

      const res = await createNewBankAccount({
        companyId: company.id,
        data: {
          ...rest,
          ...(openingBalance && openingBalanceDate
            ? {
                openingBalance: {
                  date: new Date(openingBalanceDate),
                  amount: openingBalance,
                  origin: 'user_entered',
                  role: 'checkpoint',
                  metadata: {
                    captureChannel: 'user_account_creation',
                    captureInitiator: 'user',
                    note: 'User-provided opening balance during bank account creation',
                  },
                },
              }
            : {}),
          accountMetadata: {
            connection_source: 'manual',
            connection_note:
              'User-provided opening balance during bank account creation',
          },
        },
      });

      if (!res.success || !res.data) {
        toast.error(res.message || 'Failed to add bank account');
        return;
      }

      setCreatedAccount(res.data);
      toast.success('Bank account added successfully');
      reset();
    } catch {
      toast.error('Failed to add bank account');
    }
  };

  // Set default country and currency
  useEffect(() => {
    if (
      !hasUserInteracted &&
      company &&
      currencies.length &&
      countries.length
    ) {
      const { country, currency } = getDefaultCountryAndCurrency({
        company,
        countries,
        currencies,
      });

      setSelectedCountry((prev) => (prev?.id === country.id ? prev : country));
      reset({
        ...getValues(), // preserves what the user already typed
        currencyId: currency.id,
        bankId: '',
      });
    }
  }, [
    company,
    countries,
    currencies,
    hasUserInteracted,
    setValue,
    getValues,
    reset,
  ]);

  if (loading || isLoadingCurrencies || isLoadingCountries) {
    return (
      <div className="flex max-w-md flex-col gap-4 p-4">
        <SkeletonBlock height="400px" />
      </div>
    );
  }
  // Handle loading and error states
  if (!currenciesData?.success || !countriesData?.success) {
    return <ErrorPage type="default" />;
  }

  const caf = [
    {
      name: 'Account Name',
      icon: Wallet,
      value: createdAccount?.bankAccountName,
    },
    {
      name: 'Bank',
      icon: Building2,
      value: createdAccount?.bankName,
    },
    {
      name: 'Currency',
      icon: Coins,
      value: createdAccount?.currencyCode,
    },
  ];

  if (createdAccount) {
    return (
      <div className="mx-auto flex max-w-md min-w-sm flex-col justify-between gap-4 p-4">
        <div className="flex flex-col items-center justify-center">
          <CircleCheck className="h-12 w-12" />
          <p className="text-foreground mt-2 text-lg font-medium">
            Bank Account Added!
          </p>
          <p className="text-muted-foreground text-sm">
            Your account has been successfully connected
          </p>
        </div>
        {/* <div className="rounded flex-1 border p-4 w-full bg-muted grid grid-cols-[auto_1fr] gap-x-4 gap-y-1"> */}
        <div className="bg-muted/80 flex flex-col gap-4 rounded-sm p-4 text-sm">
          {caf.map((c) => (
            <div className="flex items-center gap-3">
              <div>
                <div className="bg-background border-border/50 rounded-md border p-2">
                  <c.icon className="text-muted-foreground h-4 w-4" />
                </div>
              </div>
              <div className="flex-1">
                <p className="text-muted-foreground mb-1 text-xs font-medium">
                  {c.name}
                </p>
                <p className="text-foreground truncate font-medium">
                  {c.value || 'Not specified'}
                </p>
              </div>
            </div>
          ))}
        </div>
        {/* <div className="">Account Name:</div>
          <div className="font-semibold">{createdAccount?.bankAccountName}</div>
          <div className="">Bank:</div>
          <div>{createdAccount?.bankName}</div>
          <div className="">Currency:</div>
          <div>{`${createdAccount?.currencyCode}`}</div> */}
        {/* </div> */}
        <div className="my-4 grid w-full grid-cols-2 justify-between gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setCreatedAccount(null);
              reset();
            }}
            className="w-full"
          >
            Add Another
          </Button>
          <Button
            onClick={() => {
              setCreatedAccount(null);
              onSuccess?.(createdAccount || undefined);
            }}
            className="w-full"
          >
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative mx-auto flex w-full max-w-md flex-col gap-4 py-4">
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
              value={selectedCountry?.id || ''}
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
              {...register('displayName', { required: true })}
              placeholder="HSBX Operations Account"
            />
          </FormField>
        </div>

        <FormField
          label="Account Number"
          helpTooltip="Enter your bank account number exactly as it appears on your account. If this account doesn’t have a bank account number (e.g., for wallets or virtual accounts), enter 'NA'."
          tooltipStyle="w-full max-w-[16rem] text-center"
          className="flex-1"
          error={formErrors.accountNumber?.message}
          required
        >
          <Input {...register('accountNumber')} placeholder="0011223344" />
        </FormField>

        {/* Optional Fields Toggle */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowOptionalFields(!showOptionalFields)}
            className="bg-muted/50 hover:bg-muted flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors"
          >
            <div>
              <span className="text- text-[0.9rem] font-medium">
                Additional Settings
              </span>
              <p className="text-xs text-gray-500">
                Account type, internal code, and opening balance
              </p>
            </div>
            {showOptionalFields ? (
              <ChevronUp className="h-5 w-5 text-gray-400" />
            ) : (
              <ChevronDown className="h-5 w-5 text-gray-400" />
            )}
          </button>

          {/* Collapsible Content */}
          <div
            className={cn(
              'overflow-hidden transition-all duration-300 ease-in-out',
              showOptionalFields
                ? 'mt-3 max-h-96 opacity-100'
                : 'max-h-0 opacity-0',
            )}
          >
            <div className="space-y-4 rounded-lg py-4">
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
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select account type" />
                        </SelectTrigger>
                        <SelectContent>
                          {bankAccountType.options
                            .filter((b) => ['checkings_current'].includes(b))
                            .map((b) => (
                              <SelectItem key={b} value={b}>
                                {toTitleCase(b, {
                                  delimiter: '_',
                                  joinWith: ' / ',
                                })}
                              </SelectItem>
                            ))}
                          {bankAccountType.options
                            .filter((b) => !['checkings_current'].includes(b))
                            .map((b) => (
                              <SelectItem key={b} value={b}>
                                {toTitleCase(b, { delimiter: '_' })}
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
                      {...register('accountCode')}
                      placeholder="e.g. 123, Bank-001"
                    />
                  </FormField>
                )}
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">
                  <TooltipHelper
                    trigger="Opening Balance "
                    content="The initial balance on this account at the start of the tracking period (date). Use negative values for debt or overdraft."
                    triggerWrapperClassName="w-fit flex items-center gap-1"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <FormField
                    label="Amount"
                    error={formErrors.openingBalance?.message}
                    required={!!getValues('openingBalanceDate')}
                  >
                    <Input
                      value={displayValue}
                      onChange={handleAmountChange}
                      placeholder={
                        currencies.find((c) => c.id === getValues('currencyId'))
                          ?.symbol + ' 0.00'
                      }
                      type="text"
                      inputMode="numeric"
                    />
                  </FormField>
                  <FormField
                    label="Date"
                    error={formErrors.openingBalanceDate?.message}
                    errorTooltip={true}
                    errorTooltipStyle="max-w-[10rem] text-center"
                    required={!!getValues('openingBalance')}
                  >
                    <Input
                      {...register('openingBalanceDate')}
                      type="date"
                      placeholder="2025-01-01"
                    />
                  </FormField>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          className={cn(
            'flex gap-2',
            onCancel ? 'justify-between' : 'justify-end',
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
