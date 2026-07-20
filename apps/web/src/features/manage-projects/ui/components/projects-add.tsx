import type { ActionItem } from '@/components/AutocompleteDropdown';
import type { Contacts } from '@/modules/contacts/model/types';
import type {
  NewProject,
  NewProjectFormInput,
} from '@/modules/projects/model/types';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AutocompleteDropdown } from '@/components/AutocompleteDropdown';
import { CenteredLoader } from '@/components/CenteredLoader';
import { DatePicker } from '@/components/date-picker/date-picker';
import ErrorPage from '@/components/ErrorPage';
import { FormField } from '@/components/FormField';
import { SimpleSelect } from '@/components/SimpleSelect';
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
import { AddContactDialog } from '@/features/manage-contacts/ui/components/contacts-add';
import { cn } from '@/lib/utils';
import { useContacts } from '@/modules/contacts/model/hooks';
import { useCreateProjects } from '@/modules/projects/model/hooks';
import { newProject } from '@/modules/projects/model/types';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useSession } from '@session';
import { Plus } from 'lucide-react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { projectStatusOptions } from '../constants/projects-constants';

export function AddProject({
  onCancel,
  classNames,
}: {
  onCancel?: () => void;
  classNames?: { container?: string; content?: string; form?: string };
}) {
  const [formState, setFormState] = useState<'initial' | 'success'>('initial');
  const [page, setPage] = useState<number>(1);
  const [limit, _setLimit] = useState<number>(30);
  const [contactSearch, setContactSearch] = useState<string>('');
  const [allContacts, setAllContacts] = useState<Contacts[]>([]);
  const [showContactDialog, setShowContactDialog] = useState(false);

  const addProjectMutation = useCreateProjects();
  const { companyId, loading: sessionLoading } = useSession();
  const { data: contactData, isLoading: contactLoading } = useContacts({
    companyId: companyId || '',
    limit: limit,
    page: page,
    search: contactSearch,
    searchFields: ['displayName'],
  });

  const contacts = useMemo(() => allContacts, [allContacts]);

  const contactPagination = useMemo(
    () => contactData?.data?.pagination,
    [contactData?.data],
  );

  const contactOptions = useMemo(() => {
    return contacts.map((contact) => ({
      label: contact.displayName,
      value: contact.id,
    }));
  }, [contacts]);

  // If contacts are more than 30, use async & infinite scroll
  const useAsyncContacts = (contactPagination?.total ?? 0) > 30;

  const loadMoreContacts = useCallback(() => {
    if (contactPagination?.hasNext) {
      setPage((prevPage) => prevPage + 1);
    }
  }, [contactPagination?.hasNext]);

  const handleContactSearch = useCallback((value: string) => {
    setContactSearch(value);
    setPage(1);
  }, []);

  const {
    control,
    register,
    formState: { errors, isValid },
    handleSubmit,
    reset,
  } = useForm<NewProjectFormInput, unknown, NewProject>({
    resolver: standardSchemaResolver(newProject),
    defaultValues: {
      name: '',
      code: null,
      description: null,
      status: 'in_draft',
      contactId: null,
      startDate: null,
      endDate: null,
    },
    mode: 'onChange',
  });

  const watchedStartDate = useWatch({ control, name: 'startDate' });
  const emptyStringToNull = (value: unknown) => (value === '' ? null : value);

  const onSubmit = useCallback(
    async (data: NewProject) => {
      const input = Array.isArray(data) ? data : [data];
      try {
        const response = await addProjectMutation.mutateAsync({
          companyId: companyId || '',
          data: input,
        });

        toast.success(response.message || 'Project created successfully');
        reset();
        setFormState('success');
      } catch (error) {
        toast.error('An unexpected error occurred, please try again');
      }
    },
    [addProjectMutation, companyId, reset],
  );

  const handleCancel = useCallback(() => {
    onCancel?.();
  }, [onCancel]);

  const contactActionItems: ActionItem[] = [
    {
      id: 'addContact',
      icon: <Plus className="h-3 w-3" />,
      label: 'Add new contact',
    },
  ];

  useEffect(() => {
    const newContacts = contactData?.data?.contacts ?? [];
    if (!newContacts.length) return;

    setAllContacts((prev) => {
      const merged = page === 1 ? newContacts : [...prev, ...newContacts];
      const unique = new Map(merged.map((c) => [c.id, c]));
      return Array.from(unique.values());
    });
  }, [contactData?.data?.contacts, page, contactSearch]);

  const labelClassName = 'font-light';

  if (sessionLoading) {
    return <CenteredLoader />;
  }

  if (!companyId) return <ErrorPage type="default" />;

  return (
    <div className="flex h-full min-h-0 w-full items-center">
      <div
        className={cn(
          'mx-auto w-full max-w-md min-w-0 rounded-md border p-6',
          classNames?.content || '',
        )}
      >
        {formState === 'initial' && (
          <>
            <div className="mb-4 font-medium">Add Project</div>
            <form
              className="relative flex min-h-0 flex-col justify-between gap-6"
              onSubmit={handleSubmit(onSubmit)}
            >
              <div className="grid grid-cols-[2fr_3fr] gap-4">
                <FormField
                  id="code"
                  label="Code"
                  error={errors.code?.message}
                  labelClassName={labelClassName}
                >
                  <Input
                    {...register('code', { setValueAs: emptyStringToNull })}
                    placeholder="PROJ-001"
                  />
                </FormField>
                <Controller
                  name="status"
                  control={control}
                  render={({ field, fieldState }) => (
                    <FormField
                      id="status"
                      label="Status"
                      error={fieldState.error?.message}
                      labelClassName={labelClassName}
                    >
                      <SimpleSelect
                        value={field.value || ''}
                        onChange={field.onChange}
                        options={projectStatusOptions}
                        placeholder="Select Status"
                        className="w-full"
                      />
                    </FormField>
                  )}
                />
              </div>
              <FormField
                id="name"
                label="Project Name"
                required
                error={errors.name?.message}
                labelClassName={labelClassName}
              >
                <Input {...register('name')} placeholder="New Day Project..." />
              </FormField>

              <Controller
                name="contactId"
                control={control}
                render={({ field, fieldState }) => (
                  <FormField
                    id="contact"
                    label="Contact"
                    error={fieldState.error?.message}
                    labelClassName={labelClassName}
                  >
                    <AutocompleteDropdown
                      items={contactOptions}
                      onValueChange={(value) => field.onChange(value || null)}
                      value={typeof field.value === 'string' ? field.value : ''}
                      async={useAsyncContacts}
                      isLoading={contactLoading}
                      hasMore={contactPagination?.hasNext || false}
                      onLoadMore={loadMoreContacts}
                      onSearchChange={handleContactSearch}
                      aria-describedby={
                        errors.contactId ? 'contact-error' : undefined
                      }
                      actionItems={contactActionItems}
                      onAction={(actionId) => {
                        if (actionId === 'addContact') {
                          setShowContactDialog(true);
                        }
                      }}
                    />
                  </FormField>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <Controller
                  name="startDate"
                  control={control}
                  render={({ field, fieldState }) => (
                    <FormField
                      id="startDate"
                      label="Start Date"
                      error={fieldState.error?.message}
                      helpTooltip="Project start date"
                      labelClassName={labelClassName}
                    >
                      <DatePicker
                        showLabel={false}
                        value={field.value ?? undefined}
                        onChange={field.onChange}
                      />
                    </FormField>
                  )}
                />
                <Controller
                  name="endDate"
                  control={control}
                  render={({ field, fieldState }) => {
                    const calendarDisabled = (date: any) =>
                      date < (watchedStartDate ?? new Date());
                    return (
                      <FormField
                        id="endDate"
                        label="End Date"
                        error={fieldState.error?.message}
                        helpTooltip="Project end date"
                        labelClassName={labelClassName}
                      >
                        <DatePicker
                          showLabel={false}
                          value={
                            !watchedStartDate
                              ? undefined
                              : (field.value ?? undefined)
                          }
                          onChange={field.onChange}
                          calendarDisabled={calendarDisabled}
                        />
                      </FormField>
                    );
                  }}
                />
              </div>

              <FormField
                id="description"
                label="Project Description"
                error={errors.description?.message}
                labelClassName={labelClassName}
              >
                <Textarea
                  {...register('description', {
                    setValueAs: emptyStringToNull,
                  })}
                  className="resize-none"
                  placeholder="This is new day's project description..."
                />
              </FormField>

              <div className="flex justify-between">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleCancel}
                >
                  Cancel
                </Button>
                <Button className="ml-auto" disabled={!isValid}>
                  Submit
                </Button>
              </div>
            </form>
          </>
        )}
        {formState === 'success' && (
          <div className="flex min-h-[350px] flex-col items-center justify-center gap-6">
            <Success text="Project created successfully" />
            <Button onClick={handleCancel}>Close</Button>
          </div>
        )}
      </div>

      <AddContactDialog
        open={showContactDialog}
        onOpenChange={setShowContactDialog}
        companyId={companyId}
      />
    </div>
  );
}

export function AddProjectDialog({
  open,
  overlayClassName,
  onCancel,
  showHeader = false,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  onCancel?: () => void;
  overlayClassName?: string;
  showHeader?: boolean;
}) {
  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent overlayClassName={overlayClassName} className="">
        <DialogHeader className={showHeader ? '' : 'sr-only'}>
          <DialogTitle>Add project</DialogTitle>
          <DialogDescription className="text-muted-foreground sr-only text-sm">
            Add new project
          </DialogDescription>
        </DialogHeader>
        <AddProject
          onCancel={handleCancel}
          classNames={{ content: 'border-0 p-0' }}
        />
      </DialogContent>
    </Dialog>
  );
}
