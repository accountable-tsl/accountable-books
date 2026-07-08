import type {
  PayrollCompanyDefaults,
  PayrollRunSettings,
} from '@/payroll/domain';
import type { CompanyDefaultsUpdate } from '@/payroll/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';

import { NIGERIAN_STATES } from '../data/states';
import { SimpleSelect } from '../simple-select';

export type BhtSplitKey = 'basic' | 'housing' | 'transport';

export type PercentSplitField = Readonly<{
  id: string;
  label: string;
  value: number;
  key: BhtSplitKey;
}>;

type UpdateCompanyDefaults = (
  updates: CompanyDefaultsUpdate,
) => void | Promise<void>;

type CompanySettings = PayrollCompanyDefaults['settings'];
type StatutoryDeductions = NonNullable<
  PayrollRunSettings['statutoryDeductions']
>;
type PensionConfig = StatutoryDeductions['pension'];
type NhfConfig = StatutoryDeductions['nhf'];
type NhisConfig = StatutoryDeductions['nhis'];

const STATE_OPTIONS = NIGERIAN_STATES.map((state) => ({
  label: state,
  value: state,
}));

const PRORATION_OPTIONS = [
  {
    label: 'Calendar Days',
    value: 'calendar_days',
    description: 'Uses actual days in month',
  },
  {
    label: '30/360',
    value: 'thirty_360',
    description: 'Assumes 30 days per month',
  },
  {
    label: 'Business Days',
    value: 'business_days',
    description: 'Mon-Fri only',
  },
  {
    label: 'Full Month',
    value: 'full_month',
    description: 'Any employment = full month',
  },
] as const;

const PRORATION_SELECT_OPTIONS = PRORATION_OPTIONS.map((option) => ({
  label: `${option.label} - ${option.description}`,
  value: option.value,
}));

function formatRatePercent(
  rate: number | undefined,
  fallbackRate: number,
  fractionDigits: number,
) {
  return ((rate ?? fallbackRate) * 100).toFixed(fractionDigits);
}

function parseRatePercent(value: string) {
  return (Number.parseFloat(value) || 0) / 100;
}

function RateInput({
  id,
  value,
  fallbackRate,
  fractionDigits,
  onChange,
}: Readonly<{
  id: string;
  value: number | undefined;
  fallbackRate: number;
  fractionDigits: number;
  onChange: (value: number) => void;
}>) {
  return (
    <div className="relative">
      <Input
        id={id}
        type="number"
        min={0}
        max={1}
        step="0.001"
        value={formatRatePercent(value, fallbackRate, fractionDigits)}
        onChange={(event) => onChange(parseRatePercent(event.target.value))}
        className="h-8 pr-8 text-sm"
      />
      <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs">
        %
      </span>
    </div>
  );
}

function SectionHeader({
  title,
  description,
}: Readonly<{
  title: string;
  description: string;
}>) {
  return (
    <div>
      <p className="text-sm font-medium">{title}</p>
      <p className="text-muted-foreground text-xs">{description}</p>
    </div>
  );
}

function BasicInformationSection({
  companyName,
  companySettings,
  onUpdateCompanyDefaults,
}: Readonly<{
  companyName: string;
  companySettings: CompanySettings;
  onUpdateCompanyDefaults: UpdateCompanyDefaults;
}>) {
  const defaultState = companySettings?.defaultState ?? 'Lagos';

  return (
    <div className="bg-card space-y-3 rounded border p-3 sm:p-4">
      <SectionHeader
        title="Basic information"
        description="Company name and default state for tax calculations."
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label
            htmlFor="company-policy-company-name"
            className="text-muted-foreground text-xs font-medium"
          >
            Company name
          </label>
          <Input
            id="company-policy-company-name"
            type="text"
            placeholder="Acme Inc."
            value={companyName}
            onChange={(event) =>
              onUpdateCompanyDefaults({ companyName: event.target.value })
            }
            className="h-9 rounded"
          />
        </div>
        <div className="space-y-1.5">
          <span className="text-muted-foreground text-xs font-medium">
            Default state
          </span>
          <SimpleSelect
            value={defaultState}
            onChange={(value) =>
              onUpdateCompanyDefaults({
                settings: {
                  defaultState: value as PayrollRunSettings['defaultState'],
                },
              })
            }
            options={STATE_OPTIONS}
            placeholder="Select state"
            className="h-9 rounded"
          />
        </div>
      </div>
    </div>
  );
}

function BhtBreakdownSection({
  percentSplitFields,
  otherAllowancesPct,
  onPolicySplitChange,
}: Readonly<{
  percentSplitFields: readonly PercentSplitField[];
  otherAllowancesPct: number;
  onPolicySplitChange: (key: BhtSplitKey, nextValue: number) => void;
}>) {
  return (
    <div className="space-y-3 rounded border p-3 sm:p-4">
      <SectionHeader
        title="BHT breakdown"
        description="How basic, housing and transport are split from gross salary."
      />
      <div className="grid gap-2 sm:grid-cols-3">
        {percentSplitFields.map((field) => (
          <div key={field.id} className="space-y-1">
            <div className="flex h-7.5 w-full items-center overflow-hidden rounded border bg-transparent shadow-xs">
              <div className="bg-muted text-muted-foreground flex h-full w-24 shrink-0 items-center border-r px-2 text-xs font-medium sm:w-20 md:w-24 md:uppercase">
                {field.label}
              </div>
              <div className="relative h-full flex-1">
                <Input
                  id={field.id}
                  inputMode="numeric"
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  placeholder="0"
                  className="h-full rounded-none border-0 pr-7 text-right text-sm shadow-none focus-visible:ring-0"
                  onKeyDown={(event) => {
                    if (event.key === '-') event.preventDefault();
                  }}
                  value={field.value}
                  onChange={(event) => {
                    const raw = event.currentTarget.value;
                    onPolicySplitChange(field.key, raw ? Number(raw) : 0);
                  }}
                />
                <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs">
                  %
                </span>
              </div>
            </div>
          </div>
        ))}
        <div className="contents md:col-span-3">
          <div className="flex h-7.5 gap-3 space-y-1 divide-x sm:col-span-3 sm:justify-between lg:col-span-2">
            <div className="bg-muted flex h-7.5 w-full items-center overflow-hidden rounded border shadow-xs">
              <div className="text-muted-foreground flex h-full shrink-0 items-center px-2 text-xs font-medium md:uppercase">
                Other Allowances
              </div>
              <div className="relative h-full flex-1">
                <Input
                  inputMode="numeric"
                  type="number"
                  value={otherAllowancesPct}
                  readOnly
                  tabIndex={-1}
                  aria-label="Other allowances percent (calculated)"
                  className="h-full rounded-none border-0 pr-7 text-right text-sm shadow-none focus-visible:ring-0"
                />
                <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs">
                  %
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PensionSettings({
  pensionConfig,
  onUpdateCompanyDefaults,
}: Readonly<{
  pensionConfig: PensionConfig | undefined;
  onUpdateCompanyDefaults: UpdateCompanyDefaults;
}>) {
  const employeeRate = pensionConfig?.employeeRate ?? 0.08;
  const employerRate = pensionConfig?.employerRate ?? 0.1;

  return (
    <div className="space-y-2 rounded border p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Checkbox
            id="company-policy-pension-enabled"
            checked={pensionConfig?.enabled ?? true}
            onCheckedChange={(checked) =>
              onUpdateCompanyDefaults({
                settings: {
                  statutoryDeductions: {
                    pension: {
                      enabled: checked === true,
                      employeeRate,
                      employerRate,
                    },
                  },
                },
              })
            }
          />
          <label
            htmlFor="company-policy-pension-enabled"
            className="text-sm font-medium"
          >
            Pension
          </label>
        </div>
      </div>
      {pensionConfig?.enabled !== false && (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <label
              htmlFor="company-policy-pension-employee-rate"
              className="text-muted-foreground text-xs"
            >
              Employee rate
            </label>
            <RateInput
              id="company-policy-pension-employee-rate"
              value={pensionConfig?.employeeRate}
              fallbackRate={0.08}
              fractionDigits={1}
              onChange={(value) =>
                onUpdateCompanyDefaults({
                  settings: {
                    statutoryDeductions: {
                      pension: {
                        enabled: true,
                        employeeRate: value,
                        employerRate,
                      },
                    },
                  },
                })
              }
            />
          </div>
          <div className="space-y-1">
            <label
              htmlFor="company-policy-pension-employer-rate"
              className="text-muted-foreground text-xs"
            >
              Employer rate
            </label>
            <RateInput
              id="company-policy-pension-employer-rate"
              value={pensionConfig?.employerRate}
              fallbackRate={0.1}
              fractionDigits={1}
              onChange={(value) =>
                onUpdateCompanyDefaults({
                  settings: {
                    statutoryDeductions: {
                      pension: {
                        enabled: true,
                        employeeRate,
                        employerRate: value,
                      },
                    },
                  },
                })
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}

function NhfSettings({
  nhfConfig,
  onUpdateCompanyDefaults,
}: Readonly<{
  nhfConfig: NhfConfig | undefined;
  onUpdateCompanyDefaults: UpdateCompanyDefaults;
}>) {
  const employeeRate = nhfConfig?.employeeRate ?? 0.025;

  return (
    <div className="space-y-2 rounded border p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Checkbox
            id="company-policy-nhf-enabled"
            checked={nhfConfig?.enabled ?? false}
            onCheckedChange={(checked) =>
              onUpdateCompanyDefaults({
                settings: {
                  statutoryDeductions: {
                    nhf: {
                      enabled: checked === true,
                      employeeRate,
                    },
                  },
                },
              })
            }
          />
          <label
            htmlFor="company-policy-nhf-enabled"
            className="text-sm font-medium"
          >
            NHF
          </label>
        </div>
      </div>
      {nhfConfig?.enabled !== false && (
        <div className="space-y-1">
          <label
            htmlFor="company-policy-nhf-employee-rate"
            className="text-muted-foreground text-xs"
          >
            Employee rate (of Basic)
          </label>
          <RateInput
            id="company-policy-nhf-employee-rate"
            value={nhfConfig?.employeeRate}
            fallbackRate={0.025}
            fractionDigits={2}
            onChange={(value) =>
              onUpdateCompanyDefaults({
                settings: {
                  statutoryDeductions: {
                    nhf: {
                      enabled: true,
                      employeeRate: value,
                    },
                  },
                },
              })
            }
          />
        </div>
      )}
    </div>
  );
}

function NhisSettings({
  nhisConfig,
  onUpdateCompanyDefaults,
}: Readonly<{
  nhisConfig: NhisConfig | undefined;
  onUpdateCompanyDefaults: UpdateCompanyDefaults;
}>) {
  const employeeRate = nhisConfig?.employeeRate ?? 0.05;
  const employerRate = nhisConfig?.employerRate ?? 0.1;

  return (
    <div className="space-y-2 rounded border p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Checkbox
            id="company-policy-nhis-enabled"
            checked={nhisConfig?.enabled ?? false}
            onCheckedChange={(checked) =>
              onUpdateCompanyDefaults({
                settings: {
                  statutoryDeductions: {
                    nhis: {
                      enabled: checked === true,
                      employeeRate,
                      employerRate,
                    },
                  },
                },
              })
            }
          />
          <label
            htmlFor="company-policy-nhis-enabled"
            className="text-sm font-medium"
          >
            NHIS
          </label>
        </div>
      </div>
      {nhisConfig?.enabled !== false && (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <label
              htmlFor="company-policy-nhis-employee-rate"
              className="text-muted-foreground text-xs"
            >
              Employee rate (of Basic)
            </label>
            <RateInput
              id="company-policy-nhis-employee-rate"
              value={nhisConfig?.employeeRate}
              fallbackRate={0.05}
              fractionDigits={1}
              onChange={(value) =>
                onUpdateCompanyDefaults({
                  settings: {
                    statutoryDeductions: {
                      nhis: {
                        enabled: true,
                        employeeRate: value,
                        employerRate,
                      },
                    },
                  },
                })
              }
            />
          </div>
          <div className="space-y-1">
            <label
              htmlFor="company-policy-nhis-employer-rate"
              className="text-muted-foreground text-xs"
            >
              Employer rate (of Basic)
            </label>
            <RateInput
              id="company-policy-nhis-employer-rate"
              value={nhisConfig?.employerRate}
              fallbackRate={0.1}
              fractionDigits={1}
              onChange={(value) =>
                onUpdateCompanyDefaults({
                  settings: {
                    statutoryDeductions: {
                      nhis: {
                        enabled: true,
                        employeeRate,
                        employerRate: value,
                      },
                    },
                  },
                })
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}

function StatutoryDeductionsSection({
  companySettings,
  onUpdateCompanyDefaults,
}: Readonly<{
  companySettings: CompanySettings;
  onUpdateCompanyDefaults: UpdateCompanyDefaults;
}>) {
  const pensionConfig = companySettings?.statutoryDeductions?.pension;
  const nhfConfig = companySettings?.statutoryDeductions?.nhf;
  const nhisConfig = companySettings?.statutoryDeductions?.nhis;

  return (
    <div className="space-y-3 rounded border p-3 sm:p-4">
      <SectionHeader
        title="Statutory deductions"
        description="Configure which deductions apply and their rates. You can still override settings per employee later."
      />
      <div className="space-y-4">
        <PensionSettings
          pensionConfig={pensionConfig}
          onUpdateCompanyDefaults={onUpdateCompanyDefaults}
        />
        <NhfSettings
          nhfConfig={nhfConfig}
          onUpdateCompanyDefaults={onUpdateCompanyDefaults}
        />
        <NhisSettings
          nhisConfig={nhisConfig}
          onUpdateCompanyDefaults={onUpdateCompanyDefaults}
        />
      </div>
    </div>
  );
}

function ProrationTaxSettingsSection({
  companySettings,
  onUpdateCompanyDefaults,
}: Readonly<{
  companySettings: CompanySettings;
  onUpdateCompanyDefaults: UpdateCompanyDefaults;
}>) {
  const prorationMethod =
    companySettings?.employmentProrationMethod ?? 'calendar_days';
  const enableRentRelief = companySettings?.enableRentRelief ?? true;
  const enableYtd = companySettings?.enableYtd ?? true;

  return (
    <div className="space-y-3 rounded border p-3 sm:p-4">
      <SectionHeader
        title="Proration & tax settings"
        description="How to calculate partial months and tax relief options."
      />
      <div className="space-y-3">
        <div className="space-y-1.5">
          <span className="text-muted-foreground text-xs font-medium">
            Employment proration method
          </span>
          <SimpleSelect
            value={prorationMethod}
            onChange={(value) =>
              onUpdateCompanyDefaults({
                settings: {
                  employmentProrationMethod:
                    value as PayrollRunSettings['employmentProrationMethod'],
                },
              })
            }
            options={PRORATION_SELECT_OPTIONS}
            placeholder="Select method"
            className="h-9 rounded"
          />
        </div>
        <div className="flex items-center justify-between rounded border p-3">
          <div className="space-y-0.5">
            <label
              htmlFor="company-policy-rent-relief"
              className="text-sm font-medium"
            >
              Enable rent relief
            </label>
            <p className="text-muted-foreground text-xs">
              20% of annual rent, capped at ₦500k
            </p>
          </div>
          <Checkbox
            id="company-policy-rent-relief"
            checked={enableRentRelief}
            onCheckedChange={(checked) =>
              onUpdateCompanyDefaults({
                settings: {
                  enableRentRelief: checked === true,
                },
              })
            }
          />
        </div>
        <div className="flex items-center justify-between rounded border p-3">
          <div className="space-y-0.5">
            <label htmlFor="company-policy-ytd" className="text-sm font-medium">
              Enable YTD computation
            </label>
            <p className="text-muted-foreground text-xs">
              Cumulative PAYE from all finalized runs in tax year
            </p>
          </div>
          <Checkbox
            id="company-policy-ytd"
            checked={enableYtd}
            onCheckedChange={(checked) =>
              onUpdateCompanyDefaults({
                settings: {
                  enableYtd: checked === true,
                },
              })
            }
          />
        </div>
      </div>
    </div>
  );
}

export function CompanySettingsTab({
  companyName,
  companySettings,
  onUpdateCompanyDefaults,
  percentSplitFields,
  otherAllowancesPct,
  onPolicySplitChange,
}: Readonly<{
  companyName: string;
  companySettings: CompanySettings;
  onUpdateCompanyDefaults: UpdateCompanyDefaults;
  percentSplitFields: readonly PercentSplitField[];
  otherAllowancesPct: number;
  onPolicySplitChange: (key: BhtSplitKey, nextValue: number) => void;
}>) {
  return (
    <div className="scrollbar-thin-2px flex h-full flex-col overflow-y-auto px-3 py-3 sm:px-5 sm:py-5">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold sm:text-lg">
            Company settings
          </h2>
          <p className="text-muted-foreground text-xs sm:text-sm">
            These defaults apply when you create employees and payroll runs.
          </p>
        </div>
        <BasicInformationSection
          companyName={companyName}
          companySettings={companySettings}
          onUpdateCompanyDefaults={onUpdateCompanyDefaults}
        />
        <BhtBreakdownSection
          percentSplitFields={percentSplitFields}
          otherAllowancesPct={otherAllowancesPct}
          onPolicySplitChange={onPolicySplitChange}
        />
        <StatutoryDeductionsSection
          companySettings={companySettings}
          onUpdateCompanyDefaults={onUpdateCompanyDefaults}
        />
        <ProrationTaxSettingsSection
          companySettings={companySettings}
          onUpdateCompanyDefaults={onUpdateCompanyDefaults}
        />
      </div>
    </div>
  );
}
