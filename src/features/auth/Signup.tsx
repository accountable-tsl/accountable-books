import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import "./Signup.scss";
import { SignupSelector } from "./SignupSelector";
import { StepProgress } from "@/components/StepProgress/StepProgress";
import { useState } from "react";
import { SignupBasicInfo } from "./SignupBasicInfo";
import { SignupCompanyInfo } from "./SignupCompanyInfo";
import { CompanyType } from "@/types/types";
import { Button } from "@/components/ui/button";
import {
  defaultMockCompany,
  newCompany,
  NewCompany,
  NewFirm,
  newUser,
  NewUser,
} from "./SignupTypes";
import { useSearchParams } from "react-router-dom";
import { typeToFlattenedError } from "zod";
export default function Signup() {
  const [searchParams] = useSearchParams();
  const prefillEmail = searchParams.get("email") || "";

  const [currentStep, setCurrentStep] = useState(3);
  const [selectedType, setSelectedType] = useState<CompanyType | null>(null);

  const [basicInfo, setBasicInfo] = useState<NewUser>({
    email: prefillEmail,
    password: "",
    firstname: "",
    lastname: "",
  });
  const [basicInfoError, setBasicInfoError] =
    useState<typeToFlattenedError<NewUser>>();

  const [companyDetails, setCompanyDetails] =
    useState<NewCompany>(defaultMockCompany);
  const [firmDetails, setFirmDetails] = useState<NewFirm>({});

  const [formData, setFormData] = useState({});
  const [error, setError] = useState<string>("");

  const steps = ["Get started", "Basic Info", "Company Details"];

  const handleContinue = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();

    if (currentStep === 1) {
      if (selectedType) {
        setCompanyDetails((prev) => ({
          ...prev,
          type: selectedType,
        }));
        setCurrentStep(currentStep + 1);
      } else {
        setError("Please select a category.");
      }
    }

    if (currentStep === 2) {
      const validateInfo = newUser.safeParse(basicInfo);
      if (!validateInfo.success) {
        console.log("Validation error:", validateInfo.error.flatten());
        setBasicInfoError(validateInfo.error.flatten());
      }
      // Verify that email doesn't already exist in db
      else {
        setCurrentStep(currentStep + 1);
      }
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
    setSelectedType(category);
  };

  const handleFormChange = (key: keyof NewUser, value: string) => {
    setBasicInfo((prev) => ({ ...prev, [key]: value }));
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
        onSelect={handleSelect}
        selectedType={selectedType}
        error={error}
      />
    );
  }

  if (currentStep === 2) {
    stepContent = (
      <SignupBasicInfo
        data={basicInfo}
        onChange={handleFormChange}
        errors={basicInfoError}
      />
    );
  }

  if (currentStep === 3) {
    stepContent = (
      <SignupCompanyInfo formData={formData} onChange={handleFormChange} />
    );
  }

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
                  onClick={() => setCurrentStep((prev) => prev - 1)}
                >
                  Back
                </Button>

                <Button onClick={handleContinue}>
                  {currentStep === steps.length ? "Submit" : "Continue"}
                </Button>
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
