import type { DefaultValues, Resolver } from 'react-hook-form';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StepProgress } from '@/components/StepProgress/StepProgress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { isCompanyTimezoneValidForCountry } from '@/modules/company/companies';
import { useCountries } from '@/shared/hooks/useCountries';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { AlertCircle } from 'lucide-react';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { useInviteFirmClient } from '../model/hooks';
import {
  firmClientInviteAssigneeInviteSchema,
  firmClientInviteCompanyStep2Schema,
  firmClientInviteWizardSteps123Schema,
} from '../model/types';
import { InviteWizardAccountingStep } from './invite-wizard-accounting-step';
import { InviteWizardCompanyStep } from './invite-wizard-company-step';
import { InviteWizardInviteStep } from './invite-wizard-invite-step';

import type { FirmClientInvitePayload } from '../api';
import type {
  FirmClientInviteAssigneeInvite,
  FirmClientInviteWizardSteps123,
  FirmInviteStaffOption,
} from '../model/types';

const STEP_LABELS = ['Invite', 'Company', 'Accounting & details'] as const;
const TOTAL_STEPS = STEP_LABELS.length;

const STEP_1_FIELDS = [
  'assigneeUserId',
  'invite.email',
  'invite.primaryContactName',
  'invite.invitedCompanyRole',
  'invite.note',
] as const;

const STEP_2_FIELDS = [
  'company.type',
  'company.legalName',
  'company.countryId',
  'company.defaultTimezone',
  'company.reportingCurrencyId',
  'company.industry',
  'company.registrationNumber',
  'company.taxId',
] as const;

export type InviteClientWizardProps = {
  open: boolean;
  layout: 'dialog' | 'sheet';
  onRequestClose: () => void;
  assigneeOptions: FirmInviteStaffOption[];
  defaultAssigneeUserId?: string;
  /** Firm book id from roster/shell; required to send invite */
  firmCompanyId?: string;
};

const EMPTY_INVITE_DEFAULTS: FirmClientInviteAssigneeInvite['invite'] = {
  email: '',
  primaryContactName: '',
  invitedCompanyRole: 'client_owner',
  note: '',
};

const DEFAULT_COMPANY: DefaultValues<FirmClientInviteWizardSteps123>['company'] =
  {
    type: 'business',
    legalName: '',
    countryId: '',
    defaultTimezone: undefined,
    reportingCurrencyId: '',
    yearEndMonth: 12,
    yearEndDay: 31,
    accountingBasis: 'modified_accrual_basis',
    reportingFramework: 'ifrs',
    industry: '',
  };

function getInviteSubmitErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim())
    return error.message.trim();
  return 'We could not send the invite right now. Please try again.';
}

export function InviteClientWizard({
  open,
  layout,
  onRequestClose,
  assigneeOptions,
  defaultAssigneeUserId,
  firmCompanyId,
}: InviteClientWizardProps) {
  const [step, setStep] = useState(1);
  const [successSummary, setSuccessSummary] = useState<{
    email: string;
    companyName: string;
  } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const inviteMutation = useInviteFirmClient();

  const defaultValues = useMemo(
    () =>
      ({
        assigneeUserId: defaultAssigneeUserId,
        invite: { ...EMPTY_INVITE_DEFAULTS },
        company: { ...DEFAULT_COMPANY },
      }) satisfies DefaultValues<FirmClientInviteWizardSteps123>,
    [defaultAssigneeUserId],
  );

  const methods = useForm<FirmClientInviteWizardSteps123>({
    resolver: standardSchemaResolver(
      firmClientInviteWizardSteps123Schema,
    ) as Resolver<FirmClientInviteWizardSteps123>,
    defaultValues,
    mode: 'onTouched',
  });

  const { reset, trigger, handleSubmit, formState } = methods;
  const { data: countriesRes } = useCountries();
  const assigneeUserId = useWatch({
    control: methods.control,
    name: 'assigneeUserId',
  });
  const invite = useWatch({
    control: methods.control,
    name: 'invite',
  });
  const company = useWatch({
    control: methods.control,
    name: 'company',
  });

  const selectedCountryCode = useMemo(
    () =>
      countriesRes?.data?.find((country) => country.id === company?.countryId)
        ?.code,
    [company?.countryId, countriesRes?.data],
  );

  useEffect(() => {
    if (!open) return;
    setSubmitError(null);
    setSuccessSummary(null);
    setStep(1);
    reset(defaultValues);
  }, [open, reset, defaultValues]);

  const isCurrentStepValid = useMemo(() => {
    if (step === 1) {
      return firmClientInviteAssigneeInviteSchema.safeParse({
        assigneeUserId,
        invite: invite ?? EMPTY_INVITE_DEFAULTS,
      }).success;
    }

    if (step === 2) {
      const normalizedCompany = company ?? DEFAULT_COMPANY;
      const baseValid =
        firmClientInviteCompanyStep2Schema.safeParse(normalizedCompany).success;
      if (!baseValid) return false;

      return isCompanyTimezoneValidForCountry({
        timezone: normalizedCompany.defaultTimezone,
        countryCode: selectedCountryCode,
      });
    }

    return true;
  }, [assigneeUserId, company, invite, selectedCountryCode, step]);

  const isLast = step === TOTAL_STEPS;
  const isSuccess = successSummary !== null;
  const footerClass =
    layout === 'sheet'
      ? 'border-border bg-background shrink-0 border-t pt-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]'
      : 'border-border shrink-0 border-t pt-4';

  const goNext = async () => {
    const fieldsToValidate =
      step === 1 ? STEP_1_FIELDS : step === 2 ? STEP_2_FIELDS : undefined;

    if (fieldsToValidate) {
      const valid = await trigger(fieldsToValidate);
      if (!valid) return;
    }

    setStep((s) => Math.min(TOTAL_STEPS, s + 1));
  };

  const scrollStep =
    step === 1 ? 'invite' : step === 2 ? 'company' : 'accounting';

  const startNewInvite = useCallback(() => {
    setSubmitError(null);
    setSuccessSummary(null);
    setStep(1);
    reset(defaultValues);
  }, [defaultValues, reset]);

  const onSendInvite = useCallback(
    async (values: FirmClientInviteWizardSteps123) => {
      if (!firmCompanyId) {
        const message = 'Firm context is not ready. Try again in a moment.';
        setSubmitError(message);
        toast.error(message);
        return;
      }

      setSubmitError(null);

      const input: FirmClientInvitePayload = {
        invite: values.invite,
        company: values.company,
      };
      if (values.assigneeUserId) {
        input.assigneeUserId = values.assigneeUserId;
      }

      try {
        await inviteMutation.mutateAsync({ firmCompanyId, input });
        setSubmitError(null);
        toast.success('Invite sent');
        setSuccessSummary({
          email: values.invite.email,
          companyName: values.company.legalName,
        });
      } catch (error) {
        setSubmitError(getInviteSubmitErrorMessage(error));
      }
    },
    [firmCompanyId, inviteMutation],
  );

  const canSend = Boolean(firmCompanyId) && !inviteMutation.isPending;

  return (
    <FormProvider {...methods}>
      <div
        className={
          layout === 'sheet'
            ? 'flex min-h-0 flex-1 flex-col gap-3'
            : 'flex min-h-0 flex-col gap-4'
        }
      >
        {!isSuccess ? (
          <div className="shrink-0">
            <StepProgress
              currentStep={step}
              totalSteps={TOTAL_STEPS}
              steps={[...STEP_LABELS]}
            />
          </div>
        ) : null}

        <div
          className={
            layout === 'sheet'
              ? 'text-muted-foreground min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-md p-1 text-sm'
              : 'text-muted-foreground min-h-40 flex-1 overflow-y-auto rounded-md p-1 text-sm'
          }
          data-invite-wizard-step={step}
          data-step={scrollStep}
        >
          {isSuccess ? (
            <div className="flex h-full min-h-56 flex-col justify-center rounded-md border border-dashed px-4 py-6 text-center">
              <p className="text-foreground text-lg font-semibold">
                Invite sent
              </p>
              <p className="mt-2 text-sm">
                {successSummary.companyName} has been invited at{' '}
                <span className="text-foreground font-medium">
                  {successSummary.email}
                </span>
                .
              </p>
              <p className="mt-1 text-sm">
                You can close this window or send another invite now.
              </p>
            </div>
          ) : (
            <>
              {step === 1 && (
                <InviteWizardInviteStep assigneeOptions={assigneeOptions} />
              )}
              {step === 2 && <InviteWizardCompanyStep />}
              {step === 3 && <InviteWizardAccountingStep />}
            </>
          )}
        </div>

        {!isSuccess && submitError ? (
          <Alert variant="destructive" className="shrink-0">
            <AlertCircle />
            <AlertTitle>Invite failed</AlertTitle>
            <AlertDescription>
              <p>{submitError}</p>
              <p>
                Review the details if needed, then try sending the invite again.
              </p>
            </AlertDescription>
          </Alert>
        ) : null}

        <div
          className={cn(
            'flex gap-2',
            layout === 'sheet'
              ? cn('flex-col-reverse [&_button]:w-full', footerClass)
              : cn(
                  'flex-col-reverse sm:flex-row sm:justify-between [&_button]:w-full sm:[&_button]:w-auto',
                  footerClass,
                ),
          )}
        >
          {isSuccess ? (
            <Button
              type="button"
              variant="outline"
              onClick={startNewInvite}
              className="cursor-pointer"
            >
              Invite another
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={
                step === 1 ? onRequestClose : () => setStep((s) => s - 1)
              }
              className="cursor-pointer"
            >
              {step === 1 ? 'Cancel' : 'Back'}
            </Button>
          )}
          <div
            className={cn(
              'flex gap-2',
              layout === 'sheet'
                ? 'flex-col'
                : 'w-full sm:w-auto sm:justify-end',
            )}
          >
            {isSuccess ? (
              <Button
                type="button"
                className={cn(
                  layout === 'sheet' ? '' : 'w-full sm:w-auto',
                  'cursor-pointer',
                )}
                onClick={onRequestClose}
              >
                Done
              </Button>
            ) : !isLast ? (
              <Button
                type="button"
                className={cn(
                  layout === 'sheet' ? '' : 'w-full sm:w-auto',
                  'cursor-pointer',
                )}
                disabled={formState.isSubmitting || !isCurrentStepValid}
                onClick={() => void goNext()}
              >
                Next
              </Button>
            ) : (
              <Button
                type="button"
                className={cn(
                  layout === 'sheet' ? '' : 'w-full sm:w-auto',
                  'cursor-pointer',
                )}
                disabled={!canSend}
                onClick={() => void handleSubmit(onSendInvite)()}
              >
                {inviteMutation.isPending ? 'Sending…' : 'Send invite'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </FormProvider>
  );
}
