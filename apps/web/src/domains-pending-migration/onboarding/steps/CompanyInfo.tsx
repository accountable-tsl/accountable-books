import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useSession } from '@session';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { AutocompleteDropdown } from '@/components/AutocompleteDropdown';
import { CenteredLoader } from '@/components/CenteredLoader';
import ErrorPage from '@/components/ErrorPage';
import { FormField } from '@/components/FormField';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
import { updateCompanyDetails } from '@/domains-pending-migration/company/api';
import {
  ACCOUNTING_BASIS,
  COMPANY_REVENUE_RANGE,
  COMPANY_SIZE,
} from '@/domains-pending-migration/company/constants';
import type {
  CompanyData,
  UpdateCompanyVitalsData,
} from '@/domains-pending-migration/company/types';
import { updateCompanyVitalsSchema } from '@/domains-pending-migration/company/types';
import {
  getCompanyTypeDisplay,
  getDefaultCompanyData,
} from '@/domains-pending-migration/company/utils';
import { useSlugCheck } from '@/domains-pending-migration/firms/hooks';
import {
  deleteObject,
  uploadObject,
} from '@/domains-pending-migration/objects/api';
import { ImageUploader } from '@/domains-pending-migration/objects/ImageUploader';
import { TOOLTIP } from '@/features/auth-signup/model/constants';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/shared/hooks/use-media-query';
import { useCountries } from '@/shared/hooks/useCountries';
import { useCurrencies } from '@/shared/hooks/useCurrencies';
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue';
import { useIndustries } from '@/shared/hooks/useIndustries';
import { routes } from '@/shared/routes/routes';

// Separate component to handle slug field with hooks
function SlugFieldController({
  control,
  currentSlug,
  setError,
  clearErrors,
}: {
  control: any;
  currentSlug: string;
  setError: (name: string, error: { type: string; message: string }) => void;
  clearErrors: (name: string) => void;
}) {
  return (
    <Controller
      name="assignedFirmSlug"
      control={control}
      render={({ field, fieldState }) => (
        <SlugFieldInput
          field={field}
          fieldState={fieldState}
          currentSlug={currentSlug}
          setError={setError}
          clearErrors={clearErrors}
        />
      )}
    />
  );
}

function SlugFieldInput({
  field,
  fieldState,
  currentSlug,
  setError,
  clearErrors,
}: {
  field: { value: string; onChange: (value: string) => void };
  fieldState: { error?: { message?: string } };
  currentSlug: string;
  setError: (name: string, error: { type: string; message: string }) => void;
  clearErrors: (name: string) => void;
}) {
  const { value, onChange } = field;
  const slugCheck = useSlugCheck(value || '', currentSlug);
  const errorMessage = slugCheck.getError();
  const isCurrentSlug = slugCheck?.isSameAsCurrent;

  useEffect(() => {
    if (
      (slugCheck.validation.isValid && slugCheck.isValid) ||
      isCurrentSlug
    ) {
      clearErrors('assignedFirmSlug');
    } else {
      setError('assignedFirmSlug', {
        type: 'manual',
        message: errorMessage ?? 'Invalid slug',
      });
    }
  }, [
    slugCheck.isValid,
    slugCheck.validation.isValid,
    errorMessage,
    isCurrentSlug,
    clearErrors,
    setError,
  ]);

  return (
    <FormField
      label="Slug"
      helpTooltip={TOOLTIP.firmSlug}
      tooltipStyle="text-center"
      required
      error={errorMessage || fieldState.error?.message}
      errorTooltip
      errorTooltipStyle="text-center"
      errorClassName={isCurrentSlug ? 'text-green-500' : ''}
    >
      <Input
        placeholder="e.g. kpmg, afandco"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </FormField>
  );
}

export const CompanyInfo = () => {
  // Refs
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // State
  const [isLoading, setIsLoading] = useState(false);
  const [formInitialized, setFormInitialized] = useState(false);

  const [showQuickSubmit, setShowQuickSubmit] = useState(false);
  const [isManuallyDismissed, setIsManuallyDismissed] = useState(false);
  const [scrollPosition, setScrollPosition] = useState(0);
  const [controlledInputError, setControlledInputError] = useState<Partial<
    Record<keyof CompanyData, string>
  > | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Hooks
  const {
    loading: sessionLoading,
    isLoggedIn,
    companyId,
    company,
    companyType,
    refetchSession,
  } = useSession();

  const {
    data: industries,
    isLoading: isIndustriesLoading,
    isError: isIndustriesError,
  } = useIndustries();

  const { data: countries, isLoading: isCountryLoading } = useCountries();
  const { data: currencies, isLoading: isCurrencyLoading } = useCurrencies();

  const isMobile = useIsMobile();
  const navigate = useNavigate();

  // Derived / Computed Values
  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const isAccountingFirm = companyType === 'accounting_firm';
  const isIndividual = companyType === 'individual';

  // Initialize form
  const {
    control,
    reset,
    watch,
    setValue,
    getValues,
    register,
    setError,
    clearErrors,

    formState: { errors, isSubmitting },
  } = useForm<UpdateCompanyVitalsData>({
    mode: 'onChange',
    resolver: standardSchemaResolver(updateCompanyVitalsSchema),
    defaultValues: getDefaultCompanyData(),
  });

  // FUNCTIONS
  // Logo upload
  const handleUploadImage = async (file: File) => {
    if (!companyId) {
      toast.error('Cannot upload: Company ID is missing');
      return null;
    }

    const params = { file, companyId };
    const response = await uploadObject('logos', params);
    if (response.success && response.data) {
      const { url, key } = response.data;

      setValue('companyLogo', url, { shouldValidate: true });
      setValue('companyLogoKey', key, { shouldValidate: true });

      // Immediately save logo keys to localStorage (don't wait for debounce)
      const draft = JSON.parse(localStorage.getItem(FORM_KEY) || '{}');
      const updatedDraft = {
        ...draft,
        companyLogo: url,
        companyLogoKey: key,
      };
      localStorage.setItem(FORM_KEY, JSON.stringify(updatedDraft));
      toast.success('Logo uploaded successfully');

      return { url, key };
    }

    toast.error(response.message || 'Upload failed');
    return null;
  };

  // Remove logo
  const handleRemove = async (key: string) => {
    const response = await deleteObject('logos', key);
    if (response.success) {
      setValue('companyLogo', null, { shouldValidate: true });
      setValue('companyLogoKey', null, { shouldValidate: true });

      const draft = JSON.parse(localStorage.getItem(FORM_KEY) || '{}');
      const updatedDraft = {
        ...draft,
        companyLogo: null,
        companyLogoKey: null,
      };
      localStorage.setItem(FORM_KEY, JSON.stringify(updatedDraft));
    } else {
      toast.error(response.message || 'Remove failed');
    }
  };

  const handleError = (message: string) => {
    toast.error(message);
  };

  // Essential required fields for quick submit
  const getRequiredFields = (): (keyof UpdateCompanyVitalsData)[] => {
    const baseRequired: (keyof UpdateCompanyVitalsData)[] = [
      'legalName',
      'displayName',
      'companyType',
      'countryId',
      'reportingCurrencyId',
      'yearEndDay',
      'yearEndMonth',
      'industry',
    ];
    const accountingRequired: (keyof UpdateCompanyVitalsData)[] =
      isAccountingFirm ? ['accountingBasis', 'assignedFirmSlug'] : [];
    return [...baseRequired, ...accountingRequired];
  };
  const requiredFields = getRequiredFields();

  // Check if essential fields are filled
  const checkEssentialFieldsComplete = useCallback((): boolean => {
    const fieldValues = watch(requiredFields);
    return requiredFields.every(
      (_, index) =>
        fieldValues[index] && fieldValues[index].toString().trim() !== '',
    );
  }, [watch, requiredFields]);

  const scrollToSubmit = () => {
    const footer = document.querySelector('[data-footer]');
    footer?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  let quickSubmitExitCount = 0;
  const dismissQuickSubmit = () => {
    setIsManuallyDismissed(true);
    quickSubmitExitCount += 1;

    if (quickSubmitExitCount <= 2) {
      const timeout = setTimeout(() => setIsManuallyDismissed(false), 10000);
      return () => clearTimeout(timeout);
    }
  };

  const normalize = useCallback((val: any) => {
    if (val === undefined || val === null || val === '') return null;
    if (typeof val === 'string') {
      const trimmed = val.trim();
      return trimmed === '' ? null : trimmed;
    }
    return val;
  }, []);

  const getDirtyFields = useCallback((): Partial<UpdateCompanyVitalsData> => {
    const formData = getValues();
    const dirty: Partial<UpdateCompanyVitalsData> = {};

    for (const key in formData) {
      const typedKey = key as keyof UpdateCompanyVitalsData;
      const formValue = normalize(formData[typedKey]);
      const dbValue = normalize(company?.[typedKey]);

      if (formValue !== dbValue) {
        dirty[typedKey] = formValue;
      }
    }

    return dirty;
  }, [getValues, company, normalize]);

  const getMissingRequiredFields = (): string[] => {
    const formData = getValues();

    return requiredFields.filter((field) => {
      const formValue = formData?.[field];
      const dbValue = company?.[field];

      return (
        !formValue ||
        (typeof formValue === 'string' && formValue.trim() === '') ||
        (formValue == null && dbValue == null)
      );
    });
  };
  const handleInitialSubmitClick = () => {
    const missingRequired = getMissingRequiredFields();

    if (missingRequired.length > 0) {
      const readableFields = missingRequired
        .map((f) => f.replace(/([A-Z])/g, ' $1').toLowerCase())
        .join(', ');

      toast.error(`Please provide: ${readableFields}`);
      return;
    }

    // All validation passed
    setConfirmOpen(true);
  };

  // Submit form to backend
  const handleSubmit = async () => {
    if (!companyId) {
      toast.error(
        'We were unable to save your company details. Please try again.',
      );
      return;
    }

    try {
      setIsLoading(true);

      const dirty = getDirtyFields();
      if (Object.keys(dirty).length === 0) {
        toast.info('No changes detected. Proceeding to next step...');
      }

      const { success, message } = await updateCompanyDetails(companyId, dirty);
      if (!success) {
        toast.error(message || 'Failed to save company details');
        return;
      }

      await refetchSession();

      localStorage.removeItem(FORM_KEY);
      navigate(routes.onboarding.index.staticPath);
    } catch (error: unknown) {
      toast.error((error as Error).message || 'Failed to save company details');
      // Don't clear localStorage on error - preserve user's work
    } finally {
      setIsLoading(false);
    }
  };

  const hasUnsavedChanges = useCallback((): boolean => {
    return Object.keys(getDirtyFields()).length > 0;
  }, [getDirtyFields]);

  const FORM_KEY = `onb_company_form_${companyId}`;

  // INITIALIZATION - Load form data and localStorage backup
  useEffect(() => {
    if (!companyId || !company || formInitialized) return;

    // Parse and validate company data, trim to only those that needs to be saved/displayed
    const companyDataTrimmed = updateCompanyVitalsSchema.safeParse(company);
    if (!companyDataTrimmed.success) {
      reset(company);
      return;
    }

    // Check for localStorage backup
    const draft = localStorage.getItem(FORM_KEY);

    if (draft && !formInitialized) {
      try {
        const parsed = JSON.parse(draft) as Partial<UpdateCompanyVitalsData>;

        // Merge database data with localStorage backup
        const mergedData = { ...companyDataTrimmed.data, ...parsed };
        reset(mergedData);

        toast.info('Restored unsaved changes from your previous session', {
          duration: 1000,
        });
      } catch (error) {
        // If parsing fails, use clean database data
        reset(companyDataTrimmed.data);
      }
    } else {
      reset(companyDataTrimmed.data);
    }

    setFormInitialized(true);
  }, [companyId, company, reset, formInitialized, FORM_KEY]);

  // Watch all form values for auto-save
  const watchedValues = watch();
  const debouncedFormValues = useDebouncedValue(watchedValues, 500);

  // AUTO-SAVE TO LOCALSTORAGE - Save changes as user types
  useEffect(() => {
    if (!formInitialized) return;

    const dirty = getDirtyFields();

    if (Object.keys(dirty).length > 0) {
      localStorage.setItem(FORM_KEY, JSON.stringify(dirty));
    }
  }, [debouncedFormValues, formInitialized, FORM_KEY, getDirtyFields]);

  // BROWSER WARNING - Prevent accidental navigation with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges()) {
        e.preventDefault();
        return 'You have unsaved changes. Are you sure you want to leave?';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (controlledInputError) {
      const timeout = setTimeout(() => {
        setControlledInputError(null);
      }, 5000);

      return () => clearTimeout(timeout);
    }
  }, [controlledInputError]);

  // Handle scroll to track position
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    const handleScroll = () => {
      const scrollTop = scrollContainer.scrollTop;
      const scrollHeight = scrollContainer.scrollHeight;
      const clientHeight = scrollContainer.clientHeight;
      const maxScroll = scrollHeight - clientHeight;
      const scrollPercentage =
        maxScroll > 0 ? (scrollTop / maxScroll) * 100 : 0;

      setScrollPosition(scrollPercentage);
    };

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, []);

  // Update showQuickSubmit based on form completion and scroll position
  useEffect(() => {
    const isComplete = checkEssentialFieldsComplete();
    const isInUpperPortion = scrollPosition < 65;
    const shouldShow = isComplete && isInUpperPortion && !isManuallyDismissed;

    setShowQuickSubmit(shouldShow);
  }, [scrollPosition, isManuallyDismissed, checkEssentialFieldsComplete]);

  if (!isLoggedIn) {
    return <ErrorPage type="403" />;
  }

  if (isLoading || sessionLoading) {
    return <CenteredLoader fullscreen />;
  }

  if (!company || !companyId) {
    return (
      <ErrorPage type="default" showHeader={false} className="h-full min-h-0" />
    );
  }

  return (
    <div
      className="scrollbar-thin-2px relative flex-1 overflow-y-auto p-4 md:p-6"
      ref={scrollContainerRef}
    >
      <form className="space-y-8">
        <ImageUploader
          label="Company logo / icon"
          labelPosition="bottom"
          initialImage={watch('companyLogo')}
          onUpload={handleUploadImage}
          onRemove={watch('companyLogo') ? handleRemove : undefined}
          onError={handleError}
          metadata={{ companyId }}
          accept="image/png,image/jpeg,image/jpg"
          className="p-0"
        />
        {/* Basic Company Information */}
        <div className="space-y-4">
          <h3 className="text-muted-foreground border-b text-lg font-medium">
            Company Information
          </h3>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <FormField
              label="Legal Name"
              required
              error={
                controlledInputError?.legalName ||
                errors.legalName?.message ||
                ''
              }
              onClick={() => {
                setControlledInputError((prev) => ({
                  ...prev,
                  legalName: 'Contact support to change legal name',
                }));
              }}
            >
              <Input
                {...register('legalName', { required: true })}
                disabled
                readOnly
              />
            </FormField>
            <FormField
              label="Display Name"
              helpTooltip="Name displayed in app"
              tooltipStyle="w-full"
              required
            >
              <Input {...register('displayName', { required: true })} />
            </FormField>
            <FormField
              label="Company Type"
              required
              error={
                controlledInputError?.companyType ||
                errors.companyType?.message ||
                ''
              }
              onClick={() => {
                setControlledInputError((prev) => ({
                  ...prev,
                  companyType: 'Company type cannot be changed',
                }));
              }}
            >
              <Controller
                name="companyType"
                control={control}
                render={({ field }) => (
                  <Input
                    value={getCompanyTypeDisplay(field.value)} // Transform for display
                    readOnly
                    disabled
                  />
                )}
              />
            </FormField>
            <Controller
              name="industry"
              control={control}
              render={({ field, fieldState }) => (
                <FormField
                  id="industry"
                  label="Industry"
                  error={fieldState.error?.message}
                  helpTooltip={TOOLTIP.industry || ''}
                  className="w-full"
                  required
                >
                  <AutocompleteDropdown
                    id="industry"
                    value={field.value || ''}
                    onValueChange={field.onChange}
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
                      value: item.code,
                      label: item.shortLabel,
                    })}
                    placeholder="Select industry"
                  />
                </FormField>
              )}
            />
          </div>
        </div>

        {/* Registration & Legal Details */}
        <div className="space-y-4">
          <h3 className="text-muted-foreground border-b text-lg font-medium">
            Registration & Legal
          </h3>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <FormField label="Company Registration Number">
              <Input
                {...register('companyRegistrationNumber')}
                placeholder="Not Incorporated"
              />
            </FormField>
            <FormField label="Tax Identification Number">
              <Input {...register('companyTaxId')} placeholder="X1101234567" />
            </FormField>
          </div>
        </div>
        {/* Location & Currency */}
        <div className="space-y-4">
          <h3 className="text-muted-foreground border-b text-lg font-medium">
            Location & Currency
          </h3>
          <FormField label="Address">
            <Input {...register('address')} placeholder="123 Main Street" />
          </FormField>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Controller
              name="countryId"
              control={control}
              render={({ field, fieldState }) => (
                <FormField
                  id="countryId"
                  label="Country"
                  required
                  error={
                    controlledInputError?.countryId ||
                    fieldState.error?.message ||
                    ''
                  }
                  onClick={() =>
                    setControlledInputError((prev) => ({
                      ...prev,
                      countryId: 'Contact support to change country',
                    }))
                  }
                  errorTooltip
                  errorTooltipStyle="w-full"
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
                    placeholder="Select country"
                    aria-describedby={
                      errors.countryId ? 'countryId-error' : undefined
                    }
                    onValueChange={field.onChange}
                    value={field.value || ''}
                    disabled
                  />
                </FormField>
              )}
            />
            <Controller
              name="reportingCurrencyId"
              control={control}
              render={({ field, fieldState }) => (
                <FormField
                  id="reportingCurrencyId"
                  label="Reporting Currency"
                  required
                  error={
                    controlledInputError?.reportingCurrencyId ||
                    fieldState.error?.message ||
                    ''
                  }
                  errorTooltip
                  errorTooltipStyle="w-full"
                  className="flex flex-1 flex-col"
                  onClick={() =>
                    setControlledInputError((prev) => ({
                      ...prev,
                      reportingCurrencyId:
                        'Reporting currency cannot be changed',
                    }))
                  }
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
                    value={field.value || ''}
                    onValueChange={field.onChange}
                    placeholder="Select currency"
                    aria-describedby={
                      errors.reportingCurrencyId
                        ? 'reportingCurrencyId-error'
                        : undefined
                    }
                    disabled
                  />
                </FormField>
              )}
            />
          </div>
        </div>
        {/* Business Details */}
        {!isIndividual && (
          <div className="space-y-4">
            <h3 className="text-muted-foreground border-b text-lg font-medium">
              Business & Accounting
            </h3>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <Controller
                name="revenue"
                control={control}
                render={({ field, fieldState }) => (
                  <FormField
                    id="revenue"
                    label="Annual Revenue"
                    error={fieldState.error?.message || ''}
                  >
                    <Select
                      onValueChange={field.onChange}
                      value={field.value || ''}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Choose revenue range" />
                      </SelectTrigger>
                      <SelectContent>
                        {COMPANY_REVENUE_RANGE.map((r) => (
                          <SelectItem key={r.value} value={r.value}>
                            {r.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>{' '}
                  </FormField>
                )}
              />
              <Controller
                name="companySize"
                control={control}
                render={({ field, fieldState }) => (
                  <FormField
                    id="companySize"
                    label="Company size"
                    error={fieldState.error?.message || ''}
                  >
                    <Select
                      onValueChange={field.onChange}
                      value={field.value || ''}
                    >
                      <SelectTrigger className="w-full">
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
                )}
              />
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
                  aria-describedby={
                    errors.website ? 'website-error' : undefined
                  }
                  placeholder="yourcompany.com"
                />
              </FormField>

              <FormField
                id="fiscalPeriod"
                label="Financial Year End"
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
                  <Controller
                    name="yearEndDay"
                    control={control}
                    render={({ field }) => (
                      <div className="relative">
                        <Select
                          value={field.value?.toString() || '31'}
                          onValueChange={(val) => field.onChange(Number(val))}
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
                        {field.value && (
                          <span className="text-muted-foreground/50 absolute top-1/4 right-1 text-[0.75rem]">
                            Day
                          </span>
                        )}
                      </div>
                    )}
                  />
                  <Controller
                    name="yearEndMonth"
                    control={control}
                    render={({ field }) => (
                      <div className="relative">
                        <Select
                          value={field.value?.toString() || '12'}
                          onValueChange={(val) => field.onChange(Number(val))}
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
                        {field.value && (
                          <span className="text-muted-foreground/50 absolute top-1/4 right-1 text-[0.75rem]">
                            Month
                          </span>
                        )}
                      </div>
                    )}
                  />
                </div>
              </FormField>
              {isAccountingFirm && (
                <>
                  <SlugFieldController
                    control={control}
                    currentSlug={company?.assignedFirmSlug || ''}
                    setError={setError}
                    clearErrors={clearErrors}
                  />
                  <Controller
                    name="accountingBasis"
                    control={control}
                    render={({ field, fieldState }) => (
                      <FormField
                        id="accountingBasis"
                        label="Accounting Basis"
                        error={fieldState.error?.message || ''}
                      >
                        <Select
                          onValueChange={field.onChange}
                          value={field.value || ''}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select accounting basis" />
                          </SelectTrigger>
                          <SelectContent>
                            {ACCOUNTING_BASIS.map((a) => (
                              <SelectItem key={a.value} value={a.value}>
                                {a.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormField>
                    )}
                  />
                </>
              )}
            </div>
          </div>
        )}
        <div className="space-y-4">
          <h3 className="text-muted-foreground border-b text-lg font-medium">
            Other
          </h3>
          <FormField id="description" label="Description">
            <Textarea
              {...register('description')}
              className={cn('mb-6 resize-none')}
              placeholder="Tell us a bit about your company"
            />
          </FormField>
        </div>
        {/* Form navigation */}
        <div
          className="flex justify-center pb-4 md:justify-between"
          data-footer
        >
          {!isMobile && (
            <Button type="button" variant="outline" disabled>
              Previous
            </Button>
          )}
          <Button type="button" onClick={handleInitialSubmitClick}>
            Submit and Continue
          </Button>
        </div>
      </form>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="sm:max-w-[425px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-center">
              Confirm Company Details
            </AlertDialogTitle>
            <AlertDialogDescription className="text-destructive sr-only">
              Critical: Most company details cannot be changed once saved.
              Please review everything carefully.
            </AlertDialogDescription>
            <hr />
          </AlertDialogHeader>
          <div className="flex flex-col items-center justify-center gap-4">
            <p className="text-center">
              <span className="text-destructive font-semibold">
                Are you sure all details are correct?
              </span>{' '}
              <br />
              <span className="text-muted-foreground text-sm">
                Most company settings become permanent once saved and cannot be
                modified.
              </span>
            </p>
            {/* Summarize other fields */}
            <div className="-mb-2">
              <div className="flex items-center justify-center gap-2">
                <Button
                  disabled={isLoading || isSubmitting}
                  onClick={handleSubmit}
                >
                  Yes, Submit
                </Button>
                <Button onClick={() => setConfirmOpen(false)} variant="outline">
                  Not sure
                </Button>
              </div>
              <span className="text-muted-foreground/70 text-xs italic">
                Request a callback if you need some help
              </span>
            </div>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {showQuickSubmit && (
        <div className="md:translate-x-00 sticky bottom-0 left-1/2 z-50 w-xs -translate-x-1/2 transform overflow-hidden rounded-md md:max-w-xs">
          <div className="animate-in slide-in-from-bottom-8 fade-in-0 duration-500 ease-out">
            <div className="relative z-50 bg-linear-to-r from-cyan-700 via-blue-500 to-indigo-600">
              {/* Animated background sparkles #00d3f2, #2b7fff #4f39f6*/}
              <div className="absolute inset-0 overflow-hidden rounded-2xl">
                <div className="absolute -top-1 -left-1 h-3 w-3 animate-pulse rounded-full bg-white/30"></div>
                <div className="absolute top-3 right-4 h-2 w-2 animate-pulse rounded-full bg-white/40 delay-300"></div>
                <div className="absolute bottom-4 left-6 h-1.5 w-1.5 animate-pulse rounded-full bg-white/50 delay-700"></div>
              </div>

              {/* Content */}
              <div className="relative z-50 flex flex-col gap-2 bg-black/10 px-4 py-3 text-white">
                <p className="text-center text-white/80">
                  You've completed the essential fields. Continue or scroll to
                  submit
                </p>
                <div className="flex justify-center gap-2">
                  <Button
                    size="sm"
                    variant="link"
                    className="cursor-pointer bg-transparent text-white"
                    onClick={scrollToSubmit}
                  >
                    Scroll to Submit
                  </Button>
                  <Button size="sm" onClick={dismissQuickSubmit}>
                    Continue Form
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

CompanyInfo.displayName = 'CompanyInfo';
