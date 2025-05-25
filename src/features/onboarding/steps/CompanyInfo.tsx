import { AutocompleteDropdown } from "@/components/AutocompleteDropdown/AutocompleteDropdown";
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
import { getCompanyDetails } from "@/domains/company/api";
import { useCompany } from "@/domains/company/store";
import { CompanyData } from "@/domains/company/types";
import {
  getCompanyTypeDisplay,
  getDefaultCompanyData,
} from "@/domains/company/utils";
import { deleteObject, uploadObject } from "@/domains/objects/api";
import { ImageUploader } from "@/domains/objects/ImageUploader";
import { TOOLTIP } from "@/features/signup/signupConstants";
import { useIsMobile } from "@/hooks/use-mobile";
import { useIndustries } from "@/hooks/useIndustries";
import { cn } from "@/lib/utils";
import { ChangeEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export const CompanyInfo = () => {
  const { company, companyId, companyType } = useCompany();
  const {
    data: industries,
    isLoading: isIndustriesLoading,
    isError: isIndustriesError,
  } = useIndustries();
  const isMobile = useIsMobile();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [c, setCompanyDetails] = useState<CompanyData>(getDefaultCompanyData());
  const [showQuickSubmit, setShowQuickSubmit] = useState(false);
  const [isManuallyDismissed, setIsManuallyDismissed] = useState(false);
  const [scrollPosition, setScrollPosition] = useState(0);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const isAccountingFirm = companyType === "accounting_firm";

  const fetchCompanyDetails = async () => {
    if (!companyId) {
      setError("Company ID is missing");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      if (company && company?.companyLogo) {
        setCompanyDetails(company);
      } else {
        const res = await getCompanyDetails(companyId);
        if (res.success && res.data) {
          setCompanyDetails(res.data);
          setError(null);
        } else {
          setError(res.message || "Failed to fetch company details");
        }
      }
    } catch (err: any) {
      setError(err.message || "Failed to fetch company details");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpload = async (file: File) => {
    if (!companyId) {
      setError("Cannot upload: Company ID is missing");
      return null;
    }

    const params = { file, companyId: companyId! };
    const response = await uploadObject("logos", params);
    if (response.success && response.data) {
      setCompanyDetails((prev) => ({
        ...prev,
        companyLogo: response.data?.url,
        companyLogoKey: response.data?.key,
      }));
      setError(null);
      return { url: response.data.url, key: response.data.key };
    }
    setError(response.message || "Upload failed");
    return null;
  };

  const handleRemove = async (key: string) => {
    const response = await deleteObject("logos", key);
    if (response.success) {
      setCompanyDetails((prev) => ({
        ...prev,
        companyLogo: null,
        companyLogoKey: null,
      }));
      setError(null);
    } else {
      setError(response.message || "Remove failed");
    }
  };

  const handleError = (message: string) => {
    setError(message);
    toast.error(message);
  };
  const handleInputChange =
    (key: keyof typeof c) => (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setCompanyDetails((prev) => ({
        ...prev,
        [key]: value,
      }));
    };

  // Essential required fields for quick submit
  const getRequiredFields = () => {
    const baseRequired: (keyof CompanyData)[] = [
      "legalName",
      "displayName",
      "companyType",
      "countryId",
      "reportingCurrencyId",
      // "industry",
    ];
    // const accountingRequired: (keyof Partial<CompanyData>)[] = isAccountingFirm
    //   ? ["accountingBasis", "assignedFirmSlug"]
    //   : [];
    const accountingRequired: (keyof CompanyData)[] = [];
    return [...baseRequired, ...accountingRequired];
  };

  // Check if essential fields are filled
  const checkEssentialFieldsComplete = () => {
    const requiredFields = getRequiredFields();
    return requiredFields.every(
      (field) => c[field] && c[field].toString().trim() !== ""
    );
  };

  // Handle scroll to track position
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    const handleScroll = () => {
      const scrollTop = scrollContainer.scrollTop;
      const scrollHeight = scrollContainer.scrollHeight;
      const clientHeight = scrollContainer.clientHeight;
      const scrollPercentage =
        (scrollTop / (scrollHeight - clientHeight)) * 100;

      setScrollPosition(scrollPercentage);
    };

    scrollContainer.addEventListener("scroll", handleScroll);
    return () => scrollContainer.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToSubmit = () => {
    const footer = document.querySelector("[data-footer]");
    footer?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const dismissQuickSubmit = () => {
    setIsManuallyDismissed(true);
    // Reset dismissal after 10 seconds to give another chance
    setTimeout(() => setIsManuallyDismissed(false), 10000);
  };

  // Update showQuickSubmit based on form completion and scroll position
  useEffect(() => {
    const isComplete = checkEssentialFieldsComplete();
    const isInUpperPortion = scrollPosition < 70; // Show when not near bottom
    const shouldShow = isComplete && isInUpperPortion && !isManuallyDismissed;

    setShowQuickSubmit(shouldShow);
  }, [c, scrollPosition, isManuallyDismissed]);

  useEffect(() => {
    fetchCompanyDetails();
  }, [companyId, company]);

  if (isLoading) {
    return <CenteredLoader />;
  }

  if (!companyId || !companyType || !company) {
    return (
      <ErrorPage type="default" showHeader={false} className="min-h-0 h-full" />
    );
  }

  console.log(c, companyId, companyType, company);
  return (
    <div className="p-4 md:p-6 flex-1 overflow-y-auto" ref={scrollContainerRef}>
      <form className="space-y-8 ">
        <ImageUploader
          label="Company logo / icon"
          labelPosition="bottom"
          initialImage={c.companyLogo}
          onUpload={handleUpload}
          onRemove={c.companyLogoKey ? handleRemove : undefined}
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
            <FormField label="Legal Name" required>
              <Input
                value={c.legalName}
                readOnly
                className="text-muted-foreground"
              />
            </FormField>
            <FormField
              label="Display Name"
              helpTooltip="Name displayed in app"
              required
            >
              <Input
                value={c.displayName || ""}
                onChange={handleInputChange("displayName")}
              />
            </FormField>
            <FormField label="Company Type" required>
              <Input
                value={getCompanyTypeDisplay(c.companyType)}
                readOnly
                className="text-muted-foreground"
              />
            </FormField>
            <FormField
              id="industry"
              label="Industry"
              // error={errors.industry?.message}
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
                    ? [{ value: "error", label: "Error loading countries" }]
                    : industries || []
                }
                mapItem={(item) => ({
                  value: item.label,
                  label: item.shortLabel,
                })}
                value={c.industry || ""}
                // value={watch("industry") || ""}
                // onChange={(value) => handleChange("industry", value)}
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
              <Input value={c.companyRegistrationNumber || ""} />
            </FormField>
            <FormField label="Tax Identification Number">
              <Input value={c.companyTaxId || ""} />
            </FormField>
          </div>
        </div>
        {/* Location & Currency */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-muted-foreground border-b">
            Location & Currency
          </h3>
          <FormField label="Address">
            <Input />
          </FormField>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField label="Country">
              <Input />
            </FormField>
            <FormField label="Reporting Currency">
              <Input />
            </FormField>
          </div>
        </div>
        {/* Business Details */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-muted-foreground border-b">
            Business & Accounting
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField label="Revenue">
              <Input />
            </FormField>
            <FormField label="Team Size">
              <Input />
            </FormField>
            <FormField label="Website">
              <Input />
            </FormField>
            <FormField
              id="fiscalPeriod"
              label="Financial Year End"
              helpTooltip={TOOLTIP.yearEnd}
              required
              // error={
              //   errors.yearEndDay?.message ||
              //   errors.yearEndMonth?.message ||
              //   errors.root?.message
              // }
              errorTooltip
              errorTooltipStyle="w-full"
            >
              <div className="grid md:grid-cols-2 gap-1">
                <div className="relative">
                  <Select
                    // onValueChange={(value) => handleChange("yearEndDay", value)}
                    // value={watch("yearEndDay")?.toString() || "31"}
                    value={c.yearEndDay?.toString() || "31"}
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
                  {/* {watch("yearEndDay") && (
                    <span className="text-[0.75rem] text-muted-foreground/50 absolute top-1/4 right-1">
                      Day
                    </span>
                  )} */}
                </div>
                <div className="relative">
                  <Select
                    // onValueChange={(value) => handleChange("yearEndMonth", value)}
                    // value={watch("yearEndMonth")?.toString() || "12"}
                    value={c.yearEndMonth?.toString() || "12"}
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
                  {/* {watch("yearEndMonth") && (
                    <span className="text-[0.75rem] text-muted-foreground/50 absolute top-1/4 right-1">
                      Month
                    </span>
                  )} */}
                </div>
              </div>
            </FormField>
            {c.companyType === "accounting_firm" && (
              <>
                <FormField label="Slug" required>
                  <Input />
                </FormField>
                <FormField label="Accounting Basis">
                  <Input />
                </FormField>
              </>
            )}
          </div>
        </div>
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-muted-foreground border-b">
            Other
          </h3>
          <FormField id="description" label="Description">
            <Textarea
              // {...register("description")}
              // onChange={(e) =>
              //   handleChange("description", DOMPurify.sanitize(e.target.value))
              // }
              className={cn("resize-none mb-6")}
              // value={description}
            />
          </FormField>
        </div>
        {/* Form navigation */}
        <div className="pb-4 flex justify-center md:justify-between">
          {!isMobile && (
            <Button type="submit" variant="outline" disabled>
              Previous
            </Button>
          )}
          <Button type="submit">Submit and Continue</Button>
        </div>
      </form>

      {showQuickSubmit && (
        <div
          className="fixed bottom-6 left-1/2 transform -translate-x-1/2 md:translate-x-0  z-50 w-xs md:max-w-xs overflow-hidden rounded-md"
          data-footer
        >
          <div className="animate-in slide-in-from-bottom-8 fade-in-0 duration-500 ease-out">
            <div className="relative bg-linear-to-r from-cyan-700 via-blue-500 to-indigo-600">
              {/* Animated background sparkles #00d3f2, #2b7fff #4f39f6*/}
              <div className="absolute inset-0 overflow-hidden rounded-2xl">
                <div className="absolute -top-1 -left-1 w-3 h-3 bg-white/30 rounded-full animate-pulse"></div>
                <div className="absolute top-3 right-4 w-2 h-2 bg-white/40 rounded-full animate-pulse delay-300"></div>
                <div className="absolute bottom-4 left-6 w-1.5 h-1.5 bg-white/50 rounded-full animate-pulse delay-700"></div>
              </div>

              {/* Content */}
              <div className="px-4 py-3 bg-black/10 text-white flex flex-col gap-2">
                <p className="text-center">
                  You've completed the essential fields. Continue or scroll to
                  submit
                </p>
                <div className="flex gap-2 justify-center">
                  <Button
                    size="sm"
                    variant="link"
                    className="bg-transparent cursor-pointer"
                    onClick={scrollToSubmit}
                  >
                    Scroll to submit
                  </Button>
                  <Button size="sm" onClick={dismissQuickSubmit}>
                    Continue
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
