import { FormField } from '@/components/FormField';
import { SimpleSelect } from '@/components/SimpleSelect';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  ACCOUNTING_BASIS,
  COMPANY_REVENUE_RANGE,
  COMPANY_SIZE,
} from '@/modules/company/companies';
import { Controller, useFormContext, useWatch } from 'react-hook-form';

import type { FirmClientInviteWizardSteps123 } from '../model/types';

const REPORTING_FRAMEWORK_OPTIONS = [
  { value: 'ifrs', label: 'IFRS' },
  { value: 'us_gaap', label: 'US GAAP' },
] as const;

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: new Date(2024, i, 1).toLocaleString('default', { month: 'long' }),
}));

const DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => ({
  value: String(i + 1),
  label: String(i + 1),
}));

const OPTIONAL_SENTINEL = '__none__';

export function InviteWizardAccountingStep() {
  const {
    register,
    control,
    formState: { errors },
  } = useFormContext<FirmClientInviteWizardSteps123>();

  const companyType = useWatch({ control, name: 'company.type' });

  const yearEndError =
    errors.company?.yearEndDay?.message ||
    errors.company?.yearEndMonth?.message;

  return (
    <div className="text-foreground space-y-4">
      <FormField
        id="company-year-end"
        label="Fiscal year end"
        required
        error={yearEndError}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Controller
            name="company.yearEndMonth"
            control={control}
            render={({ field }) => (
              <SimpleSelect
                value={String(field.value ?? 12)}
                onChange={(v) => field.onChange(Number.parseInt(v, 10))}
                options={MONTH_OPTIONS}
                placeholder="Month"
                className="w-full"
              />
            )}
          />
          <Controller
            name="company.yearEndDay"
            control={control}
            render={({ field }) => (
              <SimpleSelect
                value={String(field.value ?? 31)}
                onChange={(v) => field.onChange(Number.parseInt(v, 10))}
                options={DAY_OPTIONS}
                placeholder="Day"
                className="w-full"
              />
            )}
          />
        </div>
      </FormField>

      <div
        className={
          companyType === 'business' ? 'grid gap-4 md:grid-cols-2' : 'space-y-4'
        }
      >
        <FormField
          id="company-accounting-basis"
          label="Accounting basis"
          required
          error={errors.company?.accountingBasis?.message}
        >
          <Controller
            name="company.accountingBasis"
            control={control}
            render={({ field }) => (
              <SimpleSelect
                value={field.value}
                onChange={field.onChange}
                options={[...ACCOUNTING_BASIS]}
                className="w-full"
              />
            )}
          />
        </FormField>

        {companyType === 'business' ? (
          <FormField
            id="company-reporting-framework"
            label="Reporting framework"
            required
            error={errors.company?.reportingFramework?.message}
          >
            <Controller
              name="company.reportingFramework"
              control={control}
              render={({ field }) => (
                <SimpleSelect
                  value={field.value ?? 'ifrs'}
                  onChange={field.onChange}
                  options={[...REPORTING_FRAMEWORK_OPTIONS]}
                  className="w-full"
                />
              )}
            />
          </FormField>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <FormField
          id="company-website"
          label="Website"
          error={errors.company?.website?.message}
        >
          <Input
            id="company-website"
            type="url"
            placeholder="https://"
            {...register('company.website')}
            aria-invalid={!!errors.company?.website}
          />
        </FormField>
        <FormField
          id="company-team-size"
          label="Company size"
          error={errors.company?.teamSize?.message}
        >
          <Controller
            name="company.teamSize"
            control={control}
            render={({ field }) => (
              <SimpleSelect
                value={field.value ? field.value : OPTIONAL_SENTINEL}
                onChange={(v) =>
                  field.onChange(v === OPTIONAL_SENTINEL ? '' : v)
                }
                options={[
                  { value: OPTIONAL_SENTINEL, label: '—' },
                  ...COMPANY_SIZE,
                ]}
                placeholder="Employees"
                className="w-full"
              />
            )}
          />
        </FormField>
      </div>

      <FormField
        id="company-revenue"
        label="Revenue band"
        error={errors.company?.revenue?.message}
      >
        <Controller
          name="company.revenue"
          control={control}
          render={({ field }) => (
            <SimpleSelect
              value={field.value ? field.value : OPTIONAL_SENTINEL}
              onChange={(v) => field.onChange(v === OPTIONAL_SENTINEL ? '' : v)}
              options={[
                { value: OPTIONAL_SENTINEL, label: '—' },
                ...COMPANY_REVENUE_RANGE,
              ]}
              placeholder="Select range"
              className="w-full"
            />
          )}
        />
      </FormField>

      <FormField
        id="company-address"
        label="Address"
        error={errors.company?.address?.message}
      >
        <Input
          id="company-address"
          {...register('company.address')}
          aria-invalid={!!errors.company?.address}
        />
      </FormField>

      <FormField
        id="company-description"
        label="Description"
        error={errors.company?.description?.message}
      >
        <Textarea
          id="company-description"
          rows={3}
          className="resize-y"
          {...register('company.description')}
          aria-invalid={!!errors.company?.description}
        />
      </FormField>
    </div>
  );
}
