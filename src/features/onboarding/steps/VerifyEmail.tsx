import icon from "@/assets/images/email-file.gif";
import { Button } from "@/components/ui/button";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import { routes } from "@/shared/routes/routes";
import { CenteredLoader } from "@/components/CenteredLoader";
import { toast } from "sonner";
import {
  handleEmailVerification,
  resendVerificationEmail,
} from "@/features/onboarding/api";
import { OnboardingStatus } from "@/domains/company/types";
import { cn } from "@/lib/utils";
import { TriangleAlert } from "lucide-react";
import { VerifyEmailFnResponse } from "@/features/onboarding/types";
import { useSession } from "@/features/auth/Session";

export const VerifyEmail = ({
  className,
  successText = "Continue Onboarding",
}: {
  onStatusChange?: (status: OnboardingStatus) => void;
  className?: string;
  successText?: string;
  stateOverride?: string;
}) => {
  // Hooks, Context
  const {
    user,
    isLoggedIn,
    logout,
    refetchSession,
    loading: sessionLoading,
  } = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();

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

  const [isLoading, setIsLoading] = useState(false);

  // Retrieved from url
  const userIdFromUrl = params.get("userId");
  const verificationToken = params.get("token");

  // Functions
  const verifyEmailFn = useCallback(async () => {
    if (!isLoggedIn && (!verificationToken || !userIdFromUrl)) return;

    setIsLoading(true);

    try {
      const callVerifyEmailEndpoint = handleEmailVerification({
        token: verificationToken || "",
        userId: userIdFromUrl || user?.id || "",
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
      // await refetch();
      // No navigations here, let ui handle it
    } catch (error) {
      toast.error("Something went wrong.");
      setVerifyEmailResponse((prev) => ({ ...prev, status: "error" }));
    } finally {
      setIsLoading(false);
    }
  }, [isLoggedIn, verificationToken, userIdFromUrl, user?.id]);

  const handleResendEmail = useCallback(async () => {
    const userId = userIdFromUrl || user?.id || "";
    if (!userId) {
      toast.error("User not found. Please try again or contact support.");
      return;
    }
    // TODO:
    /**
     * Handle differently depending on whether user is logged in or not
     * Logged in, different email, receive email param
     * Logged in, same email, send to user.email
     * Finally, setHasTriggeredVerification to false
     *
     */

    try {
      const res = await resendVerificationEmail({
        userId: userId,
      });

      if (!res.success) {
        toast.error(res.message);
      } else {
        toast.success(res.message);
      }
    } catch (error) {
      toast.error("An unexpected error occurred");
    }
  }, [userIdFromUrl, user?.id]);

  const handleContinue = async () => {
    // If logged in, redirect to onboarding otherwise redirect to login
    if (!isLoggedIn) {
      navigate(routes.auth.login.staticPath);
      return;
    }

    // await refetch();
    navigate(routes.onboarding.index.staticPath);
  };
  const isEmailVerificationStepComplete =
    isLoggedIn &&
    user?.currentCompany.onboarding.steps.find(
      (step) => step.key === "email_verified"
    )?.complete;

  useEffect(() => {
    if (isLoading || sessionLoading) return;

    // Trigger verification on mount for logged-out users or those that reach here by clicking the link
    if (!isLoggedIn || userIdFromUrl || isEmailVerificationStepComplete) {
      setHasTriggeredVerification(true);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    if (!hasTriggeredVerification) return;
    if (!isLoggedIn && (!verificationToken || !userIdFromUrl)) return;

    verifyEmailFn();
  }, [userIdFromUrl, verificationToken, hasTriggeredVerification]);

  if (isLoading || sessionLoading) {
    return (
      <CenteredLoader
        fullscreen
        message="Loading..."
        showAuthHeader={isLoggedIn}
      />
    );
  }

  const { emailVerified, status, email } = verifyEmailResponse;
  const loggedOut = !isLoggedIn;
  const loggedInDifferentUser = isLoggedIn && email && user?.email !== email;

  const verificationSuccessful =
    isEmailVerificationStepComplete || (emailVerified && status === "verified");
  const verificationFailed =
    (!emailVerified && status === "error") || status === "invalid_or_expired";

  const verifiedEmail = email || "";
  const userEmail = user?.email || "";

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
        <img src={icon} alt="verify email icon" />
      </div>

      <div className="text-center text-sm md:text-base">
        <div>
          We've sent a verification link to
          <span className="text-blue-500 px-1">
            {verifiedEmail || userEmail || "your email"}.
          </span>
          Click it to verify your account and continue setup. Can't find it?
          Check your spam folder or click 'Resend' below.
        </div>
      </div>

      <div
        className={cn(
          "flex flex-col-reverse md:flex-row gap-4 mb-8 mt-8 md:mb-0 md:mt-16"
        )}
      >
        <Button
          variant="link"
          onClick={handleResendEmail}
          className="text-blue-500/70 hover:text-blue-500"
        >
          Resend Email
        </Button>
        <Button onClick={() => setHasTriggeredVerification(true)}>
          I've clicked the link
        </Button>
      </div>
    </>
  );

  const loggedInAndVerificationFailed = (
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

      <div className="w-40 h-40 flex items-center justify-center">
        <TriangleAlert strokeWidth={1} className="w-25 h-25 text-destructive" />
      </div>

      <div className="text-center text-sm md:text-base">
        <span>
          {loggedInDifferentUser ? (
            <>
              You are logged in as{" "}
              <span className="text-blue-500">{userEmail}</span> but tried to
              verify <span>{verifiedEmail || "a different email"}</span>. There
              was an issue verifying this email.
            </>
          ) : (
            <>
              We tried to verify{" "}
              <span className="text-blue-500">
                {verifiedEmail || userEmail || "your email"}
              </span>
              , but it seems there was an issue.
            </>
          )}
        </span>
        <br />
        <span className="text-muted-foreground">
          Click 'Resend' below to send a new verification link to{" "}
          <span className="text-blue-500">
            {verifiedEmail || "this second email"}
          </span>
          .
        </span>
      </div>

      <div
        className={cn(
          "flex flex-col-reverse md:flex-row gap-4 mb-8 mt-8 md:mb-0 md:mt-16"
        )}
      >
        <Button variant="default" onClick={handleResendEmail}>
          Resend Email
        </Button>
      </div>
    </>
  );

  const loggedOutAndVerificationFailed = (
    <>
      <h2 className="text-xl font-bold mb-2">❌ Verification Failed</h2>
      <p className="text-center">
        This verification link is invalid or has expired.
      </p>
      <Link
        to={`${routes.auth.login.staticPath}?email=${encodeURIComponent(
          email || ""
        )}`}
        className="text-blue-500 underline mt-4 block"
      >
        Log in to request a new link
      </Link>
    </>
  );

  const verifiedSuccessfully = (
    <>
      <h2 className="text-xl font-bold mb-2">✅ Email Verified</h2>

      {loggedInDifferentUser ? (
        <p>
          You verified <b className="text-blue-500">{verifiedEmail}</b> but are
          logged in as <b>{user?.email}</b>.
        </p>
      ) : (
        <p className="mb-4">Your email has been verified successfully.</p>
      )}

      {loggedOut ? (
        <Link
          to={`${routes.auth.login.staticPath}?email=${encodeURIComponent(
            verifiedEmail || ""
          )}`}
          className="text-blue-600 underline mt-4 block"
        >
          Log in to continue onboarding
        </Link>
      ) : loggedInDifferentUser ? (
        <Button
          variant="secondary"
          onClick={() =>
            logout({
              redirectTo: routes.auth.login.staticPath,
              query: { email: verifiedEmail },
            })
          }
        >
          Log out and log in
        </Button>
      ) : (
        <Button onClick={handleContinue}>{successText}</Button>
      )}
    </>
  );

  const fallbackContent = (
    <>
      <h2 className="text-xl font-bold mb-2">⚠️ Unexpected State</h2>
      <p>Something doesn't look right. Please log in to continue.</p>
      <Link
        to={routes.auth.login.staticPath}
        className="text-blue-600 underline mt-4 block"
      >
        Log in {!loggedOut ? "again" : ""}
      </Link>
    </>
  );

  let verifyEmailContent;
  if (!hasTriggeredVerification && isLoggedIn) verifyEmailContent = initialPage;
  if (loggedOut && verificationFailed)
    verifyEmailContent = loggedOutAndVerificationFailed;
  if (!loggedOut && verificationFailed)
    verifyEmailContent = loggedInAndVerificationFailed;
  if (verificationSuccessful) verifyEmailContent = verifiedSuccessfully;
  if (!verifyEmailContent) verifyEmailContent = fallbackContent; // Fallback

  return (
    <div
      className={cn(
        "flex flex-col gap-4 items-center p-8 md:p-16 max-w-3xl mx-auto w-full",
        "flex-1 justify-center md:h-full",
        !isLoggedIn ? "max-h-[45rem] h-[45rem]" : "",
        className
      )}
    >
      {verifyEmailContent}
    </div>
  );
};
