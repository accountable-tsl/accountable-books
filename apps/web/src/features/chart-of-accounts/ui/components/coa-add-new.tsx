import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useSession } from '@session';
import { Info } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { AutocompleteDropdown } from '@/components/AutocompleteDropdown';
import { CenteredLoader } from '@/components/CenteredLoader';
import ErrorPage from '@/components/ErrorPage';
import { FormField } from '@/components/FormField';
import { Success } from '@/components/Success';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  useAccountMeta,
  useAccountTypeByKey,
} from '@/domains-pending-migration/account-classification/hooks';
import { cn } from '@/lib/utils';
import type { CreateCoa } from '@/modules/accounting/chart-of-accounts';
import {
  createCoaSchema,
  useCompanyCoa,
  useCreateCoa,
} from '@/modules/accounting/chart-of-accounts';
import { useIsMobile } from '@/shared/hooks/use-media-query';

import { CoaImportCsv } from './coa-import-csv';

export function AddNewCoa({
  onSuccess,
  onCancel,
  classNames,
}: {
  onSuccess?: () => void;
  onCancel?: () => void;
  classNames?: { container?: string; content?: string; form?: string };
}) {
  // State
  const [page, setPage] = useState<'form' | 'import' | 'success'>('form');

  // Session and data hooks
  const { companyId, loading: isSessionLoading } = useSession();
  const {
    isDuplicateCode,
    isDuplicateName,
    isLoading: isCoaLoading,
    isError: isCoaError,
  } = useCompanyCoa(companyId!);
  const { data, isLoading: isLoadingMeta } = useAccountMeta();

  // Mutations
  const addCoaMutation = useCreateCoa();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isValid },
    reset,
    control,
    setError,
    clearErrors,
  } = useForm<CreateCoa>({
    resolver: standardSchemaResolver(createCoaSchema),
    mode: 'onChange',
  });

  // Watched values
  const watchedCode = useWatch({ control, name: 'code' });
  const watchedName = useWatch({ control, name: 'name' });
  const currentAccountTypeKey = useWatch({ control, name: 'accountTypeKey' });

  // Derived data
  const accountTypes = useMemo(
    () => data?.enrichedAccountTypes || [],
    [data?.enrichedAccountTypes],
  );
  const accountTypeByKey = useAccountTypeByKey();

  const { accountElement, parentElement, showAccountElement } = useMemo(() => {
    const key = accountTypeByKey.get(currentAccountTypeKey);
    const element = key?.elementLabel;
    const parent = key?.parentElementLabel;
    return {
      accountElement: element,
      parentElement: parent,
      showAccountElement: !!element && !!parent,
    };
  }, [accountTypeByKey, currentAccountTypeKey]);

  const duplicateCode = useMemo(
    () => isDuplicateCode(watchedCode || ''),
    [watchedCode, isDuplicateCode],
  );
  const duplicateName = useMemo(
    () => isDuplicateName(watchedName || ''),
    [watchedName, isDuplicateName],
  );

  // Effects for validation
  useEffect(() => {
    if (isCoaLoading || !watchedCode) return;

    const timer = setTimeout(() => {
      if (isDuplicateCode(watchedCode || '')) {
        setError('code', { type: 'manual', message: 'Code has been used' });
      } else {
        clearErrors('code');
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [watchedCode, isCoaLoading, duplicateCode, clearErrors, setError, isDuplicateCode]);

  useEffect(() => {
    if (isCoaLoading || !watchedName) return;

    const timer = setTimeout(() => {
      if (duplicateName) {
        setError('name', {
          type: 'manual',
          message: 'Account name already exists',
        });
      } else {
        clearErrors('name');
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [watchedName, isCoaLoading, duplicateName, clearErrors, setError]);

  // Handlers
  const onSubmit = useCallback(
    async (input: CreateCoa | CreateCoa[]) => {
      if (!companyId) return;

      const data = Array.isArray(input) ? input : [input];

      try {
        await addCoaMutation.mutateAsync({
          companyId: companyId,
          data,
        });
        reset();
        setPage('success');
      } catch (error) {
        toast.error('Failed to create account');
      }
    },
    [addCoaMutation, companyId, reset],
  );

  const onCancelClick = useCallback(() => {
    onCancel?.();
    setPage('form');
    reset();
  }, [onCancel, reset, setPage]);

  const mapItem = useCallback(
    (item: any) => ({
      value: item.key,
      label: item.label,
    }),
    [],
  );

  // Loadaing and error states
  if (isSessionLoading || isLoadingMeta || isCoaLoading) {
    return <CenteredLoader />;
  }

  if (isCoaError || !companyId) {
    return <ErrorPage type="default" />;
  }

  return (
    <div
      className={cn(
        'flex h-full min-h-0 w-full items-center',
        classNames?.container || '',
      )}
    >
      <div
        className={cn(
          'mx-auto w-full max-w-md min-w-0 border p-6',
          classNames?.content || '',
        )}
      >
        <h2 className="pb-4 text-lg font-semibold">
          {page === 'import' ? 'Import Chart of Accounts' : 'Add New Account'}
        </h2>
        {page === 'form' && (
          <form
            className={cn(
              'relative flex min-h-[380px] flex-col justify-between gap-6',
              classNames?.form || '',
            )}
            onSubmit={handleSubmit(onSubmit)}
          >
            <FormField id="code" label="Code" error={errors.code?.message}>
              <Input placeholder="100-0001" {...register('code')} />
            </FormField>
            <FormField
              id="name"
              label="Account Name"
              error={errors.name?.message}
              required
            >
              <Input placeholder="Directors' Drawings" {...register('name')} />
            </FormField>
            <Controller
              name="accountTypeKey"
              control={control}
              render={({ field, fieldState }) => (
                <div className="col-span-2">
                  <FormField
                    id="accountTypeKey"
                    label="Account Type"
                    error={fieldState.error?.message || ''}
                    required
                  >
                    <AutocompleteDropdown
                      id="accountTypeKey"
                      items={accountTypes}
                      mapItem={mapItem}
                      placeholder="Select account type..."
                      aria-describedby={
                        errors.accountTypeKey
                          ? 'accountTypeKey-error'
                          : undefined
                      }
                      onValueChange={field.onChange}
                      value={field.value ?? undefined}
                      groupBy={'parentElementLabel'}
                    />
                  </FormField>
                  {showAccountElement && (
                    <div className="text-muted-foreground flex items-center gap-1 pt-[3px] text-sm">
                      <span className="inline-flex items-center gap-1 underline decoration-dotted underline-offset-2">
                        <Info className="h-3 w-3" />
                        {accountElement}
                      </span>
                      <Badge variant="outline" className="rounded-xl">
                        {parentElement}
                      </Badge>
                    </div>
                  )}
                </div>
              )}
            />
            <FormField
              id="description"
              label="Description"
              error={errors.description?.message}
            >
              <Textarea
                placeholder="This is an account that..."
                className="resize-none"
                {...register('description')}
              />
            </FormField>
            <div
              className={cn(
                'absolute bottom-12 left-1/2 -translate-x-1/2 transform',
                'text-muted-foreground hover:text-foreground/80 cursor-pointer text-sm hover:underline',
              )}
              onClick={() => setPage('import')}
            >
              Import CSV
            </div>
            <div className="flex py-2.5">
              <Button variant="secondary" onClick={onCancelClick}>
                Cancel
              </Button>
              <Button
                className="ml-auto"
                disabled={!isValid || isSubmitting || addCoaMutation.isPending}
              >
                {isSubmitting || addCoaMutation.isPending
                  ? 'Adding...'
                  : 'Add new account'}
              </Button>
            </div>
          </form>
        )}
        {page === 'success' && (
          <div className="flex min-h-[380px] flex-col items-center justify-center gap-6">
            <Success text="Account created successfully" />
            <Button onClick={onSuccess}>Close</Button>
          </div>
        )}

        {page === 'import' && (
          <div className="overflow flex min-h-[380px] w-full max-w-full min-w-0 flex-col gap-6">
            <CoaImportCsv
              companyId={companyId}
              accountTypeByKey={accountTypeByKey}
              onSubmit={onSubmit}
              onClose={onCancelClick}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export function AddNewCoaDialog({
  open,
  onOpenChange,
  onSuccess,
  onCancel,
  overlayClassName,
  showHeader = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  onCancel?: () => void;
  overlayClassName?: string;
  showHeader?: boolean;
}) {
  const isMobile = useIsMobile();
  const handleSuccess = onSuccess ?? (() => onOpenChange(false));
  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  const title = 'Add New Account';

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={handleCancel}>
        <DrawerContent>
          <DrawerHeader className={showHeader ? '' : 'sr-only'}>
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription className="text-muted-foreground sr-only text-sm">
              Add a new account
            </DrawerDescription>
          </DrawerHeader>
          <AddNewCoa onSuccess={handleSuccess} onCancel={onCancel} />
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent overlayClassName={overlayClassName} className="">
        <DialogHeader className={showHeader ? '' : 'sr-only'}>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="text-muted-foreground sr-only text-sm">
            Add a new account
          </DialogDescription>
        </DialogHeader>
        <AddNewCoa
          onSuccess={handleSuccess}
          onCancel={onCancel}
          classNames={{ content: 'border-0 px-0 py-2' }}
        />
      </DialogContent>
    </Dialog>
  );
}
