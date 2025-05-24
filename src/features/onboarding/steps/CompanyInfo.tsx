import { FormField } from "@/components/FormField";
import ImageUploader from "@/domains/objects/ImageUploader";
import { Input } from "@/components/ui/input";
import { useState } from "react";

export const CompanyInfo = () => {
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const onImageUpload = ({ url, key }: { url: string; key: string }) => {
    setCompanyLogo(url);
    //
  };

  const onImageChange = (file: File | null) => {
    console.log(file);
    setCompanyLogo(null);
  };
  return (
    <form className="overflow-y-auto">
      <ImageUploader
        label="Company Logo or Icon"
        labelPosition="bottom"
        initialImage="https://logos.getaccountable.com/accX-4abd285b-524e-4f7c-9367-45d650d0ca97.png"
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
