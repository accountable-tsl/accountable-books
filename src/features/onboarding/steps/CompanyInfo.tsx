import { CenteredLoader } from "@/components/CenteredLoader";
import ErrorPage from "@/components/ErrorPage";
import { FormField } from "@/components/FormField";
import { Input } from "@/components/ui/input";
import { getCompanyDetails } from "@/domains/company/api";
import { companyStore, useCompany } from "@/domains/company/store";
import { deleteObject, uploadObject } from "@/domains/objects/api";
import { ImageUploader } from "@/domains/objects/ImageUploader";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const CompanyInfo = () => {
  const { company, companyId, companyType } = useCompany();
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [logoKey, setLogoKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchCompanyDetails = async () => {
    if (!companyId) {
      setError("Company ID is missing");
      setIsLoading(false);
      return;
    }

    if (company?.companyLogo) {
      setCompanyLogo(company.companyLogo);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const res = await getCompanyDetails(companyId);
      if (res.success && res.data) {
        setCompanyLogo(res.data.companyLogo || null);
        setError(null);
      } else {
        setError(res.message || "Failed to fetch company details");
      }
    } catch (err: any) {
      setError(err.message || "Failed to fetch company details");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpload = async (file: File) => {
    const params = { file, companyId: companyId! };
    const response = await uploadObject("logos", params);
    if (response.success && response.data) {
      setCompanyLogo(response.data.url);
      setLogoKey(response.data.key);
      setError(null);
      return { url: response.data.url, key: response.data.key };
    }
    setError(response.message || "Upload failed");
    return null;
  };

  const handleRemove = async (key: string) => {
    const response = await deleteObject("logos", key);
    if (response.success) {
      setCompanyLogo(null);
      setLogoKey(null);
      setError(null);
    } else {
      setError(response.message || "Remove failed");
    }
  };

  const handleError = (message: string) => {
    setError(message);
    toast.error(message);
  };

  useEffect(() => {
    fetchCompanyDetails();
  }, [companyId, company]);

  if (isLoading) {
    <CenteredLoader />;
  }

  if (!companyId || !companyType || !company) {
    return (
      <ErrorPage type="default" showHeader={false} className="min-h-0 h-full" />
    );
  }
  return (
    <form className="overflow-y-auto">
      <ImageUploader
        label="Company logo / icon"
        labelPosition="bottom"
        initialImage={companyLogo}
        onUpload={handleUpload}
        onRemove={logoKey ? handleRemove : undefined}
        onError={handleError}
        metadata={{ companyId }}
        accept="image/png,image/jpeg,image/jpg"
      />

      <FormField label="Company Name">
        <Input />
      </FormField>
      <FormField label="Display Name">
        <Input />
      </FormField>
      <FormField label="Registration Number">
        <Input />
      </FormField>
      <FormField label="Tax ID">
        <Input />
      </FormField>
      <FormField label="Country">
        <Input />
      </FormField>
      <FormField label="Reporting Currency">
        <Input />
      </FormField>
      <FormField label="Revenue">
        <Input />
      </FormField>
      {/* <FormField
                id="fiscalPeriod"
                label="Year End"
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
                        handleChange("yearEndDay", value)
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
                        handleChange("yearEndMonth", value)
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
              </FormField> */}
      <FormField label="Accounting Basis">
        <Input />
      </FormField>
      <FormField label="Slug">
        <Input />
      </FormField>
      <FormField label="Industry">
        <Input />
      </FormField>
      <FormField label="Website">
        <Input />
      </FormField>
    </form>
  );
};
