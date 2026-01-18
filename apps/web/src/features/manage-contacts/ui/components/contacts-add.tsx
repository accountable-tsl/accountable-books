import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { FormField } from '@/components/FormField';
import { Success } from '@/components/Success';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useCreateContacts } from '@/modules/contacts/model/hooks';
import type { NewContact } from '@/modules/contacts/model/types';
import { newContact } from '@/modules/contacts/model/types';

export function AddContact({
  companyId,
  onCancel,
  classNames,
}: {
  companyId: string;
  onCancel?: () => void;
  classNames?: { container?: string; content?: string; form?: string };
}) {
  const [page, setPage] = useState<'form' | 'success'>('form');

  const addContactMutation = useCreateContacts();

  const {
    register,
    formState: { errors, isValid },
    handleSubmit,
    reset,
  } = useForm<NewContact>({
    resolver: standardSchemaResolver(newContact),
    defaultValues: {
      displayName: '',
      status: 'active',
    },
    mode: 'onChange',
  });

  const onSubmit = useCallback(
    async (data: NewContact) => {
      const input = Array.isArray(data) ? data : [data];
      try {
        const response = await addContactMutation.mutateAsync({
          companyId,
          data: input,
        });

        toast.success(response.message || 'Contact created successfully');
        reset();
        setPage('success');
      } catch (error) {
        toast.error('Failed to create contact');
      }
    },
    [addContactMutation, companyId, reset],
  );

  const handleCancel = useCallback(() => {
    onCancel?.();
  }, [onCancel]);

  return (
    <div className="flex h-full min-h-0 w-full items-center">
      <div
        className={cn(
          'mx-auto w-full max-w-md min-w-0 rounded-md border p-6',
          classNames?.content || '',
        )}
      >
        {page === 'form' && (
          <>
            <div className="mb-4 font-medium">Add Contact</div>
            <form
              className="relative flex min-h-0 flex-col justify-between gap-6"
              onSubmit={handleSubmit(onSubmit)}
            >
              <FormField
                id="displayName"
                label="Display Name"
                required
                error={errors.displayName?.message}
              >
                <Input {...register('displayName')} />
              </FormField>

              <FormField id="email" label="Email" error={errors.email?.message}>
                <Input {...register('email')} />
              </FormField>

              <FormField
                id="address"
                label="Address"
                error={errors.address?.message}
              >
                <Input {...register('address')} />
              </FormField>

              <FormField
                id="notes"
                label="Additional Notes"
                error={errors.notes?.message}
              >
                <Textarea {...register('notes')} className="resize-none" />
              </FormField>

              <div className="flex justify-between">
                <Button type="button" variant="secondary">
                  Cancel
                </Button>
                <Button className="ml-auto" disabled={!isValid}>
                  Submit
                </Button>
              </div>
            </form>
          </>
        )}

        {page === 'success' && (
          <div className="flex min-h-[350px] flex-col items-center justify-center gap-6">
            <Success text="Contact created successfully" />
            <Button onClick={handleCancel}>Close</Button>
          </div>
        )}
      </div>
    </div>
  );
}

export function AddContactDialog({
  open,
  overlayClassName,
  onCancel,
  showHeader = false,
  onOpenChange,
  companyId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  onCancel?: () => void;
  overlayClassName?: string;
  showHeader?: boolean;
  companyId: string;
}) {
  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent overlayClassName={overlayClassName} className="">
        <DialogHeader className={showHeader ? '' : 'sr-only'}>
          <DialogTitle>Add contact</DialogTitle>
          <DialogDescription className="text-muted-foreground sr-only text-sm">
            Add a new contact
          </DialogDescription>
        </DialogHeader>
        <AddContact
          companyId={companyId}
          onCancel={handleCancel}
          classNames={{ content: 'border-0 p-0' }}
        />
      </DialogContent>
    </Dialog>
  );
}
