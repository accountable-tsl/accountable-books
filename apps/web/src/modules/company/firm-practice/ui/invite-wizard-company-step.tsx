import { useEffect, useMemo, useRef } from 'react';
import { AutocompleteDropdown } from '@/components/AutocompleteDropdown';
import { FormField } from '@/components/FormField';
import { SimpleSelect } from '@/components/SimpleSelect';
import { Input } from '@/components/ui/input';
import { getDefaultCurrencyCodeForCountry } from '@/constants/countryCurrencyMap';
import {
  getCompanyTimezoneOptions,
  normalizeCompanyTimezone,
} from '@/modules/company/companies';
import { useIsMobile } from '@/shared/hooks/use-media-query';
import { useCountries } from '@/shared/hooks/useCountries';
import { useCurrencies } from '@/shared/hooks/useCurrencies';
import { useIndustries } from '@/shared/hooks/useIndustries';
import { Controller, useFormContext, useWatch } from 'react-hook-form';

import type { FirmClientInviteWizardSteps123 } from '../model/types';

const CLIENT_TYPE_OPTIONS = [
  { value: 'business', label: 'Business' },
  { value: 'individual', label: 'Individual' },
] as const;

export function InviteWizardCompanyStep() {
  const isMobile = useIsMobile();
  const {
    register,
    control,
    setValue,
    getValues,
    formState: { errors },
  } = useFormContext<FirmClientInviteWizardSteps123>();

  const companyType = useWatch({ control, name: 'company.type' });
  const countryId = useWatch({ control, name: 'company.countryId' });

  useEffect(() => {
    if (companyType === 'individual') {
      setValue('company.industry', '', { shouldValidate: true });
      setValue('company.registrationNumber', '');
    }
  }, [companyType, setValue]);

  const { data: countriesRes, isLoading: countriesLoading } = useCountries();
  const { data: currenciesRes, isLoading: currenciesLoading } = useCurrencies();
  const {
    data: industries,
    isLoading: industriesLoading,
    isError: industriesError,
  } = useIndustries();

  const countries = countriesRes?.data;
  const currencies = currenciesRes?.data;
  const selectedCountry = useMemo(
    () => countries?.find((country) => country.id === countryId),
    [countries, countryId],
  );
  const timezoneOptions = useMemo(
    () => getCompanyTimezoneOptions(selectedCountry?.code),
    [selectedCountry?.code],
  );

  const lastPrefilledCountryRef = useRef<string | undefined>(undefined);
  const lastCompanyTypeRef = useRef<'business' | 'individual' | undefined>(
    undefined,
  );
  const lastBusinessAccountingBasisRef = useRef<
    'modified_cash_basis' | 'modified_accrual_basis' | undefined
  >(undefined);
  const lastBusinessReportingFrameworkRef = useRef<
    'ifrs' | 'us_gaap' | undefined
  >(undefined);

  useEffect(() => {
    const previousType = lastCompanyTypeRef.current;
    lastCompanyTypeRef.current = companyType;

    if (!companyType || previousType === companyType) return;

    if (previousType === 'business') {
      lastBusinessAccountingBasisRef.current = getValues(
        'company.accountingBasis',
      );
      lastBusinessReportingFrameworkRef.current = getValues(
        'company.reportingFramework',
      );
    }

    if (companyType === 'individual') {
      setValue('company.accountingBasis', 'modified_cash_basis', {
        shouldDirty: true,
      });
      setValue('company.reportingFramework', undefined, {
        shouldDirty: true,
        shouldValidate: true,
      });
      return;
    }

    const nextAccountingBasis =
      lastBusinessAccountingBasisRef.current ?? 'modified_accrual_basis';
    if (getValues('company.accountingBasis') !== nextAccountingBasis) {
      setValue('company.accountingBasis', nextAccountingBasis, {
        shouldDirty: true,
      });
    }

    const nextReportingFramework =
      lastBusinessReportingFrameworkRef.current ?? 'ifrs';
    if (getValues('company.reportingFramework') !== nextReportingFramework) {
      setValue('company.reportingFramework', nextReportingFramework, {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
  }, [companyType, getValues, setValue]);

  useEffect(() => {
    if (!countryId || !countries?.length || !currencies?.length) return;

    const country = countries.find((c) => c.id === countryId);
    if (!country?.code) return;

    const defaultCode = getDefaultCurrencyCodeForCountry(country.code);
    const currency = currencies.find(
      (c) => c.code?.toUpperCase() === defaultCode.toUpperCase(),
    );
    if (!currency?.id) return;

    const countryChanged = lastPrefilledCountryRef.current !== countryId;
    lastPrefilledCountryRef.current = countryId;

    const currentCurrencyId = getValues('company.reportingCurrencyId');
    if (!countryChanged && currentCurrencyId) return;

    setValue('company.reportingCurrencyId', currency.id, {
      shouldValidate: true,
      shouldDirty: countryChanged,
    });
  }, [countryId, countries, currencies, getValues, setValue]);

  useEffect(() => {
    const currentTimezone = normalizeCompanyTimezone(
      getValues('company.defaultTimezone'),
    );

    if (!selectedCountry?.code) {
      if (currentTimezone) {
        setValue('company.defaultTimezone', undefined, {
          shouldValidate: true,
          shouldDirty: true,
        });
      }
      return;
    }

    const isCurrentTimezoneValid = timezoneOptions.some(
      (timezone) => timezone.value === currentTimezone,
    );

    if (isCurrentTimezoneValid) {
      if (currentTimezone !== getValues('company.defaultTimezone')) {
        setValue('company.defaultTimezone', currentTimezone ?? undefined, {
          shouldValidate: true,
        });
      }
      return;
    }

    if (timezoneOptions.length === 1) {
      setValue('company.defaultTimezone', timezoneOptions[0].value, {
        shouldValidate: true,
        shouldDirty: true,
      });
      return;
    }

    setValue('company.defaultTimezone', undefined, {
      shouldValidate: true,
      shouldDirty: Boolean(currentTimezone),
    });
  }, [getValues, selectedCountry?.code, setValue, timezoneOptions]);

  const countryHelp = isMobile
    ? undefined
    : 'Where this client files taxes or operates from.';
  const timezoneHelp = isMobile
    ? undefined
    : 'Used for schedules, deadlines, and date-based bookkeeping activity.';
  const industryHelp = isMobile
    ? undefined
    : 'Required for business clients. Used for templates and reporting.';
  const registrationHelp = isMobile
    ? undefined
    : 'Company Registration Number or Companies House Number - Official company number issued when you registered your business';
  const taxIdHelp = isMobile
    ? undefined
    : 'Your business’s tax identification number, VAT ID or EIN - often used for invoicing and compliance';

  return (
    <div className="text-foreground space-y-4">
      <FormField
        id="company-type"
        label="Client type"
        error={errors.company?.type?.message}
      >
        <Controller
          name="company.type"
          control={control}
          render={({ field }) => (
            <SimpleSelect
              value={field.value}
              onChange={(v) => field.onChange(v as 'business' | 'individual')}
              options={[...CLIENT_TYPE_OPTIONS]}
              className="w-full"
            />
          )}
        />
      </FormField>

      <FormField
        id="company-legal-name"
        label="Legal name"
        required
        error={errors.company?.legalName?.message}
      >
        <Input
          id="company-legal-name"
          autoComplete="organization"
          placeholder={
            companyType === 'individual'
              ? 'e.g. Jane Doe'
              : 'Registered business name'
          }
          aria-invalid={!!errors.company?.legalName}
          {...register('company.legalName')}
        />
      </FormField>

      <div className="grid gap-4 md:grid-cols-2">
        <FormField
          id="company-country"
          label="Country"
          required
          error={errors.company?.countryId?.message}
          helpTooltip={countryHelp}
        >
          <Controller
            name="company.countryId"
            control={control}
            render={({ field }) => (
              <AutocompleteDropdown
                id="company-country"
                items={
                  countriesLoading
                    ? [{ value: '__loading', label: 'Loading…' }]
                    : (countries ?? [])
                }
                mapItem={(item: {
                  id: string;
                  name: string;
                  flag: string;
                }) => ({
                  value: item.id,
                  label: `${item.flag} ${item.name}`,
                })}
                value={field.value ?? ''}
                onValueChange={(v) =>
                  field.onChange(v === '__loading' ? '' : v)
                }
                placeholder="Select country"
                className="w-full"
                aria-invalid={!!errors.company?.countryId}
              />
            )}
          />
        </FormField>

        <FormField
          id="company-timezone"
          label="Timezone"
          required={Boolean(
            selectedCountry?.code && timezoneOptions.length > 1,
          )}
          error={
            selectedCountry?.code
              ? errors.company?.defaultTimezone?.message
              : undefined
          }
          helpTooltip={timezoneHelp}
        >
          <Controller
            name="company.defaultTimezone"
            control={control}
            rules={{
              validate: (value) => {
                if (!selectedCountry?.code) return true;
                if (timezoneOptions.length <= 1) return true;

                const normalizedTimezone = normalizeCompanyTimezone(value);
                if (!normalizedTimezone) return 'Select a timezone';

                return timezoneOptions.some(
                  (timezone) => timezone.value === normalizedTimezone,
                )
                  ? true
                  : 'Select a valid timezone';
              },
            }}
            render={({ field }) => (
              <AutocompleteDropdown
                id="company-timezone"
                items={selectedCountry?.code ? timezoneOptions : []}
                value={field.value ?? ''}
                onValueChange={(value) =>
                  field.onChange(value === '' ? undefined : value)
                }
                placeholder={
                  !selectedCountry?.code
                    ? 'Select country first'
                    : timezoneOptions.length === 1
                      ? 'Automatically selected'
                      : 'Select timezone'
                }
                className="w-full"
                disabled={!selectedCountry?.code || timezoneOptions.length <= 1}
                aria-invalid={
                  !!selectedCountry?.code && !!errors.company?.defaultTimezone
                }
              />
            )}
          />
        </FormField>
      </div>

      <FormField
        id="company-reporting-currency"
        label="Reporting currency"
        required
        error={errors.company?.reportingCurrencyId?.message}
      >
        <Controller
          name="company.reportingCurrencyId"
          control={control}
          render={({ field }) => (
            <AutocompleteDropdown
              id="company-reporting-currency"
              items={
                currenciesLoading
                  ? [{ value: '__loading', label: 'Loading…' }]
                  : (currencies ?? [])
              }
              mapItem={(item: {
                id?: string;
                name?: string;
                symbol?: string;
              }) => ({
                value: item.id ?? '',
                label: `${item.name ?? ''} (${item.symbol ?? ''})`,
              })}
              value={field.value ?? ''}
              onValueChange={(v) => field.onChange(v === '__loading' ? '' : v)}
              placeholder="Select currency"
              className="w-full"
              aria-invalid={!!errors.company?.reportingCurrencyId}
            />
          )}
        />
      </FormField>

      {companyType === 'business' ? (
        <FormField
          id="company-industry"
          label="Industry"
          required
          error={errors.company?.industry?.message}
          helpTooltip={industryHelp}
        >
          <Controller
            name="company.industry"
            control={control}
            render={({ field }) => (
              <AutocompleteDropdown
                id="company-industry"
                items={
                  industriesLoading
                    ? [{ value: '__loading', label: 'Loading…' }]
                    : industriesError
                      ? [
                          {
                            value: '__error',
                            label: 'Could not load industries',
                          },
                        ]
                      : (industries ?? [])
                }
                mapItem={(item: { label: string; shortLabel: string }) => ({
                  value: item.label,
                  label: item.shortLabel,
                })}
                value={field.value ?? ''}
                onValueChange={(v) =>
                  field.onChange(v === '__loading' || v === '__error' ? '' : v)
                }
                placeholder="Select industry"
                className="w-full"
                aria-invalid={!!errors.company?.industry}
              />
            )}
          />
        </FormField>
      ) : null}

      <div
        className={
          companyType === 'business' ? 'grid gap-4 md:grid-cols-2' : 'space-y-4'
        }
      >
        {companyType === 'business' ? (
          <FormField
            id="company-registration"
            label="Company Reg No."
            error={errors.company?.registrationNumber?.message}
            helpTooltip={registrationHelp}
            tooltipStyle="text-center"
          >
            <Input
              id="company-registration"
              placeholder="12345678"
              {...register('company.registrationNumber')}
              aria-invalid={!!errors.company?.registrationNumber}
            />
          </FormField>
        ) : null}
        <FormField
          id="company-tax-id"
          label="Tax ID"
          error={errors.company?.taxId?.message}
          helpTooltip={taxIdHelp}
          tooltipStyle="text-center"
        >
          <Input
            id="company-tax-id"
            placeholder="AB123456C"
            {...register('company.taxId')}
            aria-invalid={!!errors.company?.taxId}
          />
        </FormField>
      </div>
    </div>
  );
}
