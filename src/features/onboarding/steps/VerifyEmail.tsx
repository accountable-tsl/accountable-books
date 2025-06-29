import icon from "@/assets/images/email-file.gif";
import { Button } from "@/components/ui/button";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth, useSessionLoader } from "@/features/auth/hooks";
import { useEffect, useMemo, useState } from "react";
import { getUserDetails } from "@/domains/user/api";
import { routes } from "@/shared/routes/routes";
import { CenteredLoader } from "@/components/CenteredLoader";
import { toast } from "sonner";
import {
  handleEmailVerification,
  resendVerificationEmail,
  updateCompanyOnboardingStatus,
} from "@/features/onboarding/api";
import { OnboardingStatus } from "@/domains/company/types";
import { useCompany } from "@/domains/company/store";
import { cn } from "@/lib/utils";
import { getCompanyDetails } from "@/domains/company/api";
import { onboardingStatus as onbStatus } from "@/domains/company/types";
import { VerifyEmailFnResponse } from "@/features/onboarding/types";
import ErrorPage from "@/components/ErrorPage";
import { useTenantRoutes } from "@/shared/routes/hooks";
import { set } from "lodash";
import { getVerifyEmailSessionStatus } from "../utils";

export const VerifyEmail = ({
  onStatusChange,
}: {
  onStatusChange?: (status: OnboardingStatus) => void;
}) => {
  // Hooks, Context
  const {
    user,
    isLoggedIn,
    logout,
    currentCompanyId,
    currentCompany: company,
  } = useAuth();
  const { loading: sessionLoading } = useSessionLoader();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { login: loginRoute } = useTenantRoutes();

  // State
  const [verifyEmailResponse, setVerifyEmailResponse] =
    useState<VerifyEmailFnResponse>({
      emailVerified: false,
      status: null,
      slug: null,
      email: null,
    });
  const [hasTriggeredVerification, setHasTriggeredVerification] =
    useState(false);

  const [emailVerifiedStatus, setEmailVerifiedStatus] =
    useState<boolean>(false);
  const onboardingStatus = company?.onboardingStatus;
  const [retryExhausted, setRetryExhausted] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // Computed
  const userIdFromUrl = params.get("userId");
  const verificationToken = params.get("token");

  const isUserLoggedIn = !sessionLoading && isLoggedIn;

  // let isEmailVerified: boolean = false;
  // let verificationStatus: "verified" | "invalid_or_expired" | "error" | null =
  //   null;
  // let firmSlug: string | null = null;
  // let emailToVerify: string | null = null;

  // const urlStatus = params.get("status"); // Get status from URL: success | failed | null
  // const verifiedEmail = params.get("email"); // Get email from URL
  // const userEmail = verifiedEmail || user?.email || "";

  // const emailMismatcha =
  //   isLoggedIn && verifiedEmail && user?.email !== verifiedEmail;

  // const showInitialPrompt =
  //   !onboardingStatus || onboardingStatus === "not_started";

  // const showVerified = useMemo(
  //   () => onboardingStatus === "email_verified" || urlStatus === "success",
  //   [onboardingStatus, urlStatus]
  // );
  // const showFailed = useMemo(() => urlStatus === "failed", [urlStatus]);
  // const loadingStatus = isLoggedIn && onboardingStatus === undefined;

  // Functions
  const verifyEmailFn = async () => {
    if (!verificationToken || !userIdFromUrl) return;

    setIsLoading(true);

    try {
      const callVerifyEmailEndpoint = handleEmailVerification({
        token: verificationToken,
        userId: userIdFromUrl,
      });

      toast.promise(callVerifyEmailEndpoint, {
        loading: "Verifying your email...",
        success: "Email verified successfully!",
        error: "Verification failed. Please try again.",
      });

      const res = await callVerifyEmailEndpoint;

      if (!res.success || !res.data) {
        toast.error(res.message || "Verification failed.");
        setVerifyEmailResponse((prev) => ({ ...prev, status: "error" }));
        return;
      }

      setVerifyEmailResponse(res.data);

      // No navigations here, let ui handle it
    } catch (error) {
      toast.error("Something went wrong.");
      setVerifyEmailResponse((prev) => ({ ...prev, status: "error" }));
    } finally {
      setIsLoading(false);
    }
  };
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

  // useEffect(() => {
  //   if (sessionLoading) return;

  //   // Trigger verification on mount for logged-out users
  //   if (!isLoggedIn) {
  //     setHasTriggeredVerification(true);
  //   }
  // }, [isLoggedIn, sessionLoading]);

  useEffect(() => {
    if (!hasTriggeredVerification) return;
    if (!verificationToken || !userIdFromUrl) return;

    verifyEmailFn();
  }, [userIdFromUrl, verificationToken, hasTriggeredVerification]);

  // useEffect(() => {
  //   if (!company?.id) return;
  //   // setOnboardingStatus(company.onboardingStatus);
  // }, [company]);

  if (isLoading || sessionLoading) {
    return (
      <CenteredLoader
        fullscreen
        message="Loading..."
        showAuthHeader={!isLoggedIn}
      />
    );
  }

  // if (!userIdFromUrl || !verificationToken) {
  //   return <ErrorPage />;
  // }
  // const { emailVerified, status, email } = verifyEmailResponse;

  const { emailVerified, status, email } = verifyEmailResponse;
  const loggedOut = !isLoggedIn;
  const loggedInSameUser = user?.email === email;
  const loggedInDifferentUser = isLoggedIn && email && user?.email !== email;

  const verifiedEmail = email || "";

  const initialPage = (
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
          // className={cn(retryExhausted ? "grayscale" : "")}
        />
      </div>

      <div className="text-center text-sm md:text-base">
        {/* {retryExhausted ? (
          <div>Still not verified after multiple attempts.</div>
        ) : ( */}
        <div>
          We've sent a verification link to
          <span className="text-blue-500 px-1">
            {verifiedEmail || user?.email || "your email"}.
          </span>
          Click it to verify your account and continue setup. <br />
          Can't find it? Check your spam folder or click 'Resend' below.
        </div>
        {/* )} */}
      </div>

      <div
        className={cn(
          "flex gap-4 mb-16 md:mb-0 md:mt-16",
          retryExhausted ? "md:mt-8" : ""
        )}
      >
        {
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
        }
        {!isLoggedIn && (
          <>
            <Link
              to={
                userEmail
                  ? `${loginRoute()}?email=${encodeURIComponent(userEmail)}`
                  : loginRoute()
              }
              className="text-blue-600 underline mt-4 block"
            >
              Log in to continue onboarding
            </Link>
          </>
        )}
      </div>
    </>
  );

  let verifyEmailContent;

  const success = emailVerified && status === "verified";
  const failed =
    (!emailVerified && status === "error") || status === "invalid_or_expired";

  if (!hasTriggeredVerification) verifyEmailContent = initialPage;

  const verifiedSuccessfully = (
    <>
      <h2 className="text-xl font-bold mb-2">✅ Email Verified</h2>
      <p className="mb-4">Your email has been verified successfully.</p>
      {isLoggedIn ? (
        <Button onClick={handleContinue}>Continue Onboarding</Button>
      ) : (
        <Link
          to={`${loginRoute()}?email=${encodeURIComponent(email || "")}`}
          className="text-blue-600 underline mt-4 block"
        >
          Log in to continue onboarding
        </Link>
      )}
    </>
  );

  const verificationFailed = (
    <>
      <h2 className="text-xl font-bold mb-2">❌ Verification Failed</h2>
      <p>This verification is invalid or has expired.</p>
      <Link
        to={`${loginRoute()}?email=${encodeURIComponent(email || "")}`}
        className="text-blue-500 underline mt-4 block"
      >
        Log in to request a new link
      </Link>
    </>
  );

  const LoggedInAndEmailMismatch = (
    <>
      <h2 className="text-xl font-bold mb-2">✅ Email Verified</h2>

      <p>
        You verified <b className="text-blue-500">{verifiedEmail}</b> but are
        logged in as <b>{user?.email}</b>.
      </p>
      <button
        onClick={() =>
          logout({
            redirectTo: login(),
            query: { email: email || "" },
          })
        }
        className="mt-4 bg-blue-600 text-white px-4 py-2 rounded"
      >
        Log out and log in
      </button>
    </>
  );

  // if (!isUserLoggedIn) {
  //   if (success) return verifiedSuccessfully;
  //   if (failed) return verificationFailed;
  // }

  // if (isUserLoggedIn) {
  //   if (showInitialPrompat) return initialPage;
  //   if (success) {
  //     if (emailMismatch) return LoggedInAndEmailMismatch;
  //     return verifiedSuccessfully;
  //   }
  // }
  return (
    <div className="flex flex-col items-center p-8 md:p-16 gap-4 w-full flex-1 justify-center max-h-[45rem] max-w-5xl mx-auto">
      {verifyEmailContent}
      <div className="hidden">
        {/* {emailVerifiedStatus && !emailMismatch ? (
          verifiedSuccessfully
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
                  <span className="text-blue-500">{userEmail}</span>. Click it
                  to verify your account and continue setup. Can't find it?
                  Check your spam folder or click 'Resend' below.
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
              {!isLoggedIn && (
                <>
                  <Link
                    to={
                      userEmail
                        ? `${
                            routes.login.staticPath
                          }?email=${encodeURIComponent(userEmail)}`
                        : routes.login.staticPath
                    }
                    className="text-blue-600 underline mt-4 block"
                  >
                    Log in to continue onboarding
                  </Link>
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
        )} */}
      </div>
    </div>
  );
};
