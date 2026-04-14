import type {
  CompanyData,
  UpdateCompanyVitalsData,
  UpdateCompanyVitalsFormValues,
} from '@/modules/company/companies';
import type { ChangeEvent, ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AutocompleteDropdown } from '@/components/AutocompleteDropdown';
import { FormField } from '@/components/FormField';
import { TooltipHelper } from '@/components/TooltipHelper';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  COMPANY_REVENUE_RANGE,
  COMPANY_SIZE,
  getAccountingBasisLabel,
  getCompanyTimezoneOptions,
  getCompanyTimezoneValidationMessage,
  getCompanyTypeLabel,
  getReportingFrameworkLabel,
  getSettingsCompanyProfileVisibilityRules,
  normalizeCompanyTimezone,
  updateCompanyVitalsSchema,
  useUpdateCompanyDetails,
} from '@/modules/company/companies';
import { useDeleteCompanyLogo, useUploadCompanyLogo } from '@/modules/objects';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useSession } from '@session';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, Lock, Trash2 } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import {
  canEditWorkspaceCompanySettings,
  getWorkspaceCompanySettingsEditDeniedReason,
} from '../lib/company-settings-permissions';

type SettingsCompanyFormValues = Pick<
  UpdateCompanyVitalsFormValues,
  | 'displayName'
  | 'legalName'
  | 'companyRegistrationNumber'
  | 'companyTaxId'
  | 'address'
  | 'description'
  | 'website'
  | 'industry'
  | 'companySize'
  | 'revenue'
  | 'defaultTimezone'
>;

type SettingsCompanyData = Pick<
  UpdateCompanyVitalsData,
  | 'displayName'
  | 'legalName'
  | 'companyRegistrationNumber'
  | 'companyTaxId'
  | 'address'
  | 'description'
  | 'website'
  | 'industry'
  | 'companySize'
  | 'revenue'
  | 'defaultTimezone'
>;

type SettingsCompanyPayload = Partial<SettingsCompanyData>;

const OPTIONAL_SELECT_NONE = '__none__';

const settingsCompanyFormSchema = updateCompanyVitalsSchema.pick({
  displayName: true,
  legalName: true,
  companyRegistrationNumber: true,
  companyTaxId: true,
  address: true,
  description: true,
  website: true,
  industry: true,
  companySize: true,
  revenue: true,
  defaultTimezone: true,
});

function displayValue(value: string | null | undefined) {
  if (value == null) return 'Not set';
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : 'Not set';
}

function normalizeOptionalText(
  value: string | null | undefined,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeRequiredText(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

function normalizeTimezone(value: string | null | undefined): string | null {
  return normalizeCompanyTimezone(value);
}

function getFormDefaults(
  company: CompanyData | null | undefined,
): SettingsCompanyFormValues {
  return {
    displayName: company?.displayName ?? null,
    legalName: company?.legalName ?? '',
    companyRegistrationNumber: company?.companyRegistrationNumber ?? null,
    companyTaxId: company?.companyTaxId ?? null,
    address: company?.address ?? null,
    description: company?.description ?? null,
    website: company?.website ?? null,
    industry: company?.industry ?? null,
    companySize: company?.companySize ?? null,
    revenue: company?.revenue ?? null,
    defaultTimezone: normalizeTimezone(company?.defaultTimezone),
  };
}

function getCompanyInitials(name: string | null | undefined) {
  const text = name?.trim();
  if (!text) return 'CO';
  const parts = text.split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function SettingsSection({
  title,
  description,
  titleAccessory,
  children,
}: {
  title: string;
  description?: string;
  titleAccessory?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-border/60 flex flex-col gap-4 rounded-md border p-4">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h2 className="text-sm font-medium">{title}</h2>
          {titleAccessory ? (
            <span className="flex shrink-0 items-center">{titleAccessory}</span>
          ) : null}
        </div>
        {description ? (
          <p className="text-muted-foreground text-xs">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function buildPayloadBaseline(
  company: CompanyData | null | undefined,
  options: {
    showRegistrationField: boolean;
    showTaxIdField: boolean;
    showBusinessContextSection: boolean;
  },
): SettingsCompanyPayload {
  const baseline: SettingsCompanyPayload = {
    displayName: normalizeOptionalText(company?.displayName),
    legalName: normalizeRequiredText(company?.legalName),
    address: normalizeOptionalText(company?.address),
    description: normalizeOptionalText(company?.description),
    website: normalizeOptionalText(company?.website),
    defaultTimezone: normalizeTimezone(company?.defaultTimezone),
  };

  if (options.showRegistrationField) {
    baseline.companyRegistrationNumber = normalizeOptionalText(
      company?.companyRegistrationNumber,
    );
  }

  if (options.showTaxIdField) {
    baseline.companyTaxId = normalizeOptionalText(company?.companyTaxId);
  }

  if (options.showBusinessContextSection) {
    baseline.industry = normalizeOptionalText(company?.industry);
    baseline.companySize = normalizeOptionalText(company?.companySize);
    baseline.revenue = normalizeOptionalText(company?.revenue);
  }

  return baseline;
}

function buildDirtyPayload(
  values: SettingsCompanyFormValues,
  baseline: SettingsCompanyPayload,
  options: {
    showRegistrationField: boolean;
    showTaxIdField: boolean;
    showBusinessContextSection: boolean;
  },
): SettingsCompanyPayload {
  const candidate: SettingsCompanyPayload = {
    displayName: normalizeOptionalText(values.displayName),
    legalName: normalizeRequiredText(values.legalName),
    address: normalizeOptionalText(values.address),
    description: normalizeOptionalText(values.description),
    website: normalizeOptionalText(values.website),
    defaultTimezone: normalizeTimezone(values.defaultTimezone),
  };

  if (options.showRegistrationField) {
    candidate.companyRegistrationNumber = normalizeOptionalText(
      values.companyRegistrationNumber,
    );
  }

  if (options.showTaxIdField) {
    candidate.companyTaxId = normalizeOptionalText(values.companyTaxId);
  }

  if (options.showBusinessContextSection) {
    candidate.industry = normalizeOptionalText(values.industry);
    candidate.companySize = normalizeOptionalText(values.companySize);
    candidate.revenue = normalizeOptionalText(values.revenue);
  }

  const dirty: Record<string, string | null | undefined> = {};
  for (const [key, value] of Object.entries(candidate)) {
    const typedKey = key as keyof SettingsCompanyPayload;
    if (baseline[typedKey] !== value) {
      dirty[typedKey] = value;
    }
  }

  return dirty as SettingsCompanyPayload;
}

function Banner({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'warning';
}) {
  return (
    <div
      className={
        tone === 'warning'
          ? 'rounded-md border border-amber-300/70 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-400/30 dark:bg-amber-950/30 dark:text-amber-100'
          : 'text-muted-foreground border-border/60 bg-muted/20 dark:bg-muted/10 rounded-md border px-3 py-2 text-sm'
      }
      role="status"
    >
      {children}
    </div>
  );
}

function FieldHelper({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <p className="text-muted-foreground text-xs">{children}</p>;
}

function fieldErrorMessage(error?: { message?: string }) {
  return error?.message;
}

function ReadOnlyField({
  label,
  value,
  helpTooltip,
  labelWrapperClassName,
  multiline = false,
  className,
}: {
  label: string;
  value: string;
  helpTooltip?: string;
  labelWrapperClassName?: string;
  multiline?: boolean;
  className?: string;
}) {
  return (
    <FormField
      label={label}
      className={className}
      helpTooltip={helpTooltip}
      labelWrapperClassName={labelWrapperClassName}
    >
      <div className="space-y-1.5">
        {multiline ? (
          <Textarea
            value={value}
            readOnly
            disabled
            className="min-h-24 resize-none"
          />
        ) : (
          <Input value={value} readOnly disabled />
        )}
      </div>
    </FormField>
  );
}

/** Read-only metadata shown as plain text (not a disabled input). */
function ReadOnlyTextDetail({
  label,
  value,
  helpTooltip,
  className,
  mono = false,
}: {
  label: string;
  value: string;
  helpTooltip?: string;
  className?: string;
  mono?: boolean;
}) {
  return (
    <FormField label={label} className={className} helpTooltip={helpTooltip}>
      <p
        className={cn(
          'text-foreground min-w-0 pt-0.5 text-sm leading-snug',
          mono && 'font-mono break-all tabular-nums',
        )}
      >
        {value}
      </p>
    </FormField>
  );
}

export function SettingsCompanyPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const logoObjectUrlRef = useRef<string | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [logoRemovedOptimistically, setLogoRemovedOptimistically] =
    useState(false);
  const { user, company, companyId, refetchCompany } = useSession();
  const current = user?.currentCompany;

  const canViewFirmSlug =
    current?.accessOrigin === 'platform_internal' ||
    current?.accessOrigin === 'break_glass' ||
    current?.supportAccessLevel === 'company_profile_write' ||
    (current?.roleScope === 'firm' && current.roleKey === 'admin');
  const canEditPage = canEditWorkspaceCompanySettings(user, current);
  const editBlockedReason = getWorkspaceCompanySettingsEditDeniedReason(
    user,
    current,
  );
  const isDemoBlocked =
    current?.isDemoCompany === true && user?.isPlatformUser !== true;
  const canPersistPage = canEditPage && !isDemoBlocked;

  const legalNameLocked = Boolean(company?.verification.legalName.verifiedAt);
  const registrationLocked = Boolean(
    company?.verification.registrationNumber.verifiedAt,
  );
  const taxIdLocked = Boolean(company?.verification.taxId.verifiedAt);
  const workspaceCompanyTypeLabel = getCompanyTypeLabel(
    company?.companyType ?? null,
  );
  const workspaceCompanyType = company?.companyType;
  const companyVisibility =
    getSettingsCompanyProfileVisibilityRules(workspaceCompanyType);
  const isIndividualWorkspace = companyVisibility.isIndividual;
  const showBusinessRegistrationFields =
    companyVisibility.showRegistrationField;
  const showTaxIdField = companyVisibility.showTaxIdField;
  const showBusinessContextSection =
    companyVisibility.showBusinessContextSection;
  const timezoneOptions = useMemo(
    () => getCompanyTimezoneOptions(company?.countryCode),
    [company?.countryCode],
  );
  const singleTimezone = timezoneOptions.length === 1;

  const formDefaults = useMemo(() => getFormDefaults(company), [company]);
  const {
    control,
    register,
    reset,
    setValue,
    trigger,
    watch,
    formState: { errors },
  } = useForm<SettingsCompanyFormValues, unknown, SettingsCompanyData>({
    mode: 'onBlur',
    resolver: standardSchemaResolver(settingsCompanyFormSchema),
    defaultValues: formDefaults,
  });

  useEffect(() => {
    reset(formDefaults);
  }, [formDefaults, reset]);

  const watchedDisplayName = watch('displayName');
  const watchedLegalName = watch('legalName');
  const watchedTimezone = watch('defaultTimezone');
  const watchedValues = watch();
  const normalizedTimezone = normalizeTimezone(watchedTimezone);
  const timezoneValidationMessage = getCompanyTimezoneValidationMessage({
    timezone: normalizedTimezone,
    timezoneOptions,
    countryLabel: company?.countryName ?? company?.countryCode,
  });
  const timezoneIsInvalid = Boolean(timezoneValidationMessage);

  useEffect(() => {
    if (!singleTimezone) return;

    const nextTimezone = timezoneOptions[0]?.value;
    if (!nextTimezone || normalizedTimezone === nextTimezone) return;

    setValue('defaultTimezone', nextTimezone, {
      shouldValidate: true,
    });
  }, [normalizedTimezone, setValue, singleTimezone, timezoneOptions]);

  const payloadBaseline = useMemo(
    () =>
      buildPayloadBaseline(company, {
        showRegistrationField: showBusinessRegistrationFields,
        showTaxIdField,
        showBusinessContextSection,
      }),
    [
      company,
      showBusinessRegistrationFields,
      showBusinessContextSection,
      showTaxIdField,
    ],
  );

  const dirtyPayload = useMemo(
    () =>
      buildDirtyPayload(watchedValues, payloadBaseline, {
        showRegistrationField: showBusinessRegistrationFields,
        showTaxIdField,
        showBusinessContextSection,
      }),
    [
      watchedValues,
      payloadBaseline,
      showBusinessRegistrationFields,
      showBusinessContextSection,
      showTaxIdField,
    ],
  );

  const hasDirtyChanges = Object.keys(dirtyPayload).length > 0;
  const uploadCompanyLogoMutation = useUploadCompanyLogo();
  const deleteCompanyLogoMutation = useDeleteCompanyLogo();
  const isUpdatingLogo =
    uploadCompanyLogoMutation.isPending || deleteCompanyLogoMutation.isPending;
  const displayedCompanyLogo = logoRemovedOptimistically
    ? null
    : (logoPreviewUrl ?? company?.companyLogo ?? null);

  const clearLogoObjectUrl = () => {
    if (!logoObjectUrlRef.current) return;
    URL.revokeObjectURL(logoObjectUrlRef.current);
    logoObjectUrlRef.current = null;
  };

  const setTemporaryLogoPreview = (file: File) => {
    clearLogoObjectUrl();
    const objectUrl = URL.createObjectURL(file);
    logoObjectUrlRef.current = objectUrl;
    setLogoPreviewUrl(objectUrl);
    setLogoRemovedOptimistically(false);
  };

  useEffect(() => () => clearLogoObjectUrl(), []);

  useEffect(() => {
    clearLogoObjectUrl();
    setLogoPreviewUrl(null);
    setLogoRemovedOptimistically(false);
  }, [company?.companyLogo]);

  const refreshCompanyLogoState = async () => {
    if (!companyId) return;
    await Promise.all([
      refetchCompany(),
      queryClient.invalidateQueries({
        queryKey: ['companyDetails', companyId],
      }),
    ]);
  };

  const handleUploadLogoClick = () => {
    if (!canPersistPage || isUpdatingLogo) return;
    fileInputRef.current?.click();
  };

  const handleLogoFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file || !companyId || !canPersistPage) {
      return;
    }

    setTemporaryLogoPreview(file);
    try {
      const response = await uploadCompanyLogoMutation.mutateAsync({
        companyId,
        file,
      });
      if (!response.success || !response.data) {
        throw new Error(response.message || 'Failed to upload company logo');
      }

      clearLogoObjectUrl();
      setLogoPreviewUrl(response.data.url);
      setLogoRemovedOptimistically(false);
      await refreshCompanyLogoState();
      toast.success('Company logo updated');
    } catch (error) {
      clearLogoObjectUrl();
      setLogoPreviewUrl(null);
      setLogoRemovedOptimistically(false);
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to upload company logo',
      );
    }
  };

  const handleRemoveLogo = async () => {
    if (
      !companyId ||
      !displayedCompanyLogo ||
      !canPersistPage ||
      isUpdatingLogo
    ) {
      return;
    }

    clearLogoObjectUrl();
    setLogoPreviewUrl(null);
    setLogoRemovedOptimistically(true);
    try {
      const response = await deleteCompanyLogoMutation.mutateAsync(companyId);
      if (!response.success) {
        throw new Error(response.message || 'Failed to remove company logo');
      }

      await refreshCompanyLogoState();
      toast.success('Company logo removed');
    } catch (error) {
      setLogoRemovedOptimistically(false);
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to remove company logo',
      );
    }
  };

  const updateCompanyMutation = useUpdateCompanyDetails();

  const handleSave = async () => {
    if (
      !companyId ||
      !canPersistPage ||
      updateCompanyMutation.isPending ||
      !hasDirtyChanges ||
      timezoneIsInvalid
    ) {
      return;
    }

    const isValid = await trigger();
    if (!isValid) {
      toast.error('Please fix the highlighted fields before saving');
      return;
    }

    try {
      const response = await updateCompanyMutation.mutateAsync({
        companyId,
        data: dirtyPayload,
      });
      if (!response.success || !response.data) {
        throw new Error(response.message || 'Failed to update company details');
      }

      await Promise.all([
        refetchCompany(),
        queryClient.invalidateQueries({
          queryKey: ['companyDetails', companyId],
        }),
      ]);
      toast.success('Company settings saved');
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to save company settings',
      );
    }
  };

  const saveHelperText = !canPersistPage
    ? editBlockedReason || "Saving isn't available for this session"
    : updateCompanyMutation.isPending
      ? 'Saving your company settings...'
      : timezoneIsInvalid
        ? timezoneValidationMessage
        : hasDirtyChanges
          ? 'Save to apply updates.'
          : 'No unsaved changes.';

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden py-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={handleLogoFileChange}
      />

      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground text-sm">
          Review your workspace profile. Verified fields may be locked.
        </p>
        {isDemoBlocked ? (
          <Banner tone="warning">
            Demo workspaces are read-only for non-platform sessions. You can
            review the form, but editing, logo changes, and saving are disabled.
          </Banner>
        ) : null}
        {!isDemoBlocked && !canEditPage && editBlockedReason ? (
          <Banner>{editBlockedReason}</Banner>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        <SettingsSection
          title="Workspace Identity"
          description={
            isIndividualWorkspace
              ? 'Logo, how your name appears, and your legal name.'
              : 'Logo, display name, and legal name.'
          }
          titleAccessory={
            <Badge
              variant="secondary"
              className="hidden font-normal lg:inline-flex"
              title={`${workspaceCompanyTypeLabel}. Set at signup—not editable here.`}
              aria-label={`Company type ${workspaceCompanyTypeLabel}, not editable in settings`}
            >
              {workspaceCompanyTypeLabel}
            </Badge>
          }
        >
          <div className="grid gap-4 lg:grid-cols-[auto_minmax(0,1fr)] lg:gap-x-6">
            <div className="flex min-w-0 gap-3 lg:gap-2">
              <div className="flex w-max max-w-full shrink-0 items-stretch gap-2">
                <Avatar className="ring-border size-16 rounded-md ring-1 ring-inset">
                  {displayedCompanyLogo ? (
                    <AvatarImage
                      src={displayedCompanyLogo}
                      alt="Workspace logo"
                      className="object-cover"
                    />
                  ) : null}
                  <AvatarFallback className="rounded-md text-xs font-semibold">
                    {getCompanyInitials(watchedDisplayName ?? watchedLegalName)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex h-16 flex-col justify-between">
                  <Button
                    type="button"
                    variant="outline"
                    aria-label="Upload workspace logo"
                    disabled={!canPersistPage || isUpdatingLogo}
                    onClick={handleUploadLogoClick}
                    className="size-8 shrink-0 p-0 lg:size-auto lg:h-7 lg:min-w-20 lg:justify-start lg:gap-1 lg:px-2 lg:text-xs"
                  >
                    <Camera className="size-4 shrink-0" />
                    <span className="hidden lg:inline">Upload</span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label="Remove workspace logo"
                    disabled={
                      !canPersistPage || !displayedCompanyLogo || isUpdatingLogo
                    }
                    onClick={handleRemoveLogo}
                    className="text-destructive size-8 shrink-0 p-0 font-normal lg:size-auto lg:h-7 lg:min-w-20 lg:justify-start lg:gap-1 lg:px-2 lg:text-xs"
                  >
                    <Trash2 className="size-4 shrink-0" />
                    <span className="hidden lg:inline">Remove</span>
                  </Button>
                </div>
              </div>
              <div className="flex min-w-0 flex-1 items-end lg:hidden">
                <div className="ml-auto flex max-w-full min-w-0 flex-col items-end gap-0.5">
                  <p className="text-muted-foreground text-xs">Company Type</p>
                  <span
                    className="text-foreground bg-muted inline-block w-max max-w-full truncate rounded-full border px-2 py-0.5 text-center text-sm leading-snug font-medium"
                    title={workspaceCompanyTypeLabel}
                  >
                    {workspaceCompanyTypeLabel}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                label="Display Name"
                error={fieldErrorMessage(errors.displayName)}
                helpTooltip={
                  isIndividualWorkspace
                    ? 'How your name appears in the app.'
                    : 'Shown in the app; can differ from legal name.'
                }
              >
                <Input
                  {...register('displayName')}
                  disabled={!canEditPage}
                  aria-invalid={!!errors.displayName}
                  placeholder={
                    isIndividualWorkspace ? 'Your name' : 'Display name'
                  }
                />
              </FormField>

              <FormField
                label="Legal Name"
                renderLabel={
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                      <Label>Legal Name</Label>
                      {legalNameLocked ? (
                        <Lock className="text-muted-foreground size-3.5" />
                      ) : (
                        <TooltipHelper
                          content={
                            isIndividualWorkspace
                              ? 'Your legal name as on ID and tax forms.'
                              : 'Legal name on tax forms and contracts.'
                          }
                        />
                      )}
                    </div>
                  </div>
                }
              >
                <div className="space-y-1.5">
                  <Input
                    {...register('legalName')}
                    disabled={!canEditPage || legalNameLocked}
                    readOnly={legalNameLocked}
                    aria-invalid={!!errors.legalName}
                  />
                  {errors.legalName?.message ? (
                    <p className="text-destructive text-xs">
                      {errors.legalName.message}
                    </p>
                  ) : legalNameLocked ? (
                    <FieldHelper>
                      Verified. Contact support to change.
                    </FieldHelper>
                  ) : null}
                </div>
              </FormField>
            </div>
          </div>
        </SettingsSection>

        <SettingsSection
          title="Regional and Time"
          description="Country and timezone for this workspace"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              label="Default Timezone"
              labelWrapperClassName="h-5"
              error={
                timezoneValidationMessage ?? errors.defaultTimezone?.message
              }
              helpTooltip="Used for reporting cutoffs, deadlines, recurring schedules, and day-boundary calculations."
            >
              <div className="space-y-1.5">
                <Controller
                  name="defaultTimezone"
                  control={control}
                  render={({ field }) => (
                    <AutocompleteDropdown
                      id="company-settings-timezone"
                      items={timezoneOptions}
                      value={field.value ?? ''}
                      onValueChange={(value) =>
                        field.onChange(value === '' ? null : value)
                      }
                      placeholder={
                        !company?.countryCode
                          ? 'Country required'
                          : singleTimezone
                            ? 'Automatically selected'
                            : 'Select timezone'
                      }
                      searchPlaceholder="Search timezones..."
                      className="h-9 w-full"
                      disabled={
                        !canEditPage || !company?.countryCode || singleTimezone
                      }
                      aria-invalid={
                        timezoneIsInvalid || !!errors.defaultTimezone
                      }
                      noResultsMessage="No matching timezones"
                    />
                  )}
                />
                <FieldHelper>
                  {singleTimezone
                    ? 'This country has one supported timezone, so it is fixed here.'
                    : !timezoneValidationMessage &&
                        !errors.defaultTimezone?.message
                      ? 'Changing this affects how reports, deadlines, and activity days are grouped.'
                      : null}
                </FieldHelper>
              </div>
            </FormField>
            <ReadOnlyField
              label="Country"
              labelWrapperClassName="h-5"
              value={displayValue(
                company?.countryName ?? company?.countryCode ?? null,
              )}
            />
          </div>
        </SettingsSection>

        <SettingsSection
          title={
            isIndividualWorkspace
              ? 'Tax identifier'
              : 'Compliance and Registration'
          }
          description={
            isIndividualWorkspace
              ? 'Personal or sole trader tax ID on file.'
              : 'Business registration and tax identifiers.'
          }
        >
          <div
            className={cn(
              'grid gap-4',
              showBusinessRegistrationFields && 'md:grid-cols-2',
            )}
          >
            {showBusinessRegistrationFields ? (
              <FormField
                label="Registration Number"
                renderLabel={
                  <div className="flex items-center gap-1">
                    <Label>Registration Number</Label>
                    {registrationLocked ? (
                      <Lock className="text-muted-foreground size-3.5" />
                    ) : (
                      <TooltipHelper
                        content="Government business registration number"
                        contentStyle="w-fit"
                      />
                    )}
                  </div>
                }
              >
                <div className="space-y-1.5">
                  <Input
                    {...register('companyRegistrationNumber')}
                    disabled={!canEditPage || registrationLocked}
                    readOnly={registrationLocked}
                    aria-invalid={!!errors.companyRegistrationNumber}
                  />
                  {errors.companyRegistrationNumber?.message ? (
                    <p className="text-destructive text-xs">
                      {errors.companyRegistrationNumber.message}
                    </p>
                  ) : registrationLocked ? (
                    <FieldHelper>
                      Verified. Contact support to change.
                    </FieldHelper>
                  ) : null}
                </div>
              </FormField>
            ) : null}

            {showTaxIdField ? (
              <FormField
                label="Tax ID"
                className={cn(
                  !showBusinessRegistrationFields && 'md:col-span-2',
                )}
                renderLabel={
                  <div className="flex items-center gap-1">
                    <Label>Tax ID</Label>
                    {taxIdLocked ? (
                      <Lock className="text-muted-foreground size-3.5" />
                    ) : (
                      <TooltipHelper
                        content={
                          isIndividualWorkspace
                            ? 'Your tax ID'
                            : 'Business tax identifier.'
                        }
                        contentStyle="w-fit"
                      />
                    )}
                  </div>
                }
              >
                <div className="space-y-1.5">
                  <Input
                    {...register('companyTaxId')}
                    disabled={!canEditPage || taxIdLocked}
                    readOnly={taxIdLocked}
                    aria-invalid={!!errors.companyTaxId}
                  />
                  {errors.companyTaxId?.message ? (
                    <p className="text-destructive text-xs">
                      {errors.companyTaxId.message}
                    </p>
                  ) : taxIdLocked ? (
                    <FieldHelper>
                      Verified. Contact support to change.
                    </FieldHelper>
                  ) : null}
                </div>
              </FormField>
            ) : null}
          </div>
        </SettingsSection>

        <SettingsSection
          title="Profile and Contact"
          description={
            isIndividualWorkspace
              ? 'Website, address, and a short bio.'
              : 'Website, address, and short business description.'
          }
        >
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                label="Website"
                error={fieldErrorMessage(errors.website)}
                helpTooltip={
                  isIndividualWorkspace
                    ? 'Optional personal or portfolio site.'
                    : 'Optional public website URL.'
                }
              >
                <Input
                  {...register('website')}
                  disabled={!canEditPage}
                  aria-invalid={!!errors.website}
                  placeholder={
                    isIndividualWorkspace
                      ? 'https://example.com'
                      : 'https://yourcompany.com'
                  }
                />
              </FormField>
              <div className="hidden md:block" aria-hidden />
            </div>

            <div className="grid gap-4 md:grid-cols-2 md:items-stretch">
              <FormField
                label="Address"
                className="flex h-full min-h-0 flex-col"
                error={fieldErrorMessage(errors.address)}
                helpTooltip={
                  isIndividualWorkspace
                    ? 'Mailing or contact address'
                    : 'Business or mailing address'
                }
              >
                <div className="flex min-h-0 flex-1 flex-col gap-1.5">
                  <Textarea
                    {...register('address')}
                    disabled={!canEditPage}
                    aria-invalid={!!errors.address}
                    className="min-h-24 flex-1 resize-none"
                    placeholder={
                      isIndividualWorkspace
                        ? 'Mailing or contact address'
                        : 'Business or mailing address'
                    }
                  />
                </div>
              </FormField>

              <FormField
                label="Description"
                className="flex h-full min-h-0 flex-col"
                error={fieldErrorMessage(errors.description)}
                helpTooltip={
                  isIndividualWorkspace
                    ? 'Optional short bio or what you do.'
                    : 'Optional one-line summary of the business.'
                }
              >
                <div className="flex min-h-0 flex-1 flex-col gap-1.5">
                  <Textarea
                    {...register('description')}
                    disabled={!canEditPage}
                    aria-invalid={!!errors.description}
                    className="min-h-24 flex-1 resize-none"
                    placeholder={
                      isIndividualWorkspace
                        ? 'Freelance designer, …'
                        : 'We are a…'
                    }
                  />
                </div>
              </FormField>
            </div>
          </div>
        </SettingsSection>

        {showBusinessContextSection ? (
          <SettingsSection
            title="Business Context"
            description="Industry, size, and revenue band"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                label="Industry"
                error={fieldErrorMessage(errors.industry)}
                helpTooltip="Helps suggest a sensible chart of accounts"
              >
                <Input
                  {...register('industry')}
                  disabled={!canEditPage}
                  aria-invalid={!!errors.industry}
                  placeholder="Industry or sector"
                />
              </FormField>

              <Controller
                name="companySize"
                control={control}
                render={({ field }) => (
                  <FormField
                    label="Company Size"
                    error={fieldErrorMessage(errors.companySize)}
                    helpTooltip="Approximate headcount for benchmarks"
                  >
                    <Select
                      onValueChange={(value) =>
                        field.onChange(
                          value === OPTIONAL_SELECT_NONE ? null : value,
                        )
                      }
                      value={field.value ?? OPTIONAL_SELECT_NONE}
                      disabled={!canEditPage}
                    >
                      <SelectTrigger
                        className="w-full"
                        aria-invalid={!!errors.companySize}
                      >
                        <SelectValue placeholder="Select company size" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={OPTIONAL_SELECT_NONE}>
                          Not set
                        </SelectItem>
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

              <Controller
                name="revenue"
                control={control}
                render={({ field }) => (
                  <FormField
                    label="Revenue"
                    error={fieldErrorMessage(errors.revenue)}
                    helpTooltip="Optional revenue band for templates and insights"
                  >
                    <Select
                      onValueChange={(value) =>
                        field.onChange(
                          value === OPTIONAL_SELECT_NONE ? null : value,
                        )
                      }
                      value={field.value ?? OPTIONAL_SELECT_NONE}
                      disabled={!canEditPage}
                    >
                      <SelectTrigger
                        className="w-full"
                        aria-invalid={!!errors.revenue}
                      >
                        <SelectValue placeholder="Choose revenue range" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={OPTIONAL_SELECT_NONE}>
                          Not set
                        </SelectItem>
                        {COMPANY_REVENUE_RANGE.map((range) => (
                          <SelectItem key={range.value} value={range.value}>
                            {range.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                )}
              />
            </div>
          </SettingsSection>
        ) : null}

        <SettingsSection
          title="Accounting Snapshot"
          description="Currency, year-end, framework, and accounting basis"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <ReadOnlyField
              label="Reporting Currency"
              value={displayValue(
                company?.reportingCurrencyName ??
                  company?.reportingCurrencyCode,
              )}
              helpTooltip="Primary currency for books and reports"
            />
            <ReadOnlyField
              label="Fiscal Year End"
              value={
                company?.yearEndMonth && company?.yearEndDay
                  ? `${company.yearEndMonth}/${company.yearEndDay}`
                  : 'Not set'
              }
              helpTooltip="Last day of your financial year"
            />
            <ReadOnlyField
              label="Reporting Framework"
              value={getReportingFrameworkLabel(
                company?.reportingFramework ?? null,
              )}
              helpTooltip="Reporting standard (e.g. GAAP, IFRS)"
            />
            <ReadOnlyField
              label="Accounting Basis"
              value={getAccountingBasisLabel(company?.accountingBasis ?? null)}
              helpTooltip="Cash: when money moves. Accrual: when earned or owed"
            />
          </div>
        </SettingsSection>

        <SettingsSection
          title="Firm Relationship"
          description="Linked accounting firm, if any"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <ReadOnlyTextDetail
              label="Assigned Firm"
              value={displayValue(company?.assignedFirmName)}
            />
            {canViewFirmSlug ? (
              <ReadOnlyTextDetail
                label="Firm Slug"
                value={displayValue(company?.assignedFirmSlug)}
              />
            ) : null}
          </div>
        </SettingsSection>
      </div>

      <div className="border-border/60 flex items-center justify-between gap-4 rounded-md border px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Save Changes</p>
          <p className="text-muted-foreground text-xs">{saveHelperText}</p>
        </div>
        <Button
          type="button"
          disabled={
            !canPersistPage ||
            updateCompanyMutation.isPending ||
            !hasDirtyChanges ||
            timezoneIsInvalid
          }
          onClick={handleSave}
        >
          {updateCompanyMutation.isPending ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}
