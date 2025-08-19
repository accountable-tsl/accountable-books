import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { newCompany, type NewCompany, type NewUser } from '../signupTypes';
import { useIndustries } from '@/shared/hooks/useIndustries';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { AutocompleteDropdown } from '@/components/AutocompleteDropdown';
import { useCountries } from '@/shared/hooks/useCountries';
import { useCurrencies } from '@/shared/hooks/useCurrencies';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { FormField } from '@/components/FormField';
import { TOOLTIP } from '../signupConstants';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { TooltipHelper } from '@/components/TooltipHelper';
import DOMPurify from 'dompurify';
import { COMPANY_SIZE, COMPANY_TYPES } from '@/domains/company/constants';
import { useSlugCheck } from '@/domains/firms/hooks';

export interface SignupCompanyInfoHandle {
  validate: () => Promise<boolean>;
}
export const SignupCompanyInfo = forwardRef<
  SignupCompanyInfoHandle,
  {
    companyData: NewCompany;
    userData: NewUser;
    updateCompanyField: (field: keyof NewCompany, value: string) => void;
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
    resolver: zodResolver(newCompany),
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

  const handleChange = (field: keyof NewCompany, value: string | number) => {
    setValue(field, value, {
      shouldValidate: true,
      shouldDirty: true,
    });

    // Force revalidation of both fields any time one changes
    trigger(['yearEndDay', 'yearEndMonth']);

    updateCompanyField(field, value.toString());
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
  }, [companyData.reportingCurrencyId]);

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
  const prevFormDataRef = useRef<Record<string, any>>({});

  useEffect(() => {
    Object.entries(formData).forEach(([key, value]) => {
      // Only update if this specific field actually changed
      if (prevFormDataRef.current[key] !== value && value !== undefined && value !== '') {
        updateCompanyField(key as keyof NewCompany, (value || '').toString());
        prevFormDataRef.current[key] = value;
      }
    });
  }, [formData]);

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
            <div className="text-[0.75rem] text-chart-2 absolute right-3 top-[55%]">
              {COMPANY_TYPES.find((t) => t.key === userType)?.type || ''}
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

        <div className="grid md:grid-cols-2 gap-2 -w-full overflow-hidden">
          {/* Country */}
          <FormField
            id="countryId"
            label="Country"
            required
            helpTooltip={TOOLTIP.country}
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
              aria-describedby={errors.countryId ? 'countryId-error' : undefined}
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
            className="flex flex-col flex-1"
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
              onValueChange={(value) => handleChange('reportingCurrencyId', value)}
              placeholder="Select currency"
              aria-describedby={
                errors.reportingCurrencyId ? 'reportingCurrencyId-error' : undefined
              }
            />
          </FormField>
        </div>

        {!isIndividual && (
          <div className={cn('flex overflow-hidden', isFirm ? 'grid md:grid-cols-2 gap-2' : '')}>
            {isFirm ? (
              <Controller
                name="slug"
                control={control}
                // rules={{ required: "Slug is required" }}
                render={({ field, fieldState }) => {
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
                      required
                      errorTooltip
                      errorTooltipStyle="text-center"
                    >
                      <Input
                        {...field}
                        value={field.value ?? ''}
                        required={companyData.type === 'accounting_firm' ? true : false}
                        onChange={(e) => {
                          field.onChange(e.target.value);
                          handleChange('slug', e.target.value);
                        }}
                        aria-describedby={error ? 'slug-error' : undefined}
                        placeholder="e.g kpmg, abc-and-co"
                      />
                    </FormField>
                  );
                }}
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
                        ? [{ value: 'error', label: 'Error loading industries' }]
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
                  errors.yearEndDay?.message || errors.yearEndMonth?.message || errors.root?.message
                }
                errorTooltip
                errorTooltipStyle="w-full"
              >
                <div className="grid md:grid-cols-2 gap-1">
                  <div className="relative">
                    <Select
                      onValueChange={(value) => handleChange('yearEndDay', value)}
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
                      <span className="text-[0.75rem] text-muted-foreground/50 absolute top-1/4 right-1">
                        Day
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <Select
                      onValueChange={(value) => handleChange('yearEndMonth', value)}
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
                      <span className="text-[0.75rem] text-muted-foreground/50 absolute top-1/4 right-1">
                        Month
                      </span>
                    )}
                  </div>
                </div>
              </FormField>
            )}
          </div>
        )}

        <div className={cn('flex flex-col', !isIndividual ? '-mb-[1.75rem]' : '')}>
          {/* Description */}
          <FormField id="description" label="Description" helpTooltip={TOOLTIP.description}>
            <Textarea
              {...register('description')}
              onChange={(e) => handleChange('description', DOMPurify.sanitize(e.target.value))}
              placeholder={
                isIndividual
                  ? 'Tell us a bit about yourself'
                  : isFirm
                    ? 'Tell us a bit about your practice'
                    : 'Tell us a bit about your company'
              }
              className={cn(
                'resize-none mb-6',
                showOptionalFieldsButton || isIndividual ? 'mb-0' : '',
              )}
              // value={description}
              onFocus={() => setIsDescriptionTouched(true)}
              onBlur={() => {
                setTimeout(() => !viewOptionalFields && setIsDescriptionTouched(false), 2000);
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
                <TooltipHelper
                  contentStyle="w-full"
                  trigger={
                    <Button
                      type="button"
                      variant="link"
                      className={
                        'text-muted-foreground hover:text-foreground p-1 h-6 self-center cursor-pointer'
                      }
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setViewOptionalFields(true);
                      }}
                    >
                      Fill other optional fields
                    </Button>
                  }
                  content="You can always complete these later"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Optional Fields */}
      <div
        className={cn(
          'bg-card z-50 inset-0 w-full py-4 border-[1px] rounded-sm absolute top-[17%] md:top-1/3',
          'transition-all duration-500 ease transform',
          viewOptionalFields && !isIndividual
            ? 'opacity-100 scale-100 pointer-events-auto'
            : 'opacity-0 scale-95 pointer-events-none',
        )}
      >
        <div className="flex flex-col">
          <div className="text-sm px-6 pb-2 flex justify-between">
            <span>Optional Fields</span>
            <span
              className="text-muted-foreground hover:underline cursor-pointer"
              onClick={() => setViewOptionalFields(false)}
            >
              Hide
            </span>
          </div>
          <hr className="py-2" />
          <div className="opacity-75 flex flex-col gap-3 px-6">
            <div className="grid md:grid-cols-2 gap-2">
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
                  onChange={(e) => handleChange('registrationNumber', e.target.value)}
                  aria-describedby={
                    errors.registrationNumber ? 'registrationNumber-error' : undefined
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

            <div className="grid md:grid-cols-2 gap-2">
              {/* Company Size */}
              <FormField id="teamSize" label="Company size" error={errors.teamSize?.message}>
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
                  aria-describedby={errors.website ? 'website-error' : undefined}
                  placeholder="yourcompany.com"
                />
              </FormField>
            </div>

            {/* Address */}
            <FormField id="address" label="Address" error={errors.address?.message}>
              <Input
                id="address"
                {...register('address')}
                onChange={(e) => handleChange('address', e.target.value)}
                placeholder="123 Main Street, New York, NY"
                aria-describedby={errors.address ? 'address-error' : undefined}
              />
            </FormField>

            <Button type="button" variant="outline" onClick={() => setViewOptionalFields(false)}>
              Done
            </Button>
          </div>
        </div>
      </div>
      {/* )} */}
    </div>
  );
});
