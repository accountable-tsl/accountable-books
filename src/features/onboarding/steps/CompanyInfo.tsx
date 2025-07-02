import { AutocompleteDropdown } from "@/components/AutocompleteDropdown";
import { CenteredLoader } from "@/components/CenteredLoader";
import ErrorPage from "@/components/ErrorPage";
import { FormField } from "@/components/FormField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getCompanyDetails, updateCompanyDetails } from "@/domains/company/api";
import {
  ACCOUNTING_BASIS,
  COMPANY_REVENUE_RANGE,
  COMPANY_SIZE,
} from "@/domains/company/constants";
import { useCompany } from "@/domains/company/store";
import {
  companyData,
  CompanyData,
  UpdateCompanyData,
} from "@/domains/company/types";
import {
  getCompanyTypeDisplay,
  getDefaultCompanyData,
} from "@/domains/company/utils";
import { deleteObject, uploadObject } from "@/domains/objects/api";
import { ImageUploader } from "@/domains/objects/ImageUploader";
import { TOOLTIP } from "@/features/signup/signupConstants";
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { useCountries } from "@/shared/hooks/useCountries";
import { useCurrencies } from "@/shared/hooks/useCurrencies";
import { useIndustries } from "@/shared/hooks/useIndustries";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import DOMPurify from "dompurify";
import { debounce } from "lodash";
import { mergeInitialData } from "../utils";
import { getChangesOnly } from "@/shared/utils/comparisonUtils";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth, useSessionLoader } from "@/features/auth/hooks";
import { useSlugCheck } from "@/domains/firms/hooks";
import { validateSlug } from "@/domains/firms/utils";
import { updateCompanyOnboardingStatus } from "@/features/onboarding/api";
import { useCompanyDetails } from "@/domains/company/hooks";

export const CompanyInfo = () => {
  // Refs
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // State
  const [isLoading, setIsLoading] = useState(false);
  const [initialData, setInitialData] = useState<CompanyData | null>(null);
  const [showQuickSubmit, setShowQuickSubmit] = useState(false);
  const [isManuallyDismissed, setIsManuallyDismissed] = useState(false);
  const [scrollPosition, setScrollPosition] = useState(0);
  const [controlledInputError, setControlledInputError] = useState<Partial<
    Record<keyof CompanyData, string>
  > | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Hooks
  const { isLoggedIn, user, currentCompanyId: companyId } = useAuth();
  const { loading: sessionLoading } = useSessionLoader();
  const {
    data: industries,
    isLoading: isIndustriesLoading,
    isError: isIndustriesError,
  } = useIndustries();
  const { data: countries, isLoading: isCountryLoading } = useCountries();
  const { data: currencies, isLoading: isCurrencyLoading } = useCurrencies();
  const { data: companyDetailsRes, isLoading: isCompanyDetailsLoading } =
    useCompanyDetails(companyId || "");

  const isMobile = useIsMobile();

  // Derived / Computed Values
  const company = companyDetailsRes?.data;
  const { companyType } = companyDetailsRes?.data || {};

  console.log({ company });

  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const isAccountingFirm = companyType === "accounting_firm";
  const isIndividual = companyType === "individual";

  // Initialize form
  const {
    control,
    reset,
    trigger,
    watch,
    setValue,
    getValues,
    register,

    formState: { errors, isSubmitting },
  } = useForm<CompanyData>({
    mode: "onChange",
    defaultValues: getDefaultCompanyData(),
  });

  // Functions
  const fetchCompanyDetails = async (
    companyId: string
  ): Promise<CompanyData | null> => {
    if (!companyId) {
      toast.error("Company ID is missing");
      setIsLoading(false);
      return null;
    }

    setIsLoading(true);
    try {
      if (company && company?.companyLogo) {
        return company;
      } else {
        const res = await getCompanyDetails(companyId);
        if (res.success && res.data) {
          return res.data;
        }
        toast.error(res.message || "Failed to fetch company details");
        return null;
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to fetch company details");
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const watchedSlug =
    companyType === "accounting_firm"
      ? watch("assignedFirmSlug")?.trim() || ""
      : "";
  const { data: slugCheck, isFetching } = useSlugCheck(watchedSlug, companyId!);

  const isSlugTaken = slugCheck?.data?.isAvailable === false;
  const isSlugOwned = slugCheck?.data?.isCurrent === true;
  const slugTakenMessage = isSlugTaken ? slugCheck?.message : "";

  const handleUpload = async (file: File) => {
    if (!companyId) {
      toast.error("Cannot upload: Company ID is missing");
      return null;
    }

    const params = { file, companyId: companyId! };
    const response = await uploadObject("logos", params);
    if (response.success && response.data) {
      setValue("companyLogo", response.data.url, { shouldValidate: true });
      setValue("companyLogoKey", response.data.key, { shouldValidate: true });
      return { url: response.data.url, key: response.data.key };
    }
    toast.error(response.message || "Upload failed");
    return null;
  };

  const handleRemove = async (key: string) => {
    const response = await deleteObject("logos", key);
    if (response.success) {
      setValue("companyLogo", null, { shouldValidate: true });
      setValue("companyLogoKey", null, { shouldValidate: true });
    } else {
      toast.error(response.message || "Remove failed");
    }
  };

  const handleError = (message: string) => {
    toast.error(message);
  };

  const handleChange = (field: keyof CompanyData, value: string | number) => {
    let processedValue = value;
    const fieldSchema = companyData.shape[field];
    if (
      fieldSchema._def.typeName === "ZodNumber" &&
      typeof value === "string"
    ) {
      processedValue = parseInt(value, 10);
    }

    setValue(field, processedValue, {
      shouldValidate: true,
      shouldDirty: true,
    });
    trigger(["yearEndDay", "yearEndMonth"]);
  };

  // Essential required fields for quick submit
  const getRequiredFields = () => {
    const baseRequired: (keyof CompanyData)[] = [
      "legalName",
      "displayName",
      "companyType",
      "countryId",
      "reportingCurrencyId",
      "yearEndDay",
      "yearEndMonth",
      "industry",
    ];
    const accountingRequired: (keyof CompanyData)[] = isAccountingFirm
      ? ["accountingBasis", "assignedFirmSlug"]
      : [];
    return [...baseRequired, ...accountingRequired];
  };
  const requiredFields = getRequiredFields();

  // Check if essential fields are filled
  const checkEssentialFieldsComplete = (): boolean => {
    const fieldValues = watch(requiredFields);
    return requiredFields.every(
      (_, index) =>
        fieldValues[index] && fieldValues[index].toString().trim() !== ""
    );
  };

  const scrollToSubmit = () => {
    const footer = document.querySelector("[data-footer]");
    footer?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const dismissQuickSubmit = () => {
    setIsManuallyDismissed(true);
    const timeout = setTimeout(() => setIsManuallyDismissed(false), 10000);
    return () => clearTimeout(timeout);
  };

  // const slugExists = async (slug: string): Promise<boolean> => {
  //   const response = await checkSlugExists(slug);
  //   return !response.success;
  // };
  // On click of submit & continue, validate form, if valid, open confirmation dialog
  const handleInitialSubmit = async (): Promise<{
    success: boolean;
    message?: string;
    formData?: CompanyData;
    dbData?: CompanyData;
  }> => {
    try {
      setIsLoading(true);
      const formData = getValues();

      const validatedForm = companyData.safeParse(formData);
      if (!validatedForm.success) {
        toast.error("Please fill all required fields");
        console.error("Validation errors:", validatedForm.error);
        return { success: false };
      }

      //Fetch existing company details
      let dbData: CompanyData | undefined = undefined;
      if (company) {
        dbData = company;
      } else {
        const res = await getCompanyDetails(companyId!);
        dbData = res.data;
      }

      if (!dbData) {
        throw new Error("Failed to fetch original company data");
      }

      // Check if required fields are filled (including previously unset ones)
      const missingRequired = requiredFields.filter((field) => {
        const formValue = formData[field];
        const dbValue = dbData[field];
        // Field is required but either empty in form or still null/undefined in both
        return (
          !formValue ||
          (typeof formValue === "string" && formValue.trim() === "") ||
          (formValue == null && dbValue == null)
        );
      });

      if (isAccountingFirm && slugTakenMessage) {
        toast.error(slugTakenMessage);
        return { success: false };
      }

      if (missingRequired.length > 0) {
        toast.error(
          `Please provide: ${missingRequired
            .map((f) => f.replace(/([A-Z])/g, " $1").toLowerCase())
            .join(", ")}`
        );
        return { success: false };
      }
      setConfirmOpen(true);

      return { success: true, formData, dbData };
    } catch (error) {
      toast.error("An unexpected error occurred, check form details");
      return { success: false };
    } finally {
      setIsLoading(false);
    }
  };

  // Submit form to backend
  const handleSubmit = async () => {
    console.log("Submitting company info...");
    try {
      setIsLoading(true);

      const res = await handleInitialSubmit(); // Ensure initial validation is done
      if (!res.success) {
        toast.error(res.message || "Failed to validate form");
        setIsLoading(false);
        return;
      }

      const { formData, dbData } = res;

      // Get only changed fields
      const updates: Record<string, any> = getChangesOnly(dbData, formData);
      const { onboardingStatus, assignedFirmSlug, ...rest } = updates;
      console.log(rest);

      let dataToUpdate: UpdateCompanyData = rest;
      if (companyType === "accounting_firm" && assignedFirmSlug) {
        const slug = assignedFirmSlug;

        if (!slug) {
          toast.error(`Please provide a valid slug ${slug}`);
          return;
        }

        dataToUpdate = { ...rest, slug };
      }

      if (Object.keys(dataToUpdate).length === 0) {
        toast.info("No changes detected. Proceeding to next step...");
      } else {
        const { success, message, data } = await updateCompanyDetails(
          companyId!,
          dataToUpdate
        );

        console.log("Update response:", { success, message, data });

        if (!success) {
          throw new Error(message || "Failed to update company details");
        }
      }

      localStorage.removeItem(`companyInfo_${companyId}`);
      await updateCompanyOnboardingStatus({
        userId: user?.id || "",
        companyId: companyId || "",
      });
      setConfirmOpen(false);
      toast.success("Company details saved. Proceeding to next step...");
    } catch (error: any) {
      toast.error(error.message || "Failed to save company details");
    } finally {
      setIsLoading(false);
    }
  };

  // useEffect(() => {
  //   let isMounted = true;
  //   async function load() {
  //     if (!companyId) return;

  //     const db = await fetchCompanyDetails(companyId);
  //     const saved = JSON.parse(
  //       localStorage.getItem(`companyInfo_${companyId}`) || "null"
  //     ) as Partial<CompanyData> | null;

  //     if (isMounted) setInitialData(mergeInitialData(db, saved));
  //   }
  //   load();
  //   return () => {
  //     isMounted = false;
  //   };
  // }, [companyId]);

  // useEffect(() => {
  //   if (initialData) {
  //     reset(initialData, { keepDefaultValues: false, keepValues: false });
  //   }
  // }, [initialData, reset]);

  useEffect(() => {
    if (companyDetailsRes?.data) {
      reset(companyDetailsRes.data);
    }
  }, [companyDetailsRes?.data, reset]);

  useEffect(() => {
    if (controlledInputError) {
      const timeout = setTimeout(() => {
        setControlledInputError(null);
      }, 5000);

      return () => clearTimeout(timeout);
    }
  }, [controlledInputError]);

  // Handle scroll to track position
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    const handleScroll = () => {
      const scrollTop = scrollContainer.scrollTop;
      const scrollHeight = scrollContainer.scrollHeight;
      const clientHeight = scrollContainer.clientHeight;
      const maxScroll = scrollHeight - clientHeight;
      const scrollPercentage =
        maxScroll > 0 ? (scrollTop / maxScroll) * 100 : 0;
      setScrollPosition(scrollPercentage);
    };

    scrollContainer.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => scrollContainer.removeEventListener("scroll", handleScroll);
  }, [scrollContainerRef.current]);

  // Update showQuickSubmit based on form completion and scroll position
  useEffect(() => {
    const isComplete = checkEssentialFieldsComplete();
    const isInUpperPortion = scrollPosition < 70; // Show when not near bottom
    const shouldShow = isComplete && isInUpperPortion && !isManuallyDismissed;

    setShowQuickSubmit(shouldShow);
  }, [watch(requiredFields), scrollPosition, isManuallyDismissed]);

  // Save form data to local storage
  useEffect(() => {
    const autosave = debounce(() => {
      const formData = getValues();
      localStorage.setItem(
        `companyInfo_${companyId}`,
        JSON.stringify(formData)
      );
    }, 500);
    const subscription = watch(() => autosave()); // Save on every change
    return () => {
      subscription.unsubscribe();
      autosave.cancel();
    };
  }, [watch, getValues, companyId]);

  if (!isLoggedIn) {
    return <ErrorPage type="403" />;
  }

  if (isLoading || isCompanyDetailsLoading || sessionLoading) {
    return <CenteredLoader fullscreen />;
  }

  if (!companyDetailsRes?.data || !companyId) {
    return (
      <ErrorPage type="default" showHeader={false} className="min-h-0 h-full" />
    );
  }

  return (
    <div className="p-4 md:p-6 flex-1 relative" ref={scrollContainerRef}>
      <form className="space-y-8 ">
        <ImageUploader
          label="Company logo / icon"
          labelPosition="bottom"
          initialImage={watch("companyLogo")}
          onUpload={handleUpload}
          onRemove={watch("companyLogo") ? handleRemove : undefined}
          onError={handleError}
          metadata={{ companyId }}
          accept="image/png,image/jpeg,image/jpg"
          className="p-0"
        />
        {/* Basic Company Information */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-muted-foreground border-b">
            Company Information
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField
              label="Legal Name"
              required
              error={
                controlledInputError?.legalName ||
                errors.legalName?.message ||
                ""
              }
              onClick={() => {
                setControlledInputError((prev) => ({
                  ...prev,
                  legalName: "Contact support to change legal name",
                }));
              }}
            >
              <Input
                {...register("legalName", { required: true })}
                disabled
                readOnly
              />
            </FormField>
            <FormField
              label="Display Name"
              helpTooltip="Name displayed in app"
              tooltipStyle="w-full"
              required
            >
              <Input {...register("displayName", { required: true })} />
            </FormField>
            <FormField
              label="Company Type"
              required
              error={
                controlledInputError?.companyType ||
                errors.companyType?.message ||
                ""
              }
              onClick={() => {
                setControlledInputError((prev) => ({
                  ...prev,
                  companyType: "Company type cannot be changed",
                }));
              }}
            >
              <Controller
                name="companyType"
                control={control}
                render={({ field }) => (
                  <Input
                    value={getCompanyTypeDisplay(field.value)} // Transform for display
                    readOnly
                    disabled
                  />
                )}
              />
            </FormField>
            <FormField
              id="industry"
              label="Industry"
              error={errors.industry?.message}
              helpTooltip={TOOLTIP.industry || ""}
              className="w-full"
              required
            >
              <AutocompleteDropdown
                id="industry"
                items={
                  isIndustriesLoading
                    ? [{ value: "loading", label: "Loading..." }]
                    : isIndustriesError
                    ? [{ value: "error", label: "Error loading industries" }]
                    : industries || []
                }
                mapItem={(item) => ({
                  value: item.label,
                  label: item.shortLabel,
                })}
                placeholder="Select industry"
                value={watch("industry") || ""}
                onValueChange={(value) => handleChange("industry", value)}
              />
            </FormField>
          </div>
        </div>

        {/* Registration & Legal Details */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-muted-foreground border-b">
            Registration & Legal
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField label="Company Registration Number">
              <Input
                {...register("companyRegistrationNumber")}
                placeholder="Not Incorporated"
              />
            </FormField>
            <FormField label="Tax Identification Number">
              <Input {...register("companyTaxId")} placeholder="X1101234567" />
            </FormField>
          </div>
        </div>
        {/* Location & Currency */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-muted-foreground border-b">
            Location & Currency
          </h3>
          <FormField label="Address">
            <Input {...register("address")} placeholder="123 Main Street" />
          </FormField>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField
              id="countryId"
              label="Country"
              required
              error={
                controlledInputError?.countryId ||
                errors.countryId?.message ||
                ""
              }
              onClick={() =>
                setControlledInputError((prev) => ({
                  ...prev,
                  countryId: "Contact support to change country",
                }))
              }
              errorTooltip
              errorTooltipStyle="w-full"
            >
              <AutocompleteDropdown
                id="countryId"
                items={
                  isCountryLoading
                    ? [{ value: "loading", label: "Loading..." }]
                    : countries?.data || []
                }
                mapItem={(item) => ({
                  value: item.id,
                  label: `${item.flag} ${item.name}`,
                })}
                placeholder="Select country"
                aria-describedby={
                  errors.countryId ? "countryId-error" : undefined
                }
                onValueChange={(value) => handleChange("countryId", value)}
                value={watch("countryId") || ""}
                disabled
              />
            </FormField>
            <FormField
              id="reportingCurrencyId"
              label="Reporting Currency"
              required
              error={
                controlledInputError?.reportingCurrencyId ||
                errors.reportingCurrencyId?.message ||
                ""
              }
              errorTooltip
              errorTooltipStyle="w-full"
              className="flex flex-col flex-1"
              onClick={() =>
                setControlledInputError((prev) => ({
                  ...prev,
                  reportingCurrencyId: "Reporting currency cannot be changed",
                }))
              }
            >
              <AutocompleteDropdown
                id="reportingCurrencyId"
                items={
                  isCurrencyLoading
                    ? [{ value: "loading", label: "Loading..." }]
                    : currencies?.data || []
                }
                mapItem={(item) => ({
                  value: item.id,
                  label: `${item.name} (${item.symbol})`,
                })}
                value={watch("reportingCurrencyId") || ""}
                onValueChange={(value) =>
                  handleChange("reportingCurrencyId", value)
                }
                placeholder="Select currency"
                aria-describedby={
                  errors.reportingCurrencyId
                    ? "reportingCurrencyId-error"
                    : undefined
                }
                disabled
              />
            </FormField>
          </div>
        </div>
        {/* Business Details */}
        {!isIndividual && (
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-muted-foreground border-b">
              Business & Accounting
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                id="revenue"
                label="Annual Revenue"
                error={errors.revenue?.message}
              >
                <Select
                  onValueChange={(value) => handleChange("revenue", value)}
                  value={watch("revenue") || ""}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose revenue range" />
                  </SelectTrigger>
                  <SelectContent>
                    {COMPANY_REVENUE_RANGE.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>{" "}
              </FormField>
              <FormField
                id="companySize"
                label="Company size"
                error={errors.companySize?.message}
              >
                <Select
                  onValueChange={(value) => handleChange("companySize", value)}
                  value={watch("companySize") || ""}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select company size" />
                  </SelectTrigger>
                  <SelectContent>
                    {COMPANY_SIZE.map((size) => (
                      <SelectItem key={size.value} value={size.value}>
                        {size.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField
                id="website"
                label="Website"
                error={errors.website?.message}
                helpTooltip={TOOLTIP.website}
                tooltipStyle="w-full"
              >
                <Input
                  id="website"
                  {...register("website")}
                  onChange={(e) => handleChange("website", e.target.value)}
                  aria-describedby={
                    errors.website ? "website-error" : undefined
                  }
                  placeholder="yourcompany.com"
                />
              </FormField>
              <FormField
                id="fiscalPeriod"
                label="Financial Year End"
                helpTooltip={TOOLTIP.yearEnd}
                required
                error={
                  errors.yearEndDay?.message ||
                  errors.yearEndMonth?.message ||
                  errors.root?.message
                }
                errorTooltip
                errorTooltipStyle="w-full"
              >
                <div className="grid md:grid-cols-2 gap-1">
                  <div className="relative">
                    <Select
                      onValueChange={(value) =>
                        setValue("yearEndDay", Number(value), {
                          shouldValidate: true,
                        })
                      }
                      value={watch("yearEndDay")?.toString() || "31"}
                    >
                      <SelectTrigger className="w-full [&_svg]:hidden">
                        <SelectValue placeholder="Select day" />
                      </SelectTrigger>
                      <SelectContent>
                        {days.map((day) => (
                          <SelectItem key={day} value={day.toString()}>
                            {day}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {watch("yearEndDay") && (
                      <span className="text-[0.75rem] text-muted-foreground/50 absolute top-1/4 right-1">
                        Day
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <Select
                      onValueChange={(value) =>
                        setValue("yearEndMonth", Number(value), {
                          shouldValidate: true,
                        })
                      }
                      value={watch("yearEndMonth")?.toString() || "12"}
                    >
                      <SelectTrigger className="w-full [&_svg]:hidden">
                        <SelectValue placeholder="Month" />
                      </SelectTrigger>
                      <SelectContent>
                        {months.map((month) => (
                          <SelectItem key={month} value={month.toString()}>
                            {month}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {watch("yearEndMonth") && (
                      <span className="text-[0.75rem] text-muted-foreground/50 absolute top-1/4 right-1">
                        Month
                      </span>
                    )}
                  </div>
                </div>
              </FormField>
              {isAccountingFirm && (
                <>
                  <FormField
                    label="Slug"
                    helpTooltip="This is what your clients will use to identify you on the platform e.g kpmg.getaccountable.com, your slug will be kpmg. The shorter the better."
                    tooltipStyle="text-center"
                    required
                    error={`${
                      errors.assignedFirmSlug?.message || slugTakenMessage
                    }`}
                    errorTooltip
                    errorTooltipStyle="text-center"
                  >
                    <Input
                      placeholder="e.g. kpmg, afandco"
                      {...register("assignedFirmSlug", {
                        validate: async (value) => {
                          const trimmedValue = value?.trim() ?? "";
                          const { isValid, error } = validateSlug(trimmedValue);
                          if (!isValid) {
                            return error;
                          }
                          if (isFetching) return "Checking...";

                          if (!isFetching && isSlugTaken) {
                            return slugTakenMessage;
                          }

                          return true;
                        },
                      })}
                    />
                  </FormField>
                  <FormField
                    id="accountingBasis"
                    label="Accounting Basis"
                    error={errors.accountingBasis?.message}
                  >
                    <Select
                      onValueChange={(value) =>
                        handleChange("accountingBasis", value)
                      }
                      value={watch("accountingBasis") || ""}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select accounting basis" />
                      </SelectTrigger>
                      <SelectContent>
                        {ACCOUNTING_BASIS.map((a) => (
                          <SelectItem key={a.value} value={a.value}>
                            {a.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                </>
              )}
            </div>
          </div>
        )}
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-muted-foreground border-b">
            Other
          </h3>
          <FormField id="description" label="Description">
            <Textarea
              {...register("description")}
              onChange={(e) =>
                handleChange("description", DOMPurify.sanitize(e.target.value))
              }
              className={cn("resize-none mb-6")}
              placeholder="Tell us a bit about your company"
            />
          </FormField>
        </div>
        {/* Form navigation */}
        <div
          className="pb-4 flex justify-center md:justify-between"
          data-footer
        >
          {!isMobile && (
            <Button type="button" variant="outline" disabled>
              Previous
            </Button>
          )}
          <Button type="button" onClick={handleInitialSubmit}>
            Submit and Continue
          </Button>
        </div>
      </form>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="sm:max-w-[425px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-center">
              Confirm Company Details
            </AlertDialogTitle>
            <AlertDialogDescription className="text-destructive sr-only">
              Critical: Most company details cannot be changed once saved.
              Please review everything carefully.
            </AlertDialogDescription>
            <hr />
          </AlertDialogHeader>
          <div className=" flex flex-col justify-center items-center gap-4">
            <p className="text-center">
              <span className="font-semibold text-destructive">
                Are you sure all details are correct?
              </span>{" "}
              <br />
              <span className="text-sm text-muted-foreground">
                Most company settings become permanent once saved and cannot be
                modified.
              </span>
            </p>
            {/* Summarize other fields */}
            <div className="-mb-2">
              <div className="flex items-center justify-center gap-2">
                <Button
                  disabled={isLoading || isSubmitting}
                  onClick={handleSubmit}
                >
                  Yes, Submit
                </Button>
                <Button onClick={() => setConfirmOpen(false)} variant="outline">
                  Not sure
                </Button>
              </div>
              <span className="italic text-xs text-muted-foreground/70">
                Request a callback if you need some help
              </span>
            </div>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {showQuickSubmit && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 md:translate-x-00 z-50 w-xs md:max-w-xs overflow-hidden rounded-md">
          <div className="animate-in slide-in-from-bottom-8 fade-in-0 duration-500 ease-out">
            <div className="relative bg-linear-to-r from-cyan-700 via-blue-500 to-indigo-600 z-50">
              {/* Animated background sparkles #00d3f2, #2b7fff #4f39f6*/}
              <div className="absolute inset-0 overflow-hidden rounded-2xl">
                <div className="absolute -top-1 -left-1 w-3 h-3 bg-white/30 rounded-full animate-pulse"></div>
                <div className="absolute top-3 right-4 w-2 h-2 bg-white/40 rounded-full animate-pulse delay-300"></div>
                <div className="absolute bottom-4 left-6 w-1.5 h-1.5 bg-white/50 rounded-full animate-pulse delay-700"></div>
              </div>

              {/* Content */}
              <div className="px-4 py-3 bg-black/10 text-white flex flex-col gap-2 relative z-50">
                <p className="text-center text-white/80">
                  You've completed the essential fields. Continue or scroll to
                  submit
                </p>
                <div className="flex gap-2 justify-center">
                  <Button
                    size="sm"
                    variant="link"
                    className="bg-transparent cursor-pointer text-white"
                    onClick={scrollToSubmit}
                  >
                    Scroll to Submit
                  </Button>
                  <Button size="sm" onClick={dismissQuickSubmit}>
                    Continue Form
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

CompanyInfo.displayName = "CompanyInfo";
CompanyInfo.whyDidYouRender = true;
