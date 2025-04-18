import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StepProgress } from "@/components/StepProgress/StepProgress";
import { useEffect, useRef, useState } from "react";
import { CompanyType, CountryList } from "@/types/types";
import { Button } from "@/components/ui/button";
import {
  defaultMockCompany,
  NewCompany,
  NewFirm,
  newUser,
  NewUser,
} from "./signupTypes";
import { useSearchParams } from "react-router-dom";
import { typeToFlattenedError } from "zod";
import { useCountries } from "@/hooks/useCountries";
import { getDefaultCurrencyForCountry } from "@/constants/countryCurrencyMap";
import { useCurrencies } from "@/hooks/useCurrencies";
import { SignupSelector } from "./steps/SignupSelector";
import {
  SignupBasicInfo,
  SignupBasicInfoHandle,
} from "./steps/SignupBasicInfo";
import { SignupCompanyInfo } from "./steps/SignupCompanyInfo";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
export default function Signup() {
  const [searchParams] = useSearchParams();
  const prefillEmail = searchParams.get("email") || "";

  const [currentStep, setCurrentStep] = useState(1);
  const [selectedType, setSelectedType] = useState<CompanyType | null>(null);

  const [basicInfo, setBasicInfo] = useState<NewUser>({
    email: prefillEmail,
    password: "",
    firstname: "",
    lastname: "",
  });
  // const [basicInfoError, setBasicInfoError] =
  //   useState<typeToFlattenedError<NewUser>>();
  const [basicInfoError, setBasicInfoError] = useState<any>();

  const [companyDetails, setCompanyDetails] =
    useState<NewCompany>(defaultMockCompany);
  const [firmDetails, setFirmDetails] = useState<NewFirm>({});

  const [formData, setFormData] = useState({});
  const [error, setError] = useState<string>("");

  // This tracks whether the user has explicitly selected a reporting currency.
  // If true, we won't auto-set the currency based on country anymore.
  const userHasSelectedCurrency = useRef(false);

  const steps = ["Get started", "Basic Info", "Company Details"];

  const { data: country } = useCountries();

  const { data: currencies } = useCurrencies();

  const basicInfoRef = useRef<SignupBasicInfoHandle>(null);

  const checkEmail = async (email: string) => {
    // Placeholder API call
    return true; // true if email is available
  };

  const { trigger } = useForm<NewUser>({
    resolver: zodResolver(newUser),
    defaultValues: basicInfo,
  });

  const handleBack = () => {
    if (currentStep === 2) setSelectedType(null);

    selectedType && currentStep > 1
      ? setCurrentStep((prev) => prev - 1)
      : setCurrentStep(1);
  };
  const handleContinue = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();

    if (currentStep === 1) {
      if (!selectedType) {
        setError("Please choose a category to proceed.");
        return;
      }
      setCompanyDetails((prev) => ({ ...prev, type: selectedType }));
      setCurrentStep(currentStep + 1);
    }

    if (currentStep === 2) {
      const isValid = await basicInfoRef.current?.validate();
      if (!isValid) return;
      if (!(await checkEmail(basicInfo.email))) {
        setError("Email already exists");
        return;
      }
      setCurrentStep(currentStep + 1);
    }

    if (currentStep === steps.length) {
      // Handle form submission
      setFormData({
        selectedType,
        ...basicInfo,
        ...companyDetails,
      });
      console.log("Form submitted:", formData);
    }
  };

  const handleSelect = (category: CompanyType) => {
    if (!category) return;
    if (currentStep === 1) setSelectedType(category);
    setError("");
  };

  const handleBasicInfoChange = (key: keyof NewUser, value: string) => {
    setBasicInfo((prev) => ({ ...prev, [key]: value }));
  };

  const getCountryFromLocale = (): CountryList | undefined => {
    const locale = navigator.language;
    const countryCode = locale.split("-")[1];
    const userCountry =
      country && country?.data?.find((item) => item.code === countryCode);
    return userCountry;
  };

  const getDefaultCurrency = () => {
    const ctry = companyDetails.countryId
      ? country?.data?.find((item) => item.id === companyDetails.countryId)
      : "";
    const userCountry = ctry || getCountryFromLocale();
    const curr = userCountry
      ? getDefaultCurrencyForCountry(userCountry?.code)
      : "";

    console.log(userCountry, "Curr: ", curr);

    return curr;
  };

  const handleDetailsChange = (
    field: keyof NewCompany | keyof NewFirm,
    value: string
  ) => {
    const isFirm =
      selectedType === "accounting_firm" ||
      companyDetails.type === "accounting_firm";

    const sharedFields: (keyof NewCompany & keyof NewFirm)[] = [
      "legalName",
      "countryId",
    ];

    // Aliases for semantically similar fields with different names
    const aliasFields: Record<string, keyof NewCompany | keyof NewFirm> = {
      firmSize: "teamSize",
      teamSize: "firmSize",
    };

    const alias = aliasFields[field as string];

    if (sharedFields.includes(field as keyof NewCompany & keyof NewFirm)) {
      setCompanyDetails((prev) => ({ ...prev, [field]: value }));

      if (isFirm) {
        setFirmDetails((prev) => ({ ...prev, [field]: value }));
      }
    }

    // If user manually selects a currency, mark the override flag
    if (field === "reportingCurrencyId") {
      userHasSelectedCurrency.current = true;
    }

    // 1. Handle shared fields like legalName, countryId
    if (sharedFields.includes(field as keyof NewCompany & keyof NewFirm)) {
      setCompanyDetails((prev) => ({ ...prev, [field]: value }));

      if (isFirm) {
        setFirmDetails((prev) => ({ ...prev, [field]: value }));
      }
    }

    // 2. Handle alias fields like firmSize ↔ teamSize
    else if (alias) {
      // Update company side
      if (field in companyDetails || alias in companyDetails) {
        setCompanyDetails((prev) => ({
          ...prev,
          [field in companyDetails ? field : alias]: value,
        }));
      }

      // Update firm side only if applicable
      if (isFirm && (field in firmDetails || alias in firmDetails)) {
        setFirmDetails((prev) => ({
          ...prev,
          [field in firmDetails ? field : alias]: value,
        }));
      }
    }
    // 3. Handle form-specific fields
    else {
      if (field in companyDetails) {
        setCompanyDetails((prev) => ({
          ...prev,
          [field]: value,
        }));
      }

      if (isFirm && field in firmDetails) {
        setFirmDetails((prev) => ({
          ...prev,
          [field]: value,
        }));
      }
    }
  };

  let stepContent;
  if (currentStep === 1) {
    stepContent = (
      <SignupSelector
        selectCompanyType={handleSelect}
        selectedType={selectedType}
        error={error}
      />
    );
  }

  if (currentStep === 2) {
    stepContent = (
      <SignupBasicInfo
        ref={basicInfoRef}
        userData={basicInfo}
        updateUserField={handleBasicInfoChange}
        checkEmail={checkEmail}
      />
    );
  }

  if (currentStep === 3 && selectedType) {
    stepContent = (
      <SignupCompanyInfo
        companyDetails={companyDetails}
        firmDetails={firmDetails}
        onChange={handleDetailsChange}
        userType={selectedType}
      />
    );
  } else if (currentStep > 1 && !selectedType) {
    stepContent = (
      <div className="flex flex-col items-center gap-2">
        Please revert to step 1 to select valid category
        <Button
          variant={"destructive"}
          onClick={() => setCurrentStep(1)}
          className="max-w-[5rem]"
        >
          Back
        </Button>
      </div>
    );
  }

  useEffect(() => {
    if (!country?.data) return;
    const userCountry = getCountryFromLocale();
    if (userCountry?.id && !companyDetails.countryId) {
      setCompanyDetails((prev) => ({
        ...prev,
        countryId: userCountry.id,
      }));
    }
  }, [country?.data, companyDetails.countryId]);

  useEffect(() => {
    // Only run when currency list is ready and a country is selected
    if (
      !currencies?.data ||
      !companyDetails.countryId ||
      userHasSelectedCurrency.current // ❌ Stop if user already picked one manually
    ) {
      return;
    }

    // Get the default currency code for the selected country
    const defaultCurrencyCode = getDefaultCurrency();
    const defaultCurrency = currencies?.data?.find(
      (c) => c.code === defaultCurrencyCode
    );

    // Only set if the default is different from what's already set
    if (
      defaultCurrency &&
      companyDetails.reportingCurrencyId !== defaultCurrency.id
    ) {
      setCompanyDetails((prev) => ({
        ...prev,
        reportingCurrencyId: defaultCurrency?.id,
      }));
    }
  }, [currencies?.data, companyDetails.countryId]);

  return (
    <div className="flex flex-1 w-full items-center justify-center p-6 md:p-10">
      <div className="flex w-full max-w-md flex-col gap-6 relative">
        <img
          src="./icon.svg"
          alt=""
          className="absolute right-1/2 bottom-3/5 -z-5 opacity-10 h-100 w-100"
        />
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">
              {selectedType === "accounting_firm" && currentStep === 3
                ? "Your Practice's Details"
                : steps[currentStep - 1]}
            </CardTitle>
            <StepProgress
              currentStep={currentStep}
              totalSteps={steps.length}
              steps={steps}
            />
          </CardHeader>
          <CardContent className="min-h-50">
            <form>{stepContent}</form>
          </CardContent>
          {
            <CardFooter className="py-2">
              <div className="flex justify-between w-full">
                <Button
                  variant="outline"
                  disabled={currentStep === 1}
                  onClick={handleBack}
                >
                  Back
                </Button>

                {selectedType && (
                  <Button onClick={handleContinue}>
                    {currentStep === steps.length ? "Submit" : "Continue"}
                  </Button>
                )}
              </div>
            </CardFooter>
          }
        </Card>
        <div className="text-balance text-center text-xs text-muted-foreground [&_a]:underline [&_a]:underline-offset-4 [&_a]:hover:text-primary  ">
          By clicking continue, you agree to our{" "}
          <a href="#">Terms of Service</a> and <a href="#">Privacy Policy</a>.
        </div>
      </div>
    </div>
  );
}
