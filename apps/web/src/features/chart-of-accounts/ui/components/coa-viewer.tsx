import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import type { Row } from '@tanstack/react-table';
import {
  Archive,
  ArrowLeft,
  Binary,
  Box,
  CheckCircle2,
  Coins,
  Group,
  Info,
  Lock,
  Trash2,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { AutocompleteDropdown } from '@/components/AutocompleteDropdown';
import { CenteredLoader } from '@/components/CenteredLoader';
import { FormField } from '@/components/FormField';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { useAccountMeta } from '@/domains-pending-migration/account-classification/hooks';
import { cn } from '@/lib/utils';
import {
  ACCOUNT_TYPE_BLACKLIST,
  type BlacklistedType,
  type CoaResponse,
  type EditCoaRequest,
  editCoaRequest,
  getChangedFields,
  useArchiveCoa,
  useDeleteCoa,
  useEditCoa,
  useUnarchiveCoa,
} from '@/modules/accounting/chart-of-accounts';
import { useMediaQuery } from '@/shared/hooks/use-media-query';

// Constants
const STYLES = {
  wrapper:
    'w-full max-w-2xl mx-auto min-h-0 overflow-y-auto scrollbar-thin-2px',
  titleSection: 'flex justify-between items-center border-b pl-4 pr-6 py-4',
  sectionClass: 'p-4 space-y-2',
  sectionTitleClass:
    'text-[10px] font-medium text-muted-foreground tracking-wider uppercase',
  sectionGridClass: 'grid grid-cols-2 gap-x-4 gap-y-6 w-full',
  itemTitleClass: 'text-xs text-muted-foreground pb-[2px] truncate',
} as const;

interface CoaViewerProps {
  row?: Row<CoaResponse> | undefined;
  companyId: string;
  onClose?: () => void;
}

export const CoaViewer: React.FC<CoaViewerProps> = ({
  row,
  companyId,
  onClose,
}) => {
  const [editMode, setEditMode] = useState(false);
  const is1024 = useMediaQuery('(max-width: 1024px)');

  // Mutations
  const editCoaMutation = useEditCoa();
  const archiveCoaMutation = useArchiveCoa();
  const unarchiveCoaMutation = useUnarchiveCoa();
  const deleteCoaMutation = useDeleteCoa();

  // Data
  const { data, isLoading } = useAccountMeta();
  const accountTypes = data?.enrichedAccountTypes || [];

  if (!row) {
    return (
      <div className="w-full mx-auto">
        <p>No account selected</p>
      </div>
    );
  }

  const account = row.original;

  // Memoized Values
  const defaultAccountValues = useMemo(
    () => ({
      id: account.id,
      name: account.name,
      description: account.description || '',
      code: account.code || '',
      accountTypeKey: account.accountTypeKey,
    }),
    [account],
  );

  const canDelete = useMemo(
    () =>
      !account.isLocked &&
      !ACCOUNT_TYPE_BLACKLIST.includes(
        account.accountTypeKey.toLowerCase() as BlacklistedType,
      ) &&
      account.canDelete &&
      !account.hasTransactions,
    [account],
  );

  const canArchive = useMemo(
    () =>
      !ACCOUNT_TYPE_BLACKLIST.includes(
        account.accountTypeKey.toLowerCase() as BlacklistedType,
      ) &&
      !account.isLocked &&
      account.isActive,
    [account],
  );

  // Form setup
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, dirtyFields, isDirty },
    reset,
    control,
  } = useForm<EditCoaRequest>({
    resolver: standardSchemaResolver(editCoaRequest),
    defaultValues: defaultAccountValues,
    mode: 'onChange',
  });

  const currentAccountTypeKey = useWatch({ control, name: 'accountTypeKey' });

  const currentAccountTypeInfo = useMemo(() => {
    return accountTypes.find((type) => type.key === currentAccountTypeKey);
  }, [currentAccountTypeKey, accountTypes]);

  // Event handlers
  const onEditToggle = useCallback(() => {
    setEditMode(!editMode);
    reset(defaultAccountValues);
  }, [editMode, reset, defaultAccountValues]);

  const handleEditSubmit = useCallback(
    (data: EditCoaRequest) => {
      const changedFields = getChangedFields(data, dirtyFields);
      const updates = { ...changedFields, id: data.id || account.id };

      editCoaMutation.mutate(
        { companyId, data: updates },
        {
          onSuccess: () => {
            toast.success('Account updated successfully');
            onClose();
          },
          onError: () => {
            toast.error('Failed to update account');
          },
        },
      );
    },
    [dirtyFields, account.id, editCoaMutation, companyId, onClose],
  );

  const handleArchive = useCallback(() => {
    archiveCoaMutation.mutate(
      { companyId, accountIds: [account.id] },
      {
        onSuccess: () => {
          toast.success('Account archived successfully');
        },
        onError: () => {
          toast.error('Failed to archive account');
        },
      },
    );
  }, [archiveCoaMutation, companyId, account.id]);

  const restoreArchived = useCallback(() => {
    unarchiveCoaMutation.mutate(
      { companyId, accountIds: [account.id] },
      {
        onSuccess: () => {
          toast.success('Account restored successfully');
        },
        onError: () => {
          toast.error('Failed to restore account');
        },
      },
    );
  }, [unarchiveCoaMutation, companyId, account.id]);

  const handleDelete = useCallback(() => {
    deleteCoaMutation.mutate(
      { companyId, accountIds: [account.id] },
      {
        onSuccess: () => {
          toast.success('Account deleted successfully');
          onClose();
        },
        onError: () => {
          toast.error('Failed to delete account');
        },
      },
    );
  }, [deleteCoaMutation, companyId, account.id, onClose]);

  if (isLoading) {
    return <CenteredLoader />;
  }

  const {
    wrapper,
    titleSection,
    sectionClass,
    sectionTitleClass,
    sectionGridClass,
    itemTitleClass,
  } = STYLES;

  if (editMode) {
    return (
      <div className={wrapper}>
        <div className={titleSection}>
          <div>Account Details</div>

          <Button variant="ghost" onClick={() => setEditMode(false)} size="sm">
            <ArrowLeft /> Back
          </Button>
        </div>

        <form onSubmit={handleSubmit(handleEditSubmit)}>
          {/* Basic Info */}
          <div className={sectionClass}>
            <h3 className={sectionTitleClass}>Basic Info</h3>
            <div className={cn(sectionGridClass, 'grid-cols-1')}>
              <FormField
                id="code"
                label="Account Code"
                error={errors.code?.message}
                labelClassName={cn(itemTitleClass)}
              >
                <Input
                  {...register('code')}
                  placeholder="Code"
                  aria-describedby="account-code-input"
                />
              </FormField>
              <FormField
                id="name"
                label="Account Name"
                error={errors.name?.message}
                labelClassName={cn(itemTitleClass)}
              >
                <Input
                  {...register('name')}
                  placeholder="Account Name"
                  aria-describedby="account-name-input"
                />
              </FormField>
              <FormField
                id="description"
                label="Description"
                error={errors.description?.message}
                labelClassName={cn(itemTitleClass)}
              >
                <Textarea
                  {...register('description')}
                  placeholder="This account is for..."
                  aria-describedby="name-error"
                  autoCorrect="on"
                  className="max-h-32"
                />
              </FormField>
            </div>
          </div>

          {canArchive && (
            <>
              <Separator className={is1024 ? 'my-2' : 'my-4'} />
              <div className={sectionClass}>
                <h3 className={sectionTitleClass}>Classification</h3>
                <div className={cn(sectionGridClass, 'grid-cols-[2fr_1fr]')}>
                  <Controller
                    name="accountTypeKey"
                    control={control}
                    render={({ field, fieldState }) => (
                      <div className="col-span-2">
                        <FormField
                          id="accountTypeKey"
                          label="Account Type"
                          labelClassName={itemTitleClass}
                          error={fieldState.error?.message || ''}
                        >
                          <AutocompleteDropdown
                            id="accountTypeKey"
                            items={accountTypes}
                            mapItem={(item) => ({
                              value: item.key,
                              label: item.label,
                            })}
                            placeholder="Select account type..."
                            aria-describedby={
                              errors.accountTypeKey
                                ? 'accountTypeKey-error'
                                : undefined
                            }
                            onValueChange={field.onChange}
                            value={field.value || ''}
                            groupBy={'parentElementLabel'}
                          />
                        </FormField>
                        {Object.prototype.hasOwnProperty.call(
                          dirtyFields,
                          'accountTypeKey',
                        ) && (
                          <div className="text-sm mt-2 py-2 px-4 bg-red-100 text-red-600 rounded">
                            <strong>Warning:</strong> Changing your account type
                            will affect all your postings and might not be
                            reversible!
                          </div>
                        )}
                      </div>
                    )}
                  />

                  <FormField
                    id="accountElement"
                    label="Account Element"
                    labelClassName={cn(itemTitleClass)}
                  >
                    <Input
                      disabled
                      value={
                        currentAccountTypeInfo?.elementLabel ||
                        account.accountElementLabel
                      }
                    />
                  </FormField>

                  <FormField
                    id="parentAccountElement"
                    label="Parent Account Element"
                    labelClassName={cn(itemTitleClass, 'text-background')}
                  >
                    <Input
                      disabled
                      value={
                        currentAccountTypeInfo?.parentElementLabel ||
                        account.parentAccountElementLabel
                      }
                    />
                  </FormField>
                </div>
              </div>
            </>
          )}

          <Separator className={is1024 ? 'my-2' : 'my-4'} />

          <div className={cn(sectionClass, 'flex')}>
            <Button onClick={onClose} variant={'secondary'} className="">
              Cancel
            </Button>
            <Button disabled={isSubmitting || !isDirty} className="ml-auto">
              Update Account
            </Button>
          </div>
        </form>
      </div>
    );
  }

  if (!editMode) {
    return (
      <div className={cn(wrapper)}>
        <div className={titleSection}>
          <div>Account Details</div>
          <div className="flex gap-2">
            {!account.isActive ? (
              <Button onClick={restoreArchived} size="sm">
                Restore
              </Button>
            ) : (
              <Button
                onClick={onEditToggle}
                disabled={account.isLocked}
                size="sm"
              >
                Edit
              </Button>
            )}
            <Button variant="secondary" onClick={onClose} size="sm">
              Close
            </Button>
          </div>
        </div>

        {!account.isActive && (
          <div className="text-yellow-600 text-sm flex items-center gap-1 pt-4 px-4">
            <Info className="w-4 h-4" /> This account is archived or inactive
          </div>
        )}
        <div
          className={cn(
            'py-6 text-sm',
            is1024 ? 'py-4' : '',
            !account.isActive ? 'opacity-50 pt-2' : '',
          )}
        >
          {/* Basic Info */}
          <div className={sectionClass}>
            <h3 className={sectionTitleClass}>Basic Info</h3>
            <div className={cn(sectionGridClass, 'grid-cols-[1fr_2fr]')}>
              <div className="min-w-0">
                <div className={itemTitleClass}>Account Code</div>
                <div className="flex items-center gap-1">
                  <Binary className="w-4 h-4 text-muted-foreground" />
                  <span>
                    {account.code || <span className="text-gray-400">—</span>}
                  </span>
                </div>
              </div>
              <div className="min-w-0">
                <div className={itemTitleClass}>Account Name</div>
                <div className="line-clamp-2 text-ellipsis">{account.name}</div>
              </div>
              <div className="min-w-0 col-span-2">
                <div className={itemTitleClass}>Description</div>
                <div className="line-clamp-2 text-ellipsis">
                  {account.description || (
                    <span className="text-gray-400">—</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <Separator className={is1024 ? 'my-2' : 'my-4'} />

          {/* Classification */}
          <div className={sectionClass}>
            <h3 className={sectionTitleClass}>Classification</h3>

            <div className={cn(sectionGridClass)}>
              <div className="flex items-center gap-1 col-span-2">
                <Group className="w-4 h-4 text-muted-foreground" />
                <span>{account.parentAccountElementLabel}</span>
              </div>
              <div className="min-w-0">
                <div className={itemTitleClass}>Account Type</div>
                <div className="flex items-center gap-1 truncate">
                  <Box className="w-4 h-4 text-muted-foreground" />
                  <span>{account.accountTypeLabel}</span>
                </div>
              </div>
              <div className="min-w-0">
                <div className={itemTitleClass}>Account Element</div>
                <div className="flex items-center gap-1 truncate">
                  <Binary className="w-4 h-4 text-muted-foreground" />
                  <span>{account.accountElementLabel}</span>
                </div>
              </div>
            </div>
          </div>

          <Separator className={is1024 ? 'my-2' : 'my-4'} />

          {/* Currency */}
          <div className={sectionClass}>
            <h3 className={sectionTitleClass}>Currency</h3>

            <div className={sectionGridClass}>
              <div className="min-w-0">
                <div className={itemTitleClass}>Account Currency</div>
                <div className="flex items-center gap-1">
                  <Coins className="w-4 h-4 text-muted-foreground" />
                  <span>
                    {account.accountCurrencyCode} (
                    {account.accountCurrencySymbol})
                  </span>
                </div>
              </div>

              <div className="min-w-0">
                <div className={itemTitleClass}>Reporting Currency</div>
                <div className="flex items-center gap-1">
                  <Coins className="w-4 h-4 text-muted-foreground" />
                  <span>
                    {account.reportingCurrencyCode} (
                    {account.reportingCurrencySymbol})
                  </span>
                </div>
              </div>
            </div>
          </div>

          <Separator className={is1024 ? 'my-2' : 'my-4'} />

          {/* Status */}
          <div className={sectionClass}>
            <h3 className={sectionTitleClass}>Status</h3>
            <div className="flex flex-wrap gap-2">
              {account.isActive && (
                <Badge variant="default">
                  <CheckCircle2 className="w-4 h-4 mr-1" /> Active
                </Badge>
              )}

              {!account.isActive && (
                <Badge variant="secondary">
                  <CheckCircle2 className="w-4 h-4 mr-1" /> Inactive
                </Badge>
              )}

              {!account.isActive && (
                <Badge variant="outline">
                  <Archive className="w-4 h-4 mr-1" /> Archived
                </Badge>
              )}

              {account.isLocked && (
                <Badge variant="destructive">
                  <Lock className="w-4 h-4 mr-1" /> Locked
                </Badge>
              )}
            </div>
          </div>

          {/* Danger Zone */}
          {(canDelete || canArchive) && (
            <>
              <Separator className={is1024 ? 'my-2' : 'my-4'} />

              <div className={sectionClass}>
                <h3 className={cn(sectionTitleClass, 'text-destructive')}>
                  Danger Zone
                </h3>
                <div className="flex gap-4">
                  {canArchive && (
                    <Button
                      className="flex items-center gap-1"
                      variant="outline"
                      onClick={handleArchive}
                    >
                      <Archive className="w-4 h-4" />
                      <span className="">Archive</span>
                    </Button>
                  )}
                  {canDelete && (
                    <Button
                      className="flex items-center gap-1"
                      variant="destructive"
                      onClick={handleDelete}
                    >
                      <Trash2 className="w-4 h-4" />
                      <span className="">Delete Account</span>
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }
};
