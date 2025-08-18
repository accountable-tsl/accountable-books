import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useForm } from 'react-hook-form';
import { NewContact, newContact } from '@/features/contacts/contacts-types';
import { zodResolver } from '@hookform/resolvers/zod';
import { useCreateContacts } from '@/features/contacts/contacts-hooks';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { Success } from '@/components/Success';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

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
    resolver: zodResolver(newContact),
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
        await addContactMutation.mutateAsync({
          companyId,
          data: input,
        });

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
    <div className="w-full flex min-h-0 h-full items-center">
      <div
        className={cn(
          'min-w-0 w-full max-w-md mx-auto p-6 border rounded-md',
          classNames?.content || '',
        )}
      >
        {page === 'form' && (
          <>
            <div className="font-medium mb-4">Add Contact</div>
            <form
              className="relative flex flex-col gap-6 min-h-0 justify-between"
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

              <FormField id="address" label="Address" error={errors.address?.message}>
                <Input {...register('address')} />
              </FormField>

              <FormField id="notes" label="Additional Notes" error={errors.notes?.message}>
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
          <div className="flex flex-col gap-6 min-h-[350px] items-center justify-center">
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
          <DialogDescription className="text-muted-foreground text-sm sr-only">
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
