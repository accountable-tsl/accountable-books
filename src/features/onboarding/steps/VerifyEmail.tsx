import icon from "@/assets/images/email-file.gif";
import { Button } from "@/components/ui/button";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/features/auth/hooks";
import { useEffect, useMemo, useState } from "react";
import { getUserDetails } from "@/domains/user/api";
import { routes } from "@/shared/routes/routes";
import { CenteredLoader } from "@/components/CenteredLoader";
import { toast } from "sonner";
import {
  resendVerificationEmail,
  updateCompanyOnboardingStatus,
} from "../onboardingService";
import { OnboardingStatus } from "@/domains/company/types";
import { useCompany } from "@/domains/company/store";
import { cn } from "@/lib/utils";
import { getCompanyDetails } from "@/domains/company/api";
import { onboardingStatus as onbStatus } from "@/domains/company/types";

export const VerifyEmail = ({
  onStatusChange,
}: {
  onStatusChange?: (status: OnboardingStatus) => void;
}) => {
  // Hooks, Context
  const { user, isLoggedIn, logout } = useAuth();
  const { company, setCompany } = useCompany();
  const [params] = useSearchParams();

  // State
  const [emailVerifiedStatus, setEmailVerifiedStatus] =
    useState<boolean>(false);
  const onboardingStatus = company?.onboardingStatus;
  const [retryExhausted, setRetryExhausted] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // Computed
  const urlStatus = params.get("status"); // Get status from URL: success | failed | null
  const verifiedEmail = params.get("email"); // Get email from URL
  const userEmail = verifiedEmail || user?.email || "";

  const emailMismatch =
    isLoggedIn && verifiedEmail && user?.email !== verifiedEmail;

  const showInitialPrompt =
    !onboardingStatus || onboardingStatus === "not_started";

  const showVerified = useMemo(
    () => onboardingStatus === "email_verified" || urlStatus === "success",
    [onboardingStatus, urlStatus]
  );
  const showFailed = useMemo(() => urlStatus === "failed", [urlStatus]);
  const loadingStatus = isLoggedIn && onboardingStatus === undefined;

  const handleTryAgain = () => {
    setRetryExhausted(false);
    setRetryCount(0);
  };
  const handleResendEmail = async () => {
    if (!user?.id) {
      toast.error("User not found. Please log in again.");
      return;
    }

    try {
      const res = await resendVerificationEmail({
        email: userEmail,
        userId: user.id,
      });

      if (!res.success) {
        toast.error(res.message);
      } else {
        toast.success(res.message);
        handleTryAgain();
      }
    } catch (error) {
      toast.error("An unexpected error occurred");
    }
  };

  const handleContinue = async () => {
    if (!user?.id || !company?.id) {
      toast.error("User or company not found. Please log in again.");
      return;
    }
    try {
      // Update user onboarding status
      const res = await updateCompanyOnboardingStatus({
        userId: user.id,
        companyId: company!.id,
      });

      if (!res.success || !res.data?.company.onboardingStatus) {
        toast.error(res.message || "Failed to update onboarding status");
        // throw new Error(res.message || "Failed to update onboarding status");
        return;
      }

      const newStatus = res.data?.company.onboardingStatus;
      setCompany(res.data.company);
      onStatusChange?.(newStatus);
      // setOnboardingStatus(newStatus);
      toast.success("Email verified successfully!");
      // navigate(routes.onboarding.index.staticPath);
    } catch (error) {
      toast.error("An unexpected error occurred");
    }
  };

  useEffect(() => {
    if (!company?.id) return;
    // setOnboardingStatus(company.onboardingStatus);
  }, [company]);

  useEffect(() => {
    let isCancelled = false;
    let timeoutId: any = null;
    const maxRetries = 10;

    const poll = async () => {
      if (
        !isLoggedIn ||
        !user?.id ||
        emailMismatch ||
        isCancelled ||
        !company?.id
      )
        return;

      try {
        const res = await getUserDetails(user.id);
        if (res.success && res.data) {
          if (isCancelled) return;

          // if (res.data.emailVerificationTokenHash) {
          //   setEmailVerificationTokenHash(res.data.emailVerificationTokenHash);
          // }

          if (res.data.emailVerified) {
            setEmailVerifiedStatus(true);

            const companyD = await getCompanyDetails(company.id);
            const { success: companySuccess, data: companyData } = companyD;
            if (isLoggedIn && companySuccess && companyData) {
              if (companyData.onboardingStatus === onbStatus.enum.not_started) {
                await updateCompanyOnboardingStatus({
                  userId: user.id,
                  companyId: company.id,
                });
              }

              setCompany(companyData);
            }

            return;
          }

          setRetryCount((prev) => {
            const next = prev + 1;
            if (next >= maxRetries) setRetryExhausted(true);
            return next;
          });

          if (retryCount >= maxRetries) return;
          timeoutId = setTimeout(poll, 5000); // poll again only if not yet verified
        }
      } catch (err) {
        console.error("Email verification poll failed", err);
        setRetryCount((prev) => {
          const next = prev + 1;
          if (next >= maxRetries) setRetryExhausted(true);
          return next;
        });
        if (retryCount >= maxRetries) return;
        timeoutId = setTimeout(poll, 5000);
      }
    };

    poll();

    return () => {
      isCancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isLoggedIn, user?.id, emailMismatch, company?.id, retryExhausted]);

  if (loadingStatus || (company && !company.id)) return <CenteredLoader />;

  return (
    <div className="flex flex-col items-center p-8 md:p-16 gap-4 w-full flex-1  justify-center max-h-[45rem]">
      {emailVerifiedStatus && !emailMismatch ? (
        <>
          <h2 className="text-xl font-bold mb-2">✅ Email Verified</h2>
          <p className="mb-4">Your email has been verified successfully.</p>

          <Button onClick={handleContinue}>Continue Onboarding</Button>
        </>
      ) : showFailed ? (
        <>
          <h2 className="text-xl font-bold mb-2">❌ Verification Failed</h2>
          <p>This verification link may have expired or already been used.</p>
          <Link
            to={`${routes.login.staticPath}?email=${encodeURIComponent(
              userEmail
            )}`}
            className="text-blue-500 underline mt-4 block"
          >
            Log in to request a new link
          </Link>
        </>
      ) : showVerified ? (
        <>
          <h2 className="text-xl font-bold mb-2">✅ Email Verified</h2>
          {emailMismatch ? (
            <>
              <p>
                You verified <b className="text-blue-500">{verifiedEmail}</b>{" "}
                but are logged in as <b>{user.email}</b>.
              </p>
              <button
                onClick={() =>
                  logout({
                    redirectTo: routes.login.staticPath,
                    query: { email: verifiedEmail },
                  })
                }
                className="mt-4 bg-blue-600 text-white px-4 py-2 rounded"
              >
                Log out and log in
              </button>
            </>
          ) : (
            <>
              <p>Your email has been verified successfully.</p>
              {isLoggedIn ? (
                <Link
                  to={routes.onboarding.index.buildPath({
                    step: "companyVitals",
                  })}
                  className="text-blue-600 underline mt-4 block"
                >
                  Continue onboarding
                </Link>
              ) : (
                <Link
                  to={`${routes.login.staticPath}?email=${encodeURIComponent(
                    userEmail
                  )}`}
                  className="text-blue-600 underline mt-4 block"
                >
                  Log in to continue onboarding
                </Link>
              )}
            </>
          )}
        </>
      ) : showInitialPrompt ? (
        <>
          <div className="flex flex-col items-center">
            <p className="font-medium text-lg">Verify your email</p>
            <p className="text-sm text-muted-foreground text-center">
              <span className="hidden md:inline">
                Your financial data needs to be kept secure and confidential.
              </span>
              <span className="block">Let's verify that it's you</span>
            </p>
          </div>

          <div className="w-40">
            <img
              src={icon}
              alt="verify email icon"
              className={cn(retryExhausted ? "grayscale" : "")}
            />
          </div>

          <div className="text-center text-sm md:text-base">
            {retryExhausted ? (
              <div>Still not verified after multiple attempts.</div>
            ) : (
              <div>
                We've sent a verification link to{" "}
                <span className="text-blue-500">{userEmail}</span>. Click it to
                verify your account and continue setup. Can't find it? Check
                your spam folder or click 'Resend' below.
              </div>
            )}
          </div>

          <div
            className={cn(
              "flex gap-4 mb-16 md:mb-0 md:mt-16",
              retryExhausted ? "md:mt-8" : ""
            )}
          >
            {isLoggedIn && !emailMismatch && (
              <>
                {retryExhausted ? (
                  <Button variant="outline" onClick={handleTryAgain}>
                    Try Again
                  </Button>
                ) : (
                  <Button variant="outline" onClick={handleResendEmail}>
                    Resend Email
                  </Button>
                )}
              </>
            )}
          </div>
        </>
      ) : (
        <div>
          <h2 className="text-xl font-bold mb-2">⚠️ Unexpected State</h2>
          <p>Something doesn't look right. Please log in to continue.</p>
          <Link to="/login" className="text-blue-600 underline mt-4 block">
            Log in
          </Link>
        </div>
      )}
    </div>
  );
};
