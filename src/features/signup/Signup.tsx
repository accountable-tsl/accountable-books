import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StepProgress } from "@/components/StepProgress/StepProgress";
import { useEffect, useRef, useState } from "react";
import { CompanyType, CountryList, zEmail } from "@/types/types";
import { Button } from "@/components/ui/button";
import { NewCompany, NewUser } from "./signupTypes";
import { useSearchParams } from "react-router-dom";
import { useCountries } from "@/hooks/useCountries";
import { getDefaultCurrencyForCountry } from "@/constants/countryCurrencyMap";
import { useCurrencies } from "@/hooks/useCurrencies";
import { SignupSelector } from "./steps/SignupSelector";
import {
  SignupBasicInfo,
  SignupBasicInfoHandle,
} from "./steps/SignupBasicInfo";
import { useCheckEmail } from "@/hooks/useCheckEmail";
import {
  SignupCompanyInfo,
  SignupCompanyInfoHandle,
} from "./steps/SignupCompanyInfo";
import { toast } from "sonner";
import { submitSignup } from "./signupService";
import { PuffLoader } from "react-spinners";
import { XIcon } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { AuthHeader } from "@/components/AuthHeader";

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
  const [companyDetails, setCompanyDetails] = useState<NewCompany>({
    legalName: "",
    countryId: "",
    type: "business",
    reportingCurrencyId: "",
    yearEndDay: 31,
    yearEndMonth: 12,
  });

  const [error, setError] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");

  // This tracks whether the user has explicitly selected a reporting currency.
  // If true, we won't auto-set the currency based on country anymore.
  const userHasSelectedCurrency = useRef(false);

  const steps = ["Get started", "Basic Info", "Company Details"];

  const { data: country } = useCountries();

  const { data: currencies } = useCurrencies();

  const basicInfoRef = useRef<SignupBasicInfoHandle>(null);
  const companyInfoRef = useRef<SignupCompanyInfoHandle>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const { mutateAsync: checkEmail } = useCheckEmail();

  const checkEmailWrapper = async (email: string): Promise<boolean> => {
    // try {
    const validEmail = zEmail.safeParse(email);
    if (!validEmail.success)
      throw new Error("Please enter a valid email address");
    const response = await checkEmail({ email, purpose: "signup" });
    if (!response?.success) {
      throw new Error("This email has already been registered");
    }
    return true;
  };

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
      setCompanyDetails((prev) => ({
        ...prev,
        type: selectedType,
        ...(selectedType === "accounting_firm"
          ? { industry: "Professional, Scientific, and Technical Services" }
          : {}),
      }));
      setCurrentStep(currentStep + 1);
    }

    if (currentStep === 2) {
      const isValid = await basicInfoRef.current?.validate();
      if (!isValid) {
        toast.error("Please fill in all required fields");
        return;
      }
      setCurrentStep(currentStep + 1);
    }

    if (currentStep === steps.length) {
      const isValid = await companyInfoRef.current?.validate();
      if (!isValid) {
        toast.error("Please fix the errors in your company details");
        return;
      }

      setSubmitStatus("submitting");

      try {
        const signup = await submitSignup({
          user: basicInfo,
          company: companyDetails,
        });

        if (signup.success) {
          setTimeout(() => {
            setSubmitStatus("success");
            toast.success("Signup successful");
            setError("");
          }, 1000);

          setTimeout(() => {
            window.location.href = "/";
          }, 1500);
        } else {
          setTimeout(() => {
            setSubmitStatus("error");
            setError(signup.message);
            toast.error(signup.message || "Something went wrong.");
          }, 1000);
        }
      } catch (error) {
        setTimeout(() => {
          setSubmitStatus("error");
          setError("Something went wrong. Please try again.");
          toast.error("Something went wrong. Please try again.");
        }, 1000);
      } finally {
        setIsSubmitting(false);
      }

      // Successful? Clear form, send user to dashboard or something
      // Basically log user in already, JWT and all
    }
  };

  console.log("companyDetails", companyDetails);
  console.log("basicInfo", basicInfo);
  const handleSelect = (category: CompanyType) => {
    if (!category) return;
    if (currentStep === 1) {
      setSelectedType(category);
      setCompanyDetails((prev) => ({ ...prev, type: category }));
    }
    setError("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleContinue({
        preventDefault: () => {},
      } as React.MouseEvent<HTMLButtonElement>);
    }
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

    return curr;
  };

  const handleCompanyInfoChange = (field: keyof NewCompany, value: string) => {
    // If user manually selects a currency, mark the override flag
    if (field === "reportingCurrencyId") {
      userHasSelectedCurrency.current = true;
    }

    setCompanyDetails((prev) => ({ ...prev, [field]: value }));
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
        checkEmail={checkEmailWrapper}
      />
    );
  }

  if (currentStep === 3 && selectedType) {
    stepContent = (
      <SignupCompanyInfo
        ref={companyInfoRef}
        userData={basicInfo}
        companyData={companyDetails}
        updateCompanyField={handleCompanyInfoChange}
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
    console.log(userHasSelectedCurrency.current);
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
    <div className="flex flex-col min-h-svh">
      <AuthHeader />
      <div className="flex flex-1 w-full items-center justify-center p-6 md:p-10">
        <div className="flex w-full max-w-md flex-col gap-6 relative">
          <img
            src="./icon.svg"
            alt=""
            className="absolute right-1/2 bottom-3/5 -z-5 opacity-10 h-100 w-100"
          />
          <Card className="relative">
            {!isSubmitting && submitStatus === "idle" && (
              <>
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
                  <form ref={formRef} onKeyDown={handleKeyDown}>
                    {stepContent}
                  </form>
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
              </>
            )}

            {submitStatus === "submitting" && (
              <>
                <div className="flex flex-col gap-2 justify-center items-center text-center p-16 py-22">
                  {/* <div className="flex justify-center"> */}
                  <PuffLoader color="var(--muted-foreground)" />
                  {/* </div> */}
                  <p>Creating your account...</p>
                </div>
              </>
            )}

            {submitStatus === "error" && (
              <div className="text-center text-red-600">
                <XIcon />
                <p>{error}</p>
                <Button onClick={() => setSubmitStatus("idle")}>Back</Button>
              </div>
            )}
          </Card>
          <div className="text-balance text-center text-xs text-muted-foreground [&_a]:underline [&_a]:underline-offset-4 [&_a]:hover:text-primary  ">
            By clicking continue, you agree to our{" "}
            <a href="#">Terms of Service</a> and <a href="#">Privacy Policy</a>.
          </div>
        </div>
      </div>
      <Toaster />
    </div>
  );
}
