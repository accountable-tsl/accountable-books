import type {
  CompanyData,
  UpdateCompanyVitalsFormValues,
} from '@/modules/company/companies';
import type { ChangeEvent, ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import {
  COMPANY_REVENUE_RANGE,
  COMPANY_SIZE,
  getAccountingBasisLabel,
  getCompanyTypeLabel,
  getReportingFrameworkLabel,
} from '@/modules/company/companies';
import { deleteCompanyLogo, uploadCompanyLogo } from '@/modules/objects';
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
>;

function displayValue(value: string | null | undefined) {
  if (value == null) return 'Not set';
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : 'Not set';
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
          ? 'rounded-md border border-amber-300/70 bg-amber-50 px-3 py-2 text-sm text-amber-950'
          : 'text-muted-foreground border-border/60 rounded-md border px-3 py-2 text-sm'
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

function ReadOnlyField({
  label,
  value,
  helper,
  multiline = false,
  className,
}: {
  label: string;
  value: string;
  helper?: string;
  multiline?: boolean;
  className?: string;
}) {
  return (
    <FormField label={label} className={className}>
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
        <FieldHelper>{helper}</FieldHelper>
      </div>
    </FormField>
  );
}

export function SettingsCompanyPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUpdatingLogo, setIsUpdatingLogo] = useState(false);
  const { user, company, companyId, refetchCompany } = useSession();
  const current = user?.currentCompany;

  const canViewFirmSlug =
    current?.roleScope !== 'firm' || current?.roleKey === 'admin';
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
  const addressVerified = Boolean(company?.verification.address.verifiedAt);
  const workspaceCompanyTypeLabel = getCompanyTypeLabel(
    company?.companyType ?? null,
  );

  const formDefaults = useMemo(() => getFormDefaults(company), [company]);
  const { control, register, reset, watch } =
    useForm<SettingsCompanyFormValues>({
      defaultValues: formDefaults,
    });

  useEffect(() => {
    reset(formDefaults);
  }, [formDefaults, reset]);

  const watchedDisplayName = watch('displayName');
  const watchedLegalName = watch('legalName');

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

    setIsUpdatingLogo(true);
    try {
      const response = await uploadCompanyLogo({ companyId, file });
      if (!response.success) {
        toast.error(response.message || 'Failed to upload company logo');
        return;
      }

      await refreshCompanyLogoState();
      toast.success('Company logo updated');
    } catch {
      toast.error('Failed to upload company logo');
    } finally {
      setIsUpdatingLogo(false);
    }
  };

  const handleRemoveLogo = async () => {
    if (
      !companyId ||
      !company?.companyLogo ||
      !canPersistPage ||
      isUpdatingLogo
    ) {
      return;
    }

    setIsUpdatingLogo(true);
    try {
      const response = await deleteCompanyLogo(companyId);
      if (!response.success) {
        toast.error(response.message || 'Failed to remove company logo');
        return;
      }

      await refreshCompanyLogoState();
      toast.success('Company logo removed');
    } catch {
      toast.error('Failed to remove company logo');
    } finally {
      setIsUpdatingLogo(false);
    }
  };

  const saveHelperText = canPersistPage
    ? 'Changes can be edited locally now. Save wiring is added in the next step.'
    : editBlockedReason || 'Editing is unavailable for this session.';

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
          Company profile details are grouped below. Editable controls are ready
          for fields this page owns, while save wiring lands in the next step.
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
        {canEditPage ? (
          <p className="text-muted-foreground text-xs">
            Fields that are not verification-locked can be edited in this
            session. Save remains disabled until the persistence step is wired.
          </p>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        <SettingsSection
          title="Workspace Identity"
          description="Primary workspace identity and legal naming."
          titleAccessory={
            <Badge
              variant="secondary"
              className="hidden font-normal lg:inline-flex"
              title={`Company type: ${workspaceCompanyTypeLabel}. Cannot be changed here.`}
              aria-label={`Company type ${workspaceCompanyTypeLabel}. Cannot be changed in workspace settings.`}
            >
              {workspaceCompanyTypeLabel}
            </Badge>
          }
        >
          <div className="grid gap-4 lg:grid-cols-[auto_minmax(0,1fr)] lg:gap-x-6">
            <div className="flex min-w-0 gap-3 lg:gap-2">
              <div className="flex w-max max-w-full shrink-0 items-stretch gap-2">
                <Avatar className="ring-border size-16 rounded-md ring-1 ring-inset">
                  {company?.companyLogo ? (
                    <AvatarImage
                      src={company.companyLogo}
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
                      !canPersistPage || !company?.companyLogo || isUpdatingLogo
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
                helpTooltip="This is how your workspace name appears across the product."
              >
                <Input
                  {...register('displayName')}
                  disabled={!canEditPage}
                  placeholder="What people see across the workspace"
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
                        <TooltipHelper content="Used for official workspace identity and verification." />
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
                  />
                  {legalNameLocked ? (
                    <FieldHelper>
                      This value is verified and cannot be changed here.
                    </FieldHelper>
                  ) : null}
                </div>
              </FormField>
            </div>
          </div>
        </SettingsSection>

        <SettingsSection
          title="Regional and Time"
          description="Country and timezone context used across workspace behavior."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <ReadOnlyField
              label="Default Timezone"
              value={displayValue(company?.defaultTimezone)}
              helper="Timezone selection is added in the dedicated timezone step."
            />
            <ReadOnlyField
              label="Country"
              value={displayValue(
                company?.countryName ?? company?.countryCode ?? null,
              )}
              helper="Country remains read-only in this settings flow."
            />
          </div>
        </SettingsSection>

        <SettingsSection
          title="Compliance and Registration"
          description="Tax and registration profile for this workspace."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              label="Registration Number"
              renderLabel={
                <div className="flex items-center gap-1">
                  <span className="text-sm font-medium">
                    Registration Number
                  </span>
                  {registrationLocked ? (
                    <Lock className="text-muted-foreground size-3.5" />
                  ) : null}
                </div>
              }
            >
              <div className="space-y-1.5">
                <Input
                  {...register('companyRegistrationNumber')}
                  disabled={!canEditPage || registrationLocked}
                  readOnly={registrationLocked}
                />
                <FieldHelper>
                  {registrationLocked
                    ? 'This value is verified and cannot be changed here.'
                    : 'Enter the company registration number used for this workspace.'}
                </FieldHelper>
              </div>
            </FormField>

            <FormField
              label="Tax ID"
              renderLabel={
                <div className="flex items-center gap-1">
                  <span className="text-sm font-medium">Tax ID</span>
                  {taxIdLocked ? (
                    <Lock className="text-muted-foreground size-3.5" />
                  ) : null}
                </div>
              }
            >
              <div className="space-y-1.5">
                <Input
                  {...register('companyTaxId')}
                  disabled={!canEditPage || taxIdLocked}
                  readOnly={taxIdLocked}
                />
                <FieldHelper>
                  {taxIdLocked
                    ? 'This value is verified and cannot be changed here.'
                    : 'Enter the company tax identifier used for filings and records.'}
                </FieldHelper>
              </div>
            </FormField>
          </div>
        </SettingsSection>

        <SettingsSection
          title="Profile and Contact"
          description="Public profile and contact information."
        >
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label="Website">
                <Input
                  {...register('website')}
                  disabled={!canEditPage}
                  placeholder="https://yourcompany.com"
                />
              </FormField>
              <div className="hidden md:block" aria-hidden />
            </div>

            <div className="grid gap-4 md:grid-cols-2 md:items-stretch">
              <FormField
                label="Address"
                className="flex h-full min-h-0 flex-col"
              >
                <div className="flex min-h-0 flex-1 flex-col gap-1.5">
                  <Textarea
                    {...register('address')}
                    disabled={!canEditPage}
                    className="min-h-24 flex-1 resize-none"
                    placeholder="Business or mailing address"
                  />
                  <div className="min-h-10 shrink-0">
                    <FieldHelper>
                      {addressVerified
                        ? 'Address verification is informational. This field remains editable.'
                        : 'This address can be updated from workspace settings.'}
                    </FieldHelper>
                  </div>
                </div>
              </FormField>

              <FormField
                label="Description"
                className="flex h-full min-h-0 flex-col"
              >
                <div className="flex min-h-0 flex-1 flex-col gap-1.5">
                  <Textarea
                    {...register('description')}
                    disabled={!canEditPage}
                    className="min-h-24 flex-1 resize-none"
                    placeholder="Short description for this workspace"
                  />
                  <div className="min-h-10 shrink-0">
                    <FieldHelper>
                      Optional. Used where workspace context is summarized.
                    </FieldHelper>
                  </div>
                </div>
              </FormField>
            </div>
          </div>
        </SettingsSection>

        <SettingsSection
          title="Business Context"
          description="Business descriptors used for defaults and reporting context."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Industry">
              <Input
                {...register('industry')}
                disabled={!canEditPage}
                placeholder="Industry or sector"
              />
            </FormField>

            <Controller
              name="companySize"
              control={control}
              render={({ field }) => (
                <FormField label="Company Size">
                  <Select
                    onValueChange={field.onChange}
                    value={field.value ?? undefined}
                    disabled={!canEditPage}
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

            <Controller
              name="revenue"
              control={control}
              render={({ field }) => (
                <FormField label="Revenue">
                  <Select
                    onValueChange={field.onChange}
                    value={field.value ?? undefined}
                    disabled={!canEditPage}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choose revenue range" />
                    </SelectTrigger>
                    <SelectContent>
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

        <SettingsSection
          title="Accounting Snapshot"
          description="Current accounting settings shown as read-only context."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <ReadOnlyField
              label="Reporting Currency"
              value={displayValue(
                company?.reportingCurrencyName ??
                  company?.reportingCurrencyCode,
              )}
            />
            <ReadOnlyField
              label="Fiscal Year End"
              value={
                company?.yearEndMonth && company?.yearEndDay
                  ? `${company.yearEndMonth}/${company.yearEndDay}`
                  : 'Not set'
              }
            />
            <ReadOnlyField
              label="Reporting Framework"
              value={getReportingFrameworkLabel(
                company?.reportingFramework ?? null,
              )}
            />
            <ReadOnlyField
              label="Accounting Basis"
              value={getAccountingBasisLabel(company?.accountingBasis ?? null)}
            />
          </div>
        </SettingsSection>

        <SettingsSection
          title="Firm Relationship"
          description="Workspace assignment to a managing accounting firm."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <ReadOnlyField
              label="Assigned Firm"
              value={displayValue(company?.assignedFirmName)}
              helper="Managing firm metadata remains read-only here."
            />
            {canViewFirmSlug ? (
              <ReadOnlyField
                label="Firm Slug"
                value={displayValue(company?.assignedFirmSlug)}
                helper="Firm slug is shown for context only."
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
        <Button type="button" disabled>
          Save Changes
        </Button>
      </div>
    </div>
  );
}
