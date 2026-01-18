import type { AxiosError } from 'axios';
import { XIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { PuffLoader } from 'react-spinners';
import { toast } from 'sonner';

import { AuthHeader } from '@/components/AuthHeader';
import { StepProgress } from '@/components/StepProgress/StepProgress';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { getDefaultCurrencyCodeForCountry } from '@/constants/countryCurrencyMap';
import { performLoginFlow } from '@/features/auth-login/model/use-login-flow';
import { authStore } from '@/modules/auth';
import { useCheckEmail } from '@/shared/hooks/useCheckEmail';
import { useCountries } from '@/shared/hooks/useCountries';
import { useCurrencies } from '@/shared/hooks/useCurrencies';
import { routes } from '@/shared/routes/routes';
import type { CompanyType, Country } from '@/shared/types/core';
import { zEmail } from '@/shared/types/core';

import { submitSignup } from '../../../domains-pending-migration/signup/signupService';
import {
  type NewCompany,
  type NewUser,
} from '../../../domains-pending-migration/signup/signupTypes';
import type { SignupBasicInfoHandle } from './steps/basic-info';
import { SignupBasicInfo } from './steps/basic-info';
import type { SignupCompanyInfoHandle } from './steps/company-info';
import { SignupCompanyInfo } from './steps/company-info';
import { SignupSelector } from './steps/selector';

//TODO: Refactor whole signup flow later
export function Signup() {
  const [searchParams] = useSearchParams();
  const { setAuth } = authStore((s) => s);
  const navigate = useNavigate();
  const prefillEmail = searchParams.get('email') || '';

  const [currentStep, setCurrentStep] = useState(1);
  const [selectedType, setSelectedType] = useState<CompanyType | null>(null);

  const [basicInfo, setBasicInfo] = useState<NewUser>({
    email: prefillEmail,
    password: '',
    firstname: '',
    lastname: '',
  });
  const [companyDetails, setCompanyDetails] = useState<NewCompany>({
    legalName: '',
    countryId: '',
    type: 'business',
    reportingCurrencyId: '',
    yearEndDay: 31,
    yearEndMonth: 12,
  });

  const [error, setError] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<
    'idle' | 'submitting' | 'success' | 'error'
  >('idle');

  // This tracks whether the user has explicitly selected a reporting currency.
  // If true, we won't auto-set the currency based on country anymore.
  const userHasSelectedCurrency = useRef(false);

  const steps = ['Get started', 'Basic Info', 'Company Details'];

  const { data: country } = useCountries();
  const countries = useMemo(() => country?.data || [], [country?.data]);

  const { data: currencies } = useCurrencies();
  const currenciesData = useMemo(() => currencies?.data || [], [currencies?.data]);

  const basicInfoRef = useRef<SignupBasicInfoHandle>(null);
  const companyInfoRef = useRef<SignupCompanyInfoHandle>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const { mutateAsync: checkEmail } = useCheckEmail();

  const checkEmailWrapper = async (email: string): Promise<boolean> => {
    // try {
    const validEmail = zEmail.safeParse(email);
    if (!validEmail.success)
      throw new Error('Please enter a valid email address');

    try {
      const response = await checkEmail({ email, purpose: 'signup' });
      if (!response?.success) {
        throw new Error(
          response.message || 'This email has already been registered',
        );
      }
      return true;
    } catch (err: unknown) {
      const backendError =
        (err as AxiosError<{ message: string }>)?.response?.data?.message ||
        (err as Error).message ||
        'Something went wrong';
      throw new Error(backendError);
    }
  };

  const handleBack = () => {
    if (currentStep === 2) setSelectedType(null);

    if (selectedType && currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
    } else {
      setCurrentStep(1);
    }
  };

  const handleContinue = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();

    if (currentStep === 1) {
      if (!selectedType) {
        setError('Please choose a category to proceed.');
        return;
      }
      setCompanyDetails((prev) => ({
        ...prev,
        type: selectedType,
        ...(selectedType === 'accounting_firm'
          ? { industry: 'Professional, Scientific, and Technical Services' }
          : {}),
      }));
      setCurrentStep(currentStep + 1);
    }

    if (currentStep === 2) {
      const isValid = await basicInfoRef.current?.validate();
      if (!isValid) {
        toast.error('Please fill in all required fields');
        return;
      }
      setCurrentStep(currentStep + 1);
    }

    // Handle Submission
    if (currentStep === steps.length) {
      if (!companyDetails.legalName) {
        toast.error(
          'Please fill company name or confirm default name set (if any)',
        );
        return;
      }
      const isValid = await companyInfoRef.current?.validate();
      if (!isValid) {
        toast.error('Please fix the errors in your company details');
        return;
      }

      setSubmitStatus('submitting');

      try {
        const signup = await submitSignup({
          user: basicInfo,
          company: companyDetails,
        });

        if (signup.success) {
          toast.success('Signup successful');

          const loginResult = await performLoginFlow({
            email: basicInfo.email,
            password: basicInfo.password,
            setAuth,
          });

          // Wait for 2 seconds
          await new Promise((resolve) => setTimeout(resolve, 2000));

          setSubmitStatus('success');
          setError('');

          const {
            success: loginSuccess,
            canAccessApp,
            data: loginResultData,
          } = loginResult;

          if (!loginSuccess || !loginResultData) {
            toast.info('Signup succeeded! Please login to continue.', {
              duration: 6000,
            });
            navigate(routes.auth.login.staticPath, { replace: true });
          }

          if (loginSuccess && canAccessApp) {
            navigate(
              routes.general.dashboard.build({
                companyId: loginResultData?.user.currentCompanyId,
              }),
              { replace: true },
            );
          } else {
            navigate(routes.onboarding.index.staticPath, { replace: true });
          }
        } else {
          setTimeout(() => {
            setSubmitStatus('error');
            setError(signup.message);
            toast.error(signup.message || 'Something went wrong.');
          }, 1000);
        }
      } catch (error) {
        setTimeout(() => {
          setSubmitStatus('error');
          setError('Something went wrong. Please try again.');
          toast.error('Something went wrong. Please try again.', {
            duration: 5000,
          });
        }, 1000);
      } finally {
        setIsSubmitting(false);
      }

      // Successful? Clear form, send user to dashboard or something
      // Basically log user in already, JWT and all
    }
  };

  const handleSelect = (category: CompanyType) => {
    if (!category) return;
    if (currentStep === 1) {
      setSelectedType(category);
      setCompanyDetails((prev) => ({ ...prev, type: category }));
    }
    setError('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleContinue({
        preventDefault: () => {},
      } as React.MouseEvent<HTMLButtonElement>);
    }
  };

  const handleBasicInfoChange = (key: keyof NewUser, value: string) => {
    setBasicInfo((prev) => ({ ...prev, [key]: value }));
  };

  const getCountryFromLocale = useCallback((): Country | undefined => {
    const locale = navigator.language;
    const countryCode = locale.split('-')[1];
    const userCountry = countries.find((item) => item.code === countryCode);
    return userCountry;
  }, [countries]);

  const getDefaultCurrency = useCallback(() => {
    const ctry = companyDetails.countryId
      ? countries.find((item) => item.id === companyDetails.countryId)
      : '';
    const userCountry = ctry || getCountryFromLocale();
    const curr = userCountry
      ? getDefaultCurrencyCodeForCountry(userCountry?.code)
      : '';

    return curr;
  }, [companyDetails.countryId, countries, getCountryFromLocale]);

  const handleCompanyInfoChange = (field: keyof NewCompany, value: string) => {
    // If user manually selects a currency, mark the override flag
    if (field === 'reportingCurrencyId') {
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
          variant={'destructive'}
          onClick={() => setCurrentStep(1)}
          className="max-w-[5rem]"
        >
          Back
        </Button>
      </div>
    );
  }

  useEffect(() => {
    if (!countries.length) return;
    const userCountry = getCountryFromLocale();
    if (userCountry?.id && !companyDetails.countryId) {
      setCompanyDetails((prev) => ({
        ...prev,
        countryId: userCountry.id,
      }));
    }
  }, [countries, companyDetails.countryId, getCountryFromLocale]);

  useEffect(() => {
    // Only run when currency list is ready and a country is selected
    if (
      !currenciesData.length ||
      !companyDetails.countryId ||
      userHasSelectedCurrency.current // ❌ Stop if user already picked one manually
    ) {
      return;
    }

    // Get the default currency code for the selected country
    const defaultCurrencyCode = getDefaultCurrency();
    const defaultCurrency = currenciesData.find(
      (c) => c.code === defaultCurrencyCode,
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
  }, [currenciesData, companyDetails.countryId, companyDetails.reportingCurrencyId, getDefaultCurrency]);

  return (
    <div className="flex min-h-svh flex-col">
      <AuthHeader />
      <div className="flex w-full flex-1 items-center justify-center p-6 md:p-10">
        <div className="relative flex w-full max-w-md flex-col gap-6">
          <img
            src="./icon.svg"
            alt=""
            className="absolute right-1/2 bottom-3/5 -z-5 h-100 w-100 opacity-10"
          />
          <Card className="relative">
            {!isSubmitting && submitStatus === 'idle' && (
              <>
                <CardHeader>
                  <CardTitle className="text-2xl">
                    {selectedType === 'accounting_firm' && currentStep === 3
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
                    <div className="flex w-full justify-between">
                      <Button
                        variant="outline"
                        disabled={currentStep === 1}
                        onClick={handleBack}
                      >
                        Back
                      </Button>

                      {selectedType && (
                        <Button
                          onClick={handleContinue}
                          disabled={isSubmitting}
                        >
                          {currentStep === steps.length ? 'Submit' : 'Continue'}
                        </Button>
                      )}
                    </div>
                  </CardFooter>
                }
              </>
            )}

            {submitStatus === 'submitting' && (
              <>
                <div className="flex flex-col items-center justify-center gap-2 p-16 py-22 text-center">
                  {/* <div className="flex justify-center"> */}
                  <PuffLoader color="var(--muted-foreground)" />
                  {/* </div> */}
                  <p>Creating your account...</p>
                </div>
              </>
            )}

            {submitStatus === 'error' && (
              <div className="text-center text-red-600">
                <XIcon />
                <p>{error}</p>
                <Button onClick={() => setSubmitStatus('idle')}>Back</Button>
              </div>
            )}
          </Card>
          <div className="text-muted-foreground [&_a]:hover:text-primary text-center text-xs text-balance [&_a]:underline [&_a]:underline-offset-4">
            By clicking continue, you agree to our{' '}
            <a href="#">Terms of Service</a> and <a href="#">Privacy Policy</a>.
          </div>
        </div>
      </div>
    </div>
  );
}
