import type { NewCompany, NewUser } from '@/modules/auth';
import type {
  ControllerFieldState,
  ControllerRenderProps,
} from 'react-hook-form';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AutocompleteDropdown } from '@/components/AutocompleteDropdown';
import { FormField } from '@/components/FormField';
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
import { Textarea } from '@/components/ui/textarea';
import { useSlugCheck } from '@/domains-pending-migration/firms/hooks';
import { cn } from '@/lib/utils';
import { newCompany } from '@/modules/auth';
import { COMPANY_SIZE, COMPANY_TYPES } from '@/modules/company/companies';
import { useCountries } from '@/shared/hooks/useCountries';
import { useCurrencies } from '@/shared/hooks/useCurrencies';
import { useIndustries } from '@/shared/hooks/useIndustries';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import DOMPurify from 'dompurify';
import { Controller, useForm } from 'react-hook-form';

import { TOOLTIP } from '../../model/constants';

// Separate component to handle slug field with hooks
function SlugField({
  field,
  fieldState,
  required = false,
}: {
  field: ControllerRenderProps<NewCompany, 'slug'>;
  fieldState: ControllerFieldState;
  required?: boolean;
}) {
  const slugCheck = useSlugCheck(field?.value || '');

  // Combine RHF errors with slug validation errors
  const error = slugCheck.isChecking
    ? 'Checking availability...'
    : fieldState.error?.message || slugCheck.getError();

  return (
    <FormField
      id="slug"
      label="Firm slug"
      error={error || ''}
      helpTooltip={TOOLTIP.firmSlug}
      tooltipStyle="text-center"
      required={required}
      errorTooltip
      errorTooltipStyle="text-center"
    >
      <Input
        {...field}
        value={field.value ?? ''}
        required={required}
        aria-describedby={error ? 'slug-error' : undefined}
        placeholder="e.g kpmg, abc-and-co"
      />
    </FormField>
  );
}

export interface SignupCompanyInfoHandle {
  validate: () => Promise<boolean>;
}
export const SignupCompanyInfo = forwardRef<
  SignupCompanyInfoHandle,
  {
    companyData: NewCompany;
    userData: NewUser;
    updateCompanyField: <K extends keyof NewCompany>(
      field: K,
      value: NewCompany[K],
    ) => void;
  }
>(({ companyData, userData, updateCompanyField }, ref) => {
  const userType = companyData.type;
  const isFirm = userType === 'accounting_firm';
  const isIndividual = userType === 'individual';
  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  const [isDescriptonTouched, setIsDescriptionTouched] = useState(false);
  const [viewOptionalFields, setViewOptionalFields] = useState(false);
  const {
    data: industries,
    isLoading: isIndustriesLoading,
    isError: isIndustriesError,
  } = useIndustries();

  const { data: currencies, isLoading: isCurrencyLoading } = useCurrencies();
  const { data: countries, isLoading: isCountryLoading } = useCountries();

  const defaultValues = useMemo(
    () => ({
      ...companyData,
      legalName:
        isIndividual && userData?.firstname
          ? `${userData.firstname}'s Finances`.trim()
          : companyData.legalName || '',
      yearEndDay: companyData.yearEndDay || 31,
      yearEndMonth: companyData.yearEndMonth || 12,
    }),
    [userData?.firstname, isIndividual, companyData],
  );

  const {
    register,
    watch,
    formState: { errors },
    setValue,
    trigger,
    control,
  } = useForm<NewCompany>({
    resolver: standardSchemaResolver(newCompany),
    mode: 'onChange',
    defaultValues,
  });

  const description = watch('description') || '';
  const showOptionalFieldsButton =
    viewOptionalFields || isDescriptonTouched || description.length > 0;

  // const slug = watch("slug");
  // const { data: slugCheckData, isFetching } = useSlugCheck(slug || "");

  // const debouncedSlug = useDebouncedValue(rawSlug?.trim().toLowerCase(), 300);
  // const { data: firmSlugData, isLoading: isFirmSlugsLoading } = useFirmSlugs();
  // const allFirmSlugs = firmSlugData?.data;

  useImperativeHandle(ref, () => ({
    validate: async () => await trigger(),
    getData: () => watch(),
    getFieldValue: (field: keyof NewCompany) => watch(field),
  }));

  const handleChange = <K extends keyof NewCompany>(
    field: K,
    value: NewCompany[K],
  ) => {
    setValue(field, value as never, {
      shouldValidate: true,
      shouldDirty: true,
    });

    // Force revalidation of both fields any time one changes
    trigger(['yearEndDay', 'yearEndMonth']);

    updateCompanyField(field, value);
  };

  useEffect(() => {
    if (
      companyData.reportingCurrencyId &&
      watch('reportingCurrencyId') !== companyData.reportingCurrencyId
    ) {
      setValue('reportingCurrencyId', companyData.reportingCurrencyId, {
        shouldValidate: true,
        shouldDirty: false,
      });
    }
  }, [companyData.reportingCurrencyId, setValue, watch]);

  // useEffect(() => {
  //   const timeoutId = setTimeout(() => {
  //     Object.entries(formData).forEach(([key, value]) => {
  //       if (value !== undefined && value !== "") {
  //         updateCompanyField(key as keyof NewCompany, (value || "").toString());
  //       }
  //     });
  //   }, 2000); // Small delay to batch updates

  //   return () => clearTimeout(timeoutId);
  // }, [formData]);

  const formData = watch();
  const prevFormDataRef = useRef<
    Partial<Record<keyof NewCompany, NewCompany[keyof NewCompany]>>
  >({});

  useEffect(() => {
    Object.entries(formData).forEach(([key, value]) => {
      const typedKey = key as keyof NewCompany;

      // Only update if this specific field actually changed
      if (
        prevFormDataRef.current[typedKey] !== value &&
        value !== undefined &&
        value !== ''
      ) {
        updateCompanyField(typedKey, value as NewCompany[keyof NewCompany]);
        prevFormDataRef.current[typedKey] =
          value as NewCompany[keyof NewCompany];
      }
    });
  }, [formData, updateCompanyField]);

  // useEffect(() => {
  //   if (!slug || slug.trim().length < 3) return;

  //   const result = validateSlug(slug);
  //   console.log(result);

  //   if (!result.isValid && result.error) {
  //     setError("slug", { type: "manual", message: result.error });
  //   } else {
  //     clearErrors("slug");
  //   }

  //   console.log("slugcheck@companyinfo", slugCheckData);
  //   if (isFetching || !slugCheckData) return;
  //   const { success, message, data } = slugCheckData;
  //   if (!success || !data?.isAvailable) {
  //     if (!data?.isAvailable) {
  //       setError("slug", { type: "manual", message: message || "Slug taken" });
  //       return;
  //     }

  //     setError("slug", {
  //       type: "manual",
  //       message: message || "This slug is not available",
  //     });
  //     return;
  //   }
  //   clearErrors("slug");
  // }, [setError, clearErrors]);

  const chosenCompanyType =
    COMPANY_TYPES.find((t) => t.key === userType)?.type || '';

  return (
    <div>
      <div className="flex flex-col gap-4">
        {/* Legal Name */}
        <FormField
          id="legalName"
          label={isFirm ? 'Practice Name' : 'Company Name'}
          error={errors.legalName?.message}
          required
        >
          {userType && (
            <div className="text-chart-2 absolute top-[55%] right-3 text-[0.75rem]">
              {chosenCompanyType}
            </div>
          )}
          <Input
            id="legalName"
            {...register('legalName')}
            onChange={(e) => handleChange('legalName', e.target.value)}
            required
            aria-describedby={errors.legalName ? 'legalName-error' : undefined}
            placeholder={
              isIndividual
                ? `${userData?.firstname}'s Finances`
                : isFirm
                  ? 'Jerome and Associates'
                  : 'Acme Ltd'
            }
          />
        </FormField>

        <div className="-w-full grid gap-2 overflow-hidden md:grid-cols-2">
          {/* Country */}
          <FormField
            id="countryId"
            label="Country"
            required
            helpTooltip={
              chosenCompanyType.toLowerCase() === 'individual'
                ? 'This is the primary country you file your taxes in'
                : TOOLTIP.country
            }
            tooltipStyle="w-full"
            error={errors.countryId?.message}
            errorTooltip
          >
            <AutocompleteDropdown
              id="countryId"
              items={
                isCountryLoading
                  ? [{ value: 'loading', label: 'Loading...' }]
                  : countries?.data || []
              }
              mapItem={(item) => ({
                value: item.id,
                label: `${item.flag} ${item.name}`,
              })}
              value={watch('countryId') || ''}
              onValueChange={(value) => handleChange('countryId', value)}
              placeholder="Select country"
              aria-describedby={
                errors.countryId ? 'countryId-error' : undefined
              }
            />
          </FormField>

          {/* Reporting Currency */}
          <FormField
            id="reportingCurrencyId"
            label="Reporting Currency"
            required
            helpTooltip={TOOLTIP.reportingCurrency}
            error={errors.reportingCurrencyId?.message}
            errorTooltip
            className="flex flex-1 flex-col"
          >
            <AutocompleteDropdown
              id="reportingCurrencyId"
              items={
                isCurrencyLoading
                  ? [{ value: 'loading', label: 'Loading...' }]
                  : currencies?.data || []
              }
              mapItem={(item) => ({
                value: item.id,
                label: `${item.name} (${item.symbol})`,
              })}
              value={watch('reportingCurrencyId')}
              onValueChange={(value) =>
                handleChange('reportingCurrencyId', value)
              }
              placeholder="Select currency"
              aria-describedby={
                errors.reportingCurrencyId
                  ? 'reportingCurrencyId-error'
                  : undefined
              }
            />
          </FormField>
        </div>

        {!isIndividual && (
          <div
            className={cn(
              'flex overflow-hidden',
              isFirm ? 'grid gap-2 md:grid-cols-2' : '',
            )}
          >
            {isFirm ? (
              <Controller
                name="slug"
                control={control}
                // rules={{ required: "Slug is required" }}
                render={({ field, fieldState }) => (
                  <SlugField
                    field={{
                      ...field,
                      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                        field.onChange(e.target.value);
                        handleChange('slug', e.target.value);
                      },
                    }}
                    fieldState={fieldState}
                    required={companyData.type === 'accounting_firm'}
                  />
                )}
              />
            ) : (
              /* Industry */
              <FormField
                id="industry"
                label="Industry"
                error={errors.industry?.message}
                helpTooltip={TOOLTIP.industry || ''}
                className="w-full"
              >
                <AutocompleteDropdown
                  id="industry"
                  items={
                    isIndustriesLoading
                      ? [{ value: 'loading', label: 'Loading...' }]
                      : isIndustriesError
                        ? [
                            {
                              value: 'error',
                              label: 'Error loading industries',
                            },
                          ]
                        : industries || []
                  }
                  mapItem={(item) => ({
                    value: item.label,
                    label: item.shortLabel,
                  })}
                  value={watch('industry') || ''}
                  onValueChange={(value) => handleChange('industry', value)}
                />
              </FormField>
            )}

            {/* Fiscal Period */}
            {isFirm && (
              <FormField
                id="fiscalPeriod"
                label="Year End"
                helpTooltip={TOOLTIP.yearEnd}
                required
                error={
                  errors.yearEndDay?.message ||
                  errors.yearEndMonth?.message ||
                  errors.root?.message
                }
                errorTooltip
                errorTooltipStyle="w-full"
              >
                <div className="grid gap-1 md:grid-cols-2">
                  <div className="relative">
                    <Select
                      onValueChange={(value) =>
                        handleChange('yearEndDay', Number(value))
                      }
                      value={watch('yearEndDay')?.toString() || '31'}
                    >
                      <SelectTrigger className="w-full [&_svg]:hidden">
                        <SelectValue placeholder="Select day" />
                      </SelectTrigger>
                      <SelectContent>
                        {days.map((day) => (
                          <SelectItem key={day} value={day.toString()}>
                            {day}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {watch('yearEndDay') && (
                      <span className="text-muted-foreground/50 absolute top-1/4 right-1 text-[0.75rem]">
                        Day
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <Select
                      onValueChange={(value) =>
                        handleChange('yearEndMonth', Number(value))
                      }
                      value={watch('yearEndMonth')?.toString() || '12'}
                    >
                      <SelectTrigger className="w-full [&_svg]:hidden">
                        <SelectValue placeholder="Month" />
                      </SelectTrigger>
                      <SelectContent>
                        {months.map((month) => (
                          <SelectItem key={month} value={month.toString()}>
                            {month}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {watch('yearEndMonth') && (
                      <span className="text-muted-foreground/50 absolute top-1/4 right-1 text-[0.75rem]">
                        Month
                      </span>
                    )}
                  </div>
                </div>
              </FormField>
            )}
          </div>
        )}

        <div
          className={cn('flex flex-col', !isIndividual ? '-mb-[1.75rem]' : '')}
        >
          {/* Description */}
          <FormField
            id="description"
            label="Description"
            helpTooltip={TOOLTIP.description}
          >
            <Textarea
              {...register('description')}
              onChange={(e) =>
                handleChange('description', DOMPurify.sanitize(e.target.value))
              }
              placeholder={
                isIndividual
                  ? 'Tell us a bit about yourself'
                  : isFirm
                    ? 'Tell us a bit about your practice'
                    : 'Tell us a bit about your company'
              }
              className={cn(
                'mb-6 resize-none',
                showOptionalFieldsButton || isIndividual ? 'mb-0' : '',
              )}
              // value={description}
              onFocus={() => setIsDescriptionTouched(true)}
              onBlur={() => {
                setTimeout(
                  () => !viewOptionalFields && setIsDescriptionTouched(false),
                  2000,
                );
              }}
            />
          </FormField>

          {!isIndividual && showOptionalFieldsButton && (
            <div>
              <div
                className={cn(
                  'flex items-center justify-center',
                  !isIndividual && showOptionalFieldsButton
                    ? 'pointer-events-auto opacity-100'
                    : 'pointer-events-none opacity-0',
                )}
              >
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="link"
                    className="text-muted-foreground hover:text-foreground h-6 cursor-pointer self-center p-1"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setViewOptionalFields(true);
                    }}
                  >
                    Fill other optional fields
                  </Button>
                  <TooltipHelper content="You can always complete these later" />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Optional Fields */}
      <div
        className={cn(
          'bg-card absolute inset-0 top-[17%] z-50 w-full rounded-sm border-[1px] py-4 md:top-1/3',
          'ease transform transition-all duration-500',
          viewOptionalFields && !isIndividual
            ? 'pointer-events-auto scale-100 opacity-100'
            : 'pointer-events-none scale-95 opacity-0',
        )}
      >
        <div className="flex flex-col">
          <div className="flex justify-between px-6 pb-2 text-sm">
            <span>Optional Fields</span>
            <span
              className="text-muted-foreground cursor-pointer hover:underline"
              onClick={() => setViewOptionalFields(false)}
            >
              Hide
            </span>
          </div>
          <hr className="py-2" />
          <div className="flex flex-col gap-3 px-6 opacity-75">
            <div className="grid gap-2 md:grid-cols-2">
              {/* Company Registration Number */}
              <FormField
                id="registrationNumber"
                label="Company Reg No."
                error={errors.registrationNumber?.message}
                helpTooltip={TOOLTIP.registrationNumber}
                tooltipStyle="text-center"
              >
                <Input
                  id="registrationNumber"
                  {...register('registrationNumber')}
                  onChange={(e) =>
                    handleChange('registrationNumber', e.target.value)
                  }
                  aria-describedby={
                    errors.registrationNumber
                      ? 'registrationNumber-error'
                      : undefined
                  }
                  placeholder="12345678"
                />
              </FormField>
              <FormField
                id="taxId"
                label="Tax ID"
                error={errors.taxId?.message}
                helpTooltip={TOOLTIP.taxId}
                tooltipStyle="text-center"
              >
                <Input
                  id="taxId"
                  {...register('taxId')}
                  onChange={(e) => handleChange('taxId', e.target.value)}
                  aria-describedby={errors.taxId ? 'taxId-error' : undefined}
                  placeholder="AB123456C"
                />
              </FormField>
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              {/* Company Size */}
              <FormField
                id="teamSize"
                label="Company size"
                error={errors.teamSize?.message}
              >
                <Select
                  onValueChange={(value) => handleChange('teamSize', value)}
                  value={watch('teamSize') || ''}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select company size" />
                  </SelectTrigger>
                  <SelectContent>
                    {COMPANY_SIZE.map((size) => (
                      <SelectItem key={size.value} value={size.value}>
                        {size.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>

              {/* Website */}
              <FormField
                id="website"
                label="Website"
                error={errors.website?.message}
                helpTooltip={TOOLTIP.website}
                tooltipStyle="w-full"
              >
                <Input
                  id="website"
                  {...register('website')}
                  onChange={(e) => handleChange('website', e.target.value)}
                  aria-describedby={
                    errors.website ? 'website-error' : undefined
                  }
                  placeholder="yourcompany.com"
                />
              </FormField>
            </div>

            {/* Address */}
            <FormField
              id="address"
              label="Address"
              error={errors.address?.message}
            >
              <Input
                id="address"
                {...register('address')}
                onChange={(e) => handleChange('address', e.target.value)}
                placeholder="123 Main Street, New York, NY"
                aria-describedby={errors.address ? 'address-error' : undefined}
              />
            </FormField>

            <Button
              type="button"
              variant="outline"
              onClick={() => setViewOptionalFields(false)}
            >
              Done
            </Button>
          </div>
        </div>
      </div>
      {/* )} */}
    </div>
  );
});
