import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  newCompany,
  NewCompany,
  newFirm,
  NewFirm,
  NewUser,
} from "../signupTypes";
import { CompanyType, CountryList } from "@/types/types";
import { useIndustries } from "@/hooks/useIndustries";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { AutocompleteDropdown } from "@/components/AutocompleteDropdown/AutocompleteDropdown";
import { useCountries } from "@/hooks/useCountries";
import { useCurrencies } from "@/hooks/useCurrencies";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { FormField, FormFieldLabel } from "@/components/FormField";
import {
  COMPANY_SIZE,
  COMPANY_TYPES,
  TOOLTIP,
} from "../constants/signupConstants";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TooltipHelper } from "@/components/TooltipHelper";

export interface SignupCompanyInfoHandle {
  validate: () => Promise<boolean>;
}
export const SignupCompanyInfo = forwardRef<
  SignupCompanyInfoHandle,
  {
    companyData: NewCompany;
    firmData: NewFirm;
    userData: NewUser;
    updateCompanyField: (
      field: keyof NewCompany | keyof NewFirm,
      value: string
    ) => void;
    userType: CompanyType;
  }
>(({ companyData, firmData, userData, updateCompanyField, userType }, ref) => {
  const isFirm = userType === "accounting_firm";
  const isIndividual = userType === "individual";
  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  const [isDescriptonTouched, setIsDescriptionTouched] = useState(false);
  const [viewOptionalFields, setViewOptionalFields] = useState(false);
  const {
    data: industries,
    isLoading: isIndustriesLoading,
    isError: isIndustriesError,
  } = useIndustries();

  const {
    data: currencies,
    isLoading: isCurrencyLoading,
    isError: isCurrencyError,
  } = useCurrencies();

  const {
    data: countries,
    isLoading: isCountryLoading,
    isError: isCountryError,
  } = useCountries();

  const schema = isFirm ? newFirm : newCompany;

  const defaultValues = isFirm
    ? firmData
    : {
        ...companyData,
        legalName: isIndividual
          ? `${userData.firstname}'s Finances`.trim()
          : companyData.legalName,
      };

  const {
    register,
    watch,
    formState: { errors },
    setValue,
    trigger,
  } = useForm<NewCompany | NewFirm>({
    resolver: zodResolver(schema),
    defaultValues,
    mode: "onChange",
  });

  const description = watch("description") || "";
  const showOptionalFieldsButton =
    viewOptionalFields || isDescriptonTouched || description.length > 0;

  useImperativeHandle(ref, () => ({
    validate: async () => await trigger(),
  }));

  const handleChange = (
    field: keyof NewCompany | keyof NewFirm,
    value: string | number
  ) => {
    setValue(field, value);
    updateCompanyField(field, value.toString());
  };

  return (
    <div>
      <div className="flex flex-col gap-4">
        {/* Legal Name */}
        <FormField
          id="legalName"
          label={isFirm ? "Practice Name" : "Company Name"}
          error={errors.legalName?.message}
          required
        >
          {userType && (
            <div className="text-[0.75rem] text-chart-2 absolute right-3 top-[55%]">
              {COMPANY_TYPES.find((t) => t.key === userType)?.type || ""}
            </div>
          )}
          <Input
            id="legalName"
            {...register("legalName")}
            onChange={(e) => handleChange("legalName", e.target.value)}
            aria-describedby={errors.legalName ? "legalName-error" : undefined}
            placeholder={
              isIndividual
                ? `${userData?.firstname}'s Finances`
                : isFirm
                ? "Jerome and Associates"
                : "Acme Ltd"
            }
          />
        </FormField>

        <div className="grid md:grid-cols-2 gap-2 -w-full overflow-hidden">
          {/* // Country */}
          <FormField
            id="country"
            label="Country"
            required
            helpTooltip={TOOLTIP.country}
            tooltipStyle="w-full"
            error={errors.countryId?.message}
            errorTooltip={errors.countryId?.message}
          >
            <AutocompleteDropdown
              id="country"
              items={
                isCountryLoading
                  ? [{ value: "loading", label: "Loading..." }]
                  : isCountryError
                  ? [{ value: "error", label: "Error loading countries" }]
                  : countries?.data || []
              }
              mapItem={(item) => ({
                value: item.id,
                label: `${item.flag} ${item.name}`,
              })}
              value={watch("countryId") || ""}
              onChange={(value) => handleChange("countryId", value)}
              placeholder="Select country"
              aria-describedby={
                errors.countryId ? "countryId-error" : undefined
              }
            />
          </FormField>
          {/* <div className="space-y-2 flex flex-col flex-1"></div> */}

          {/* // Reporting Currency */}

          <div className="space-y-2 flex flex-col flex-1">
            <FormField
              id="reportingCurrencyId"
              label="Reporting Currency"
              required
              helpTooltip={TOOLTIP.reportingCurrency}
              error={errors.reportingCurrencyId?.message}
              errorTooltip={errors.reportingCurrencyId?.message}
            >
              <AutocompleteDropdown
                id="reportingCurrency"
                items={
                  isCurrencyLoading
                    ? [{ value: "loading", label: "Loading..." }]
                    : isCurrencyError
                    ? [{ value: "error", label: "Error loading countries" }]
                    : currencies?.data || []
                }
                mapItem={(item) => ({
                  value: item.id,
                  label: item.name,
                })}
                value={watch("reportingCurrencyId") || ""}
                onChange={(value) => handleChange("reportingCurrencyId", value)}
                placeholder="Select currency"
                aria-describedby={
                  errors.reportingCurrencyId
                    ? "reportingCurrencyId-error"
                    : undefined
                }
              />
            </FormField>
          </div>
        </div>
        {!isIndividual && (
          <div
            className={cn(
              "flex overflow-hidden",
              isFirm ? "grid md:grid-cols-2 gap-2" : ""
            )}
          >
            <FormField
              id="industry"
              label="Industry"
              error={errors.industry?.message}
              helpTooltip={TOOLTIP.industry || ""}
              required
              className="w-full"
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
                value={watch("industry") || ""}
                onChange={(value) => handleChange("industry", value)}
              />
            </FormField>

            {isFirm && (
              <>
                <FormField
                  id="fiscalPeriod"
                  required
                  renderLabel={
                    <FormFieldLabel
                      id="fiscalPeriod"
                      label="Financial Year End"
                      helpTooltip={TOOLTIP.yearEnd}
                      required
                    />
                  }
                >
                  <div className="grid md:grid-cols-2 gap-1">
                    <div className="relative">
                      <Select
                        onValueChange={(value) =>
                          handleChange("yearEndDay", Number(value))
                        }
                        value={watch("yearEndDay")?.toString() || ""}
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
                          handleChange("yearEndMonth", Number(value))
                        }
                        value={watch("yearEndMonth")?.toString() || ""}
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
              </>
            )}
          </div>
        )}

        <div
          className={cn("flex flex-col", !isIndividual ? "-mb-[1.75rem]" : "")}
        >
          <FormField
            id="description"
            label="Description"
            helpTooltip={TOOLTIP.description}
          >
            <Textarea
              placeholder={
                isIndividual
                  ? "Tell us a bit about yourself"
                  : isFirm
                  ? "Tell us a bit about your practice"
                  : "Tell us a bit about your company"
              }
              className={cn(
                "resize-none mb-6",
                showOptionalFieldsButton || isIndividual ? "mb-0" : ""
              )}
              value={description}
              onChange={(e) => {
                const value = e.target.value;
                setValue("description", value);
                updateCompanyField("description", value);
              }}
              onFocus={() => setIsDescriptionTouched(true)}
              onBlur={() => {
                setTimeout(() => {
                  !viewOptionalFields && setIsDescriptionTouched(false);
                }, 2000);
              }}
            />
          </FormField>
          {!isIndividual && showOptionalFieldsButton && (
            <div>
              <div
                className={cn(
                  "flex items-center justify-center",
                  !isIndividual && showOptionalFieldsButton
                    ? "pointer-events-auto opacity-100"
                    : "pointer-events-none opacity-0"
                )}
              >
                <TooltipHelper
                  contentStyle="w-full"
                  trigger={
                    <Button
                      type="button"
                      variant="link"
                      className={
                        "text-muted-foreground hover:text-foreground p-1 h-6 self-center cursor-pointer"
                      }
                      onMouseDown={(e) => {
                        e.preventDefault();
                        // setIsDescriptionTouched(true);
                        setViewOptionalFields(true);
                      }}
                    >
                      Fill other optional fields
                    </Button>
                  }
                  content="You can always complete these later"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Optional Fields */}
      {/* {!isIndividual && viewOptionalFields && ( */}
      <div
        className={cn(
          "bg-card z-50 inset-0 w-full py-4 border-[1px] rounded-sm absolute top-[17%] md:top-1/3",
          "transition-all duration-500 ease transform",
          viewOptionalFields && !isIndividual
            ? "opacity-100 scale-100 pointer-events-auto"
            : "opacity-0 scale-95 pointer-events-none"
        )}
      >
        <div className="flex flex-col">
          <div className="text-sm px-6 pb-2 flex justify-between">
            <span>Optional Fields</span>
            <span
              className="text-muted-foreground hover:underline cursor-pointer"
              onClick={() => setViewOptionalFields(false)}
            >
              Hide
            </span>
          </div>
          <hr className="py-2" />
          <div className="opacity-75 flex flex-col gap-3 px-6">
            <div className="grid md:grid-cols-2 gap-2">
              <FormField
                id="registrationNumber"
                label="Company Reg No."
                error={errors.registrationNumber?.message}
                helpTooltip={TOOLTIP.registrationNumber}
                tooltipStyle="text-center"
              >
                <Input
                  id="registrationNumber"
                  {...register("registrationNumber")}
                  onChange={(e) =>
                    handleChange("registrationNumber", e.target.value)
                  }
                  aria-describedby={
                    errors.registrationNumber
                      ? "registrationNumber-error"
                      : undefined
                  }
                  placeholder="12345678"
                />
              </FormField>
              <FormField
                id="taxId"
                label="Tax ID"
                error={errors.taxId?.message}
                helpTooltip={TOOLTIP.taxId}
                tooltipStyle="text-center"
              >
                <Input
                  id="taxId"
                  {...register("taxId")}
                  onChange={(e) => handleChange("taxId", e.target.value)}
                  aria-describedby={errors.taxId ? "taxId-error" : undefined}
                  placeholder="AB123456C"
                />
              </FormField>
            </div>

            <div className="grid md:grid-cols-2 gap-2">
              <FormField
                id="teamSize"
                label="Company size"
                error={errors.teamSize?.message}
              >
                <Select
                  onValueChange={(value) =>
                    handleChange(isFirm ? "firmSize" : "teamSize", value)
                  }
                  value={watch(isFirm ? "firmSize" : "teamSize") || ""}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select company size" />
                  </SelectTrigger>
                  <SelectContent>
                    {COMPANY_SIZE.map((size) => (
                      <SelectItem value={size.value}>{size.label}</SelectItem>
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
            </div>

            <FormField label="Address">
              <Input
                placeholder="123 Main Street, New York, NY"
                // className="resize-none"
              />
            </FormField>

            <Button
              type="button"
              variant="outline"
              onClick={() => setViewOptionalFields(false)}
            >
              Done
            </Button>
          </div>
        </div>
      </div>
      {/* )} */}
    </div>
  );
});
