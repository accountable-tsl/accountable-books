import type { ChangeEvent, ReactNode } from 'react';
import { useRef, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  getAccountingBasisLabel,
  getCompanyTypeLabel,
  getReportingFrameworkLabel,
} from '@/modules/company/companies';
import { deleteCompanyLogo, uploadCompanyLogo } from '@/modules/objects';
import { useSession } from '@session';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, Lock, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import {
  canEditWorkspaceCompanySettings,
  getWorkspaceCompanySettingsEditDeniedReason,
} from '../lib/company-settings-permissions';

function displayValue(value: string | null | undefined) {
  if (value == null) return 'Not set';
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : 'Not set';
}

function FieldItem({
  label,
  value,
  status,
  helper,
}: {
  label: string;
  value: string;
  status?: 'locked';
  helper?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="text-muted-foreground flex items-center gap-1 text-xs">
        <span>{label}</span>
        {status === 'locked' ? (
          <Lock className="size-3.5" aria-label="Locked field" />
        ) : null}
      </div>
      <p className="text-sm">{value}</p>
      {helper ? (
        <p className="text-muted-foreground text-xs">{helper}</p>
      ) : null}
    </div>
  );
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
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="border-border/60 flex flex-col gap-4 rounded-md border p-4">
      <div className="flex flex-col">
        <h2 className="text-sm font-medium">{title}</h2>
        {description ? (
          <p className="text-muted-foreground text-xs">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
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

  const canEdit = canEditWorkspaceCompanySettings(user, current);
  const blockReason = getWorkspaceCompanySettingsEditDeniedReason(
    user,
    current,
  );

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
    if (!canEdit || isUpdatingLogo) return;
    fileInputRef.current?.click();
  };

  const handleLogoFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file || !companyId) {
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
    } catch (error) {
      toast.error('Failed to upload company logo');
    } finally {
      setIsUpdatingLogo(false);
    }
  };

  const handleRemoveLogo = async () => {
    if (!companyId || !company?.companyLogo || isUpdatingLogo) {
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
    } catch (error) {
      toast.error('Failed to remove company logo');
    } finally {
      setIsUpdatingLogo(false);
    }
  };

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
          Company profile details are grouped below. Editing controls and save
          actions are added in the next phase.
        </p>
        {!canEdit && blockReason ? (
          <p
            className="text-muted-foreground border-border/60 rounded-md border px-3 py-2 text-sm"
            role="status"
          >
            {blockReason}
          </p>
        ) : null}
        {canEdit ? (
          <p className="text-muted-foreground text-xs">
            You can edit workspace company settings for this session.
          </p>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        <SettingsSection
          title="Workspace Identity"
          description="Primary workspace identity and legal naming."
        >
          <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
            <div className="flex items-stretch gap-2">
              <Avatar className="ring-border size-16 rounded-md ring-1 ring-inset">
                {company?.companyLogo ? (
                  <AvatarImage
                    src={company.companyLogo}
                    alt="Workspace logo"
                    className="object-cover"
                  />
                ) : null}
                <AvatarFallback className="rounded-md text-xs font-semibold">
                  {getCompanyInitials(
                    company?.displayName ?? company?.legalName,
                  )}
                </AvatarFallback>
              </Avatar>
              <div className="flex h-16 flex-col justify-between">
                <Button
                  type="button"
                  variant="outline"
                  aria-label="Upload workspace logo"
                  disabled={!canEdit || isUpdatingLogo}
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
                  disabled={!canEdit || !company?.companyLogo || isUpdatingLogo}
                  onClick={handleRemoveLogo}
                  className="text-destructive size-8 shrink-0 p-0 font-normal lg:size-auto lg:h-7 lg:min-w-20 lg:justify-start lg:gap-1 lg:px-2 lg:text-xs"
                >
                  <Trash2 className="size-4 shrink-0" />
                  <span className="hidden lg:inline">Remove</span>
                </Button>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <FieldItem
                label="Display Name"
                value={displayValue(company?.displayName)}
              />
              <FieldItem
                label="Legal Name"
                value={displayValue(company?.legalName)}
                status={
                  company?.verification.legalName.verifiedAt
                    ? 'locked'
                    : undefined
                }
                helper={
                  company?.verification.legalName.verifiedAt
                    ? 'Verified details are locked.'
                    : undefined
                }
              />
              <FieldItem
                label="Company Type"
                value={getCompanyTypeLabel(company?.companyType ?? null)}
              />
            </div>
          </div>
        </SettingsSection>

        <SettingsSection
          title="Regional and Time"
          description="Country and timezone context used across workspace behavior."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <FieldItem
              label="Default Timezone"
              value={displayValue(company?.defaultTimezone)}
            />
            <FieldItem
              label="Country"
              value={displayValue(
                company?.countryName ?? company?.countryCode ?? null,
              )}
            />
          </div>
        </SettingsSection>

        <SettingsSection
          title="Compliance and Registration"
          description="Tax and registration profile for this workspace."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <FieldItem
              label="Registration Number"
              value={displayValue(company?.companyRegistrationNumber)}
              status={
                company?.verification.registrationNumber.verifiedAt
                  ? 'locked'
                  : undefined
              }
              helper={
                company?.verification.registrationNumber.verifiedAt
                  ? 'Verified details are locked.'
                  : undefined
              }
            />
            <FieldItem
              label="Tax ID"
              value={displayValue(company?.companyTaxId)}
              status={
                company?.verification.taxId.verifiedAt ? 'locked' : undefined
              }
              helper={
                company?.verification.taxId.verifiedAt
                  ? 'Verified details are locked.'
                  : undefined
              }
            />
          </div>
        </SettingsSection>

        <SettingsSection
          title="Profile and Contact"
          description="Public profile and contact information."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <FieldItem label="Website" value={displayValue(company?.website)} />
            <FieldItem label="Address" value={displayValue(company?.address)} />
            <FieldItem
              label="Description"
              value={displayValue(company?.description)}
            />
          </div>
        </SettingsSection>

        <SettingsSection
          title="Business Context"
          description="Business descriptors used for defaults and reporting context."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <FieldItem
              label="Industry"
              value={displayValue(company?.industry)}
            />
            <FieldItem
              label="Company Size"
              value={displayValue(company?.companySize)}
            />
            <FieldItem label="Revenue" value={displayValue(company?.revenue)} />
          </div>
        </SettingsSection>

        <SettingsSection
          title="Accounting Snapshot"
          description="Current accounting settings shown as read-only context."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <FieldItem
              label="Reporting Currency"
              value={displayValue(
                company?.reportingCurrencyName ??
                  company?.reportingCurrencyCode,
              )}
            />
            <FieldItem
              label="Fiscal Year End"
              value={
                company?.yearEndMonth && company?.yearEndDay
                  ? `${company.yearEndMonth}/${company.yearEndDay}`
                  : 'Not set'
              }
            />
            <FieldItem
              label="Reporting Framework"
              value={getReportingFrameworkLabel(
                company?.reportingFramework ?? null,
              )}
            />
            <FieldItem
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
            <FieldItem
              label="Assigned Firm"
              value={displayValue(company?.assignedFirmName)}
            />
            {canViewFirmSlug ? (
              <FieldItem
                label="Firm Slug"
                value={displayValue(company?.assignedFirmSlug)}
              />
            ) : null}
          </div>
        </SettingsSection>
      </div>
    </div>
  );
}
