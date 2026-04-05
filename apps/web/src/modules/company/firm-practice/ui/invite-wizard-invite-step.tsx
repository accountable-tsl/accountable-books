import { AutocompleteDropdown } from '@/components/AutocompleteDropdown';
import { FormField } from '@/components/FormField';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useIsMobile } from '@/shared/hooks/use-media-query';
import { Controller, useFormContext } from 'react-hook-form';

import type {
  FirmClientInviteWizardSteps123,
  FirmInviteStaffOption,
} from '../model/types';

export function InviteWizardInviteStep({
  assigneeOptions,
}: {
  assigneeOptions: FirmInviteStaffOption[];
}) {
  const isMobile = useIsMobile();
  const {
    register,
    control,
    formState: { errors },
  } = useFormContext<FirmClientInviteWizardSteps123>();

  const assigneeItems = assigneeOptions.map((o) => ({
    value: o.userId,
    label: `${o.initials} · ${o.name}`,
  }));

  const contactHelp = 'Who is the primary contact for this client?';
  const assigneeHelp =
    'Who is the person at your firm responsible for this client? Defaults to you.';
  const emailHelp = 'The email address of the primary contact for this client.';

  return (
    <div className="text-foreground space-y-4">
      <input type="hidden" {...register('invite.invitedCompanyRole')} />

      <FormField
        id="invite-email"
        label="Email"
        required
        error={errors.invite?.email?.message}
        helpTooltip={isMobile ? undefined : emailHelp}
      >
        <Input
          id="invite-email"
          type="email"
          autoComplete="email"
          placeholder="name@company.com"
          aria-invalid={!!errors.invite?.email}
          {...register('invite.email')}
        />
      </FormField>

      <FormField
        id="invite-primary-contact"
        label="Contact name"
        error={errors.invite?.primaryContactName?.message}
        helpTooltip={isMobile ? undefined : contactHelp}
      >
        <Input
          id="invite-primary-contact"
          autoComplete="name"
          placeholder="John Doe"
          aria-invalid={!!errors.invite?.primaryContactName}
          {...register('invite.primaryContactName')}
        />
      </FormField>

      <FormField
        id="assignee-user"
        label="Assigned to"
        error={errors.assigneeUserId?.message}
        helpTooltip={isMobile ? undefined : assigneeHelp}
      >
        {assigneeItems.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No team members available. Assignee will default when you send the
            invite.
          </p>
        ) : (
          <Controller
            name="assigneeUserId"
            control={control}
            render={({ field }) => (
              <AutocompleteDropdown
                id="assignee-user"
                items={assigneeItems}
                value={field.value ?? ''}
                onValueChange={(v) => field.onChange(v === '' ? undefined : v)}
                placeholder="Firm teammate"
                className="w-full"
                aria-invalid={!!errors.assigneeUserId}
              />
            )}
          />
        )}
      </FormField>

      <FormField
        id="invite-note"
        label="Note"
        error={errors.invite?.note?.message}
      >
        <Textarea
          id="invite-note"
          rows={3}
          className="resize-y"
          placeholder="Optional message for the invitee"
          aria-invalid={!!errors.invite?.note}
          {...register('invite.note')}
        />
      </FormField>
    </div>
  );
}
