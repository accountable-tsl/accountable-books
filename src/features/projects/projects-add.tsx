import { FormField } from "@/components/FormField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Controller, useForm, useWatch } from "react-hook-form";
import { Contacts } from "@/features/contacts/contacts-types";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect, useMemo, useState } from "react";
import { newProject, NewProject } from "@/features/projects/projects-types";
import { toast } from "sonner";
import { Success } from "@/components/Success";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ActionItem,
  AutocompleteDropdown,
} from "@/components/AutocompleteDropdown";
import { useContacts } from "@/features/contacts/contacts-hooks";
import { useSession } from "@/features/auth/Session";
import { useCreateProjects } from "@/features/projects/projects-hooks";
import { SimpleSelect } from "@/components/SimpleSelect";
import { projectStatusOptions } from "./projects-constants";
import { DatePicker } from "@/components/calendar/date-picker";
import { CenteredLoader } from "@/components/CenteredLoader";
import ErrorPage from "@/components/ErrorPage";
import { AddContactDialog } from "../contacts/contacts-add";
import { Plus } from "lucide-react";

export function AddProject({
  onCancel,
  classNames,
}: {
  onCancel?: () => void;
  classNames?: { container?: string; content?: string; form?: string };
}) {
  const [formState, setFormState] = useState<"initial" | "success">("initial");
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(30);
  const [contactSearch, setContactSearch] = useState<string>("");
  const [allContacts, setAllContacts] = useState<Contacts[]>([]);
  const [showContactDialog, setShowContactDialog] = useState(false);

  const addProjectMutation = useCreateProjects();
  const { companyId, loading: sessionLoading } = useSession();
  const { data: contactData, isLoading: contactLoading } = useContacts({
    companyId: companyId || "",
    limit: limit,
    page: page,
    search: contactSearch,
    searchFields: ["displayName"],
  });

  const contacts = useMemo(() => allContacts, [allContacts]);

  const contactPagination = useMemo(
    () => contactData?.data?.pagination,
    [contactData?.data]
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
    formState: { errors, isValid, dirtyFields },
    handleSubmit,
    reset,
  } = useForm<NewProject>({
    resolver: zodResolver(newProject),
    defaultValues: {
      name: "",
      status: "in_draft",
    },
    mode: "onChange",
  });

  const watchedStartDate = useWatch({ control, name: "startDate" });
  const onSubmit = useCallback(
    async (data: NewProject) => {
      const input = Array.isArray(data) ? data : [data];
      try {
        await addProjectMutation.mutateAsync({
          companyId: companyId || "",
          data: input,
        });

        reset();
        setFormState("success");
      } catch (error) {
        toast.error("An unexpected error occurred, please try again");
      }
    },
    [addProjectMutation, companyId, reset]
  );

  const handleCancel = useCallback(() => {
    onCancel?.();
  }, [onCancel]);

  const contactActionItems: ActionItem[] = [
    {
      id: "addContact",
      icon: <Plus className="w-3 h-3" />,
      label: "Add new contact",
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

  const labelClassName = "font-light";

  if (sessionLoading) {
    return <CenteredLoader />;
  }

  if (!companyId) return <ErrorPage type="default" />;

  return (
    <div className="w-full flex min-h-0 h-full items-center">
      <div
        className={cn(
          "min-w-0 w-full max-w-md mx-auto p-6 border rounded-md",
          classNames?.content || ""
        )}
      >
        {formState === "initial" && (
          <>
            <div className="font-medium mb-4">Add Project</div>
            <form
              className="relative flex flex-col gap-6 min-h-0 justify-between"
              onSubmit={handleSubmit(onSubmit)}
            >
              <div className="grid grid-cols-[2fr_3fr] gap-4">
                <FormField
                  id="code"
                  label="Code"
                  error={errors.code?.message}
                  labelClassName={labelClassName}
                >
                  <Input {...register("code")} placeholder="PROJ-001" />
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
                        value={field.value || ""}
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
                <Input {...register("name")} placeholder="New Day Project..." />
              </FormField>

              <Controller
                name="contactId"
                control={control}
                render={({ field, fieldState }) => (
                  <FormField
                    id="contact"
                    label="Contact"
                    required
                    error={fieldState.error?.message}
                    labelClassName={labelClassName}
                  >
                    <AutocompleteDropdown
                      items={contactOptions}
                      onValueChange={field.onChange}
                      value={field.value}
                      async={useAsyncContacts}
                      isLoading={contactLoading}
                      hasMore={contactPagination?.hasNext || false}
                      onLoadMore={loadMoreContacts}
                      onSearchChange={handleContactSearch}
                      aria-describedby={
                        errors.contactId ? "contact-error" : undefined
                      }
                      actionItems={contactActionItems}
                      onAction={(actionId) => {
                        if (actionId === "addContact") {
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
                              : field.value ?? undefined
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
                  {...register("description")}
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
        {formState === "success" && (
          <div className="flex flex-col gap-6 min-h-[350px] items-center justify-center">
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
        <DialogHeader className={showHeader ? "" : "sr-only"}>
          <DialogTitle>Add project</DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm sr-only">
            Add new project
          </DialogDescription>
        </DialogHeader>
        <AddProject
          onCancel={handleCancel}
          classNames={{ content: "border-0 p-0" }}
        />
      </DialogContent>
    </Dialog>
  );
}
