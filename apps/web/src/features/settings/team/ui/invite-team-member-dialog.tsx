import type {
  InviteTeamMemberRequest,
  TeamMemberRole,
} from '@/features/settings/team';
import type { Control, FormState, UseFormRegister } from 'react-hook-form';
import { useCallback, useEffect, useMemo } from 'react';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { useMediaQuery } from '@/shared/hooks/use-media-query';
import { inviteTeamMemberRequestSchema } from '@accountable-books/contracts/schema';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { Controller, useForm, useWatch } from 'react-hook-form';

import { pickDefaultInviteRole } from '../lib/workspace-invite-roles';

const ROLE_OPTIONS: { value: TeamMemberRole; label: string }[] = [
  { value: 'owner', label: 'Owner' },
  { value: 'admin', label: 'Admin' },
  { value: 'accountant', label: 'Accountant' },
  { value: 'bookkeeper', label: 'Bookkeeper' },
  { value: 'viewer', label: 'Viewer' },
];

const ROLE_DESCRIPTIONS: Record<TeamMemberRole, string> = {
  owner: 'Full access to all settings, billing, and team management.',
  admin: 'Can manage settings and most features, but cannot modify billing.',
  accountant:
    'Can view and export financial data, reports, and reconcile accounts.',
  bookkeeper:
    'Can categorize transactions and upload receipts, but no access to reports.',
  viewer: 'Read-only access to view data. Cannot make any changes.',
};

const INVITE_DESCRIPTION = "We'll email them a link to join this workspace.";

export type InviteTeamMemberDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Roles the signed-in user may assign on this invite (client-side; API enforces). */
  assignableRoles: TeamMemberRole[];
  /**
   * When false, Send invite stays disabled (Phase 4 chunk 2 wires the mutation).
   * Validation still runs so the form can be exercised.
   */
  submitEnabled?: boolean;
  /** Called after successful validation when `submitEnabled` is true. */
  onInviteSubmit?: (data: InviteTeamMemberRequest) => void | Promise<void>;
};

type InviteTeamMemberFieldsProps = {
  control: Control<InviteTeamMemberRequest>;
  register: UseFormRegister<InviteTeamMemberRequest>;
  formState: FormState<InviteTeamMemberRequest>;
  roleSelectOptions: { value: TeamMemberRole; label: string }[];
};

function InviteTeamMemberFields({
  control,
  register,
  formState,
  roleSelectOptions,
}: InviteTeamMemberFieldsProps) {
  const selectedRole = useWatch({ control, name: 'role' });
  const selectedRoleInMenu = roleSelectOptions.some(
    (o) => o.value === selectedRole,
  );
  const roleDescriptionLine =
    selectedRoleInMenu && selectedRole && selectedRole in ROLE_DESCRIPTIONS
      ? ROLE_DESCRIPTIONS[selectedRole]
      : '';

  const emailError = formState.errors.email?.message;
  const roleError = formState.errors.role?.message;
  const noteError = formState.errors.note?.message;

  return (
    <>
      <FormField id="invite-email" label="Email" error={emailError}>
        <Input
          type="email"
          autoFocus
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          placeholder="name@company.com"
          className="h-9"
          aria-invalid={!!emailError}
          aria-describedby={emailError ? 'invite-email-error' : undefined}
          {...register('email')}
          id="invite-email"
        />
      </FormField>

      <FormField id="invite-role" label="Role" error={roleError}>
        <div>
          <Controller
            control={control}
            name="role"
            render={({ field }) => {
              const valueInMenu = roleSelectOptions.some(
                (o) => o.value === field.value,
              );
              return (
                <Select
                  value={valueInMenu ? field.value : undefined}
                  onValueChange={field.onChange}
                  disabled={
                    formState.isSubmitting || roleSelectOptions.length === 0
                  }
                >
                  <SelectTrigger
                    className="h-9 w-full"
                    id="invite-role"
                    aria-invalid={!!roleError}
                    aria-describedby={
                      [
                        roleError ? 'invite-role-error' : '',
                        roleDescriptionLine ? 'invite-role-description' : '',
                      ]
                        .filter(Boolean)
                        .join(' ') || undefined
                    }
                  >
                    <SelectValue
                      placeholder={
                        roleSelectOptions.length === 0
                          ? 'No roles available'
                          : 'Select a role'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {roleSelectOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              );
            }}
          />
          {roleDescriptionLine ? (
            <p
              id="invite-role-description"
              className="text-muted-foreground pl-0.5 text-xs"
            >
              {roleDescriptionLine}
            </p>
          ) : null}
        </div>
      </FormField>

      <FormField id="invite-note" label="Note (optional)" error={noteError}>
        <Textarea
          rows={3}
          maxLength={500}
          placeholder="Context for the invitee (optional)"
          className="min-h-18 resize-none text-sm"
          aria-invalid={!!noteError}
          aria-describedby={noteError ? 'invite-note-error' : undefined}
          {...register('note')}
          id="invite-note"
        />
      </FormField>
    </>
  );
}

export function InviteTeamMemberDialog({
  open,
  onOpenChange,
  assignableRoles,
  submitEnabled = false,
  onInviteSubmit,
}: InviteTeamMemberDialogProps) {
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  const roleSelectOptions = useMemo(
    () => ROLE_OPTIONS.filter((o) => assignableRoles.includes(o.value)),
    [assignableRoles],
  );

  const form = useForm<InviteTeamMemberRequest>({
    resolver: standardSchemaResolver(inviteTeamMemberRequestSchema),
    mode: 'onChange',
    reValidateMode: 'onChange',
    defaultValues: {
      email: '',
      role: pickDefaultInviteRole(assignableRoles),
      note: '',
    },
  });

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState,
    setValue,
    getValues,
  } = form;

  const resetToDefaults = useCallback(() => {
    reset({
      email: '',
      note: '',
      role: pickDefaultInviteRole(assignableRoles),
    });
  }, [assignableRoles, reset]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        resetToDefaults();
      }
      onOpenChange(next);
    },
    [onOpenChange, resetToDefaults],
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    resetToDefaults();
  }, [open, resetToDefaults]);

  useEffect(() => {
    if (!open || roleSelectOptions.length === 0) return;
    // Keep role valid when permission-driven options change while preserving email/note edits.
    const current = getValues('role');
    if (!roleSelectOptions.some((o) => o.value === current)) {
      setValue('role', pickDefaultInviteRole(assignableRoles), {
        shouldValidate: true,
      });
    }
  }, [open, roleSelectOptions, assignableRoles, getValues, setValue]);

  const submitDisabled =
    assignableRoles.length === 0 ||
    !submitEnabled ||
    !formState.isValid ||
    formState.isSubmitting ||
    (submitEnabled && !onInviteSubmit);

  const submitTitle = !submitEnabled
    ? 'Invite sending will be enabled after the next implementation step.'
    : submitEnabled && !onInviteSubmit
      ? 'Invite handler is not connected yet.'
      : undefined;

  const onSubmit = handleSubmit(async (values) => {
    if (!submitEnabled || !onInviteSubmit) {
      return;
    }
    try {
      await onInviteSubmit(values);
    } catch {
      // Mutation hooks already surface user-facing errors.
    }
  });

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-y-auto p-0 sm:max-w-md">
          <DialogHeader className="shrink-0 px-6 pt-6 pb-2">
            <DialogTitle>Invite team member</DialogTitle>
            <DialogDescription>{INVITE_DESCRIPTION}</DialogDescription>
          </DialogHeader>

          <form className="flex flex-col" onSubmit={(e) => void onSubmit(e)}>
            <div className="space-y-4 px-6 py-3 text-sm">
              <InviteTeamMemberFields
                control={control}
                register={register}
                formState={formState}
                roleSelectOptions={roleSelectOptions}
              />
            </div>

            <DialogFooter className="border-border bg-background shrink-0 gap-2 border-t px-6 pt-4 pb-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={formState.isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitDisabled}
                title={submitTitle}
              >
                {formState.isSubmitting ? 'Sending...' : 'Send invite'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        className="flex max-h-[90dvh] flex-col gap-0 overflow-x-hidden overflow-y-auto rounded-t-2xl border-t p-0 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-lg"
      >
        <div className="flex shrink-0 justify-center pt-2 pb-1" aria-hidden>
          <div className="bg-muted-foreground/25 h-1 w-10 rounded-full" />
        </div>

        <SheetHeader className="border-border shrink-0 space-y-1 border-b px-6 pr-12 pb-3 text-left">
          <SheetTitle className="text-lg">Invite team member</SheetTitle>
          <SheetDescription className="text-pretty">
            {INVITE_DESCRIPTION}
          </SheetDescription>
        </SheetHeader>

        <form
          className="flex flex-col gap-4 px-6 pt-3"
          onSubmit={(e) => void onSubmit(e)}
        >
          <div className="space-y-4 text-sm">
            <InviteTeamMemberFields
              control={control}
              register={register}
              formState={formState}
              roleSelectOptions={roleSelectOptions}
            />
          </div>

          <SheetFooter className="border-border bg-background mt-0 shrink-0 flex-col-reverse gap-2 border-t px-0 pt-3 pb-1 [&_button]:w-full">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={formState.isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitDisabled} title={submitTitle}>
              {formState.isSubmitting ? 'Sending...' : 'Send invite'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
