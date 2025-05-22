import icon from "@/assets/images/email-file.gif";
import { Button } from "@/components/ui/button";
import { VerifyEmailProps } from "../types";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/features/auth/hooks";
import { useEffect, useMemo, useState } from "react";
import { getUserDetails } from "@/domains/user/api";
import { UserData, UserOnboardingStatus } from "@/domains/user/types";
import { routes } from "@/shared/routes/routes";
import { CenteredLoader } from "@/components/CenteredLoader";
import { toast } from "sonner";
import { updateOnboardingStatus } from "../onboardingService";
export const VerifyEmail = () => {
  console.log("VerifyEmail rendered");
  // Hooks, Context
  const { user, isLoggedIn, logout } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  // State
  const [emailVerificationTokenHash, setEmailVerificationTokenHash] =
    useState<string>("");
  const [emailVerifiedStatus, setEmailVerifiedStatus] =
    useState<boolean>(false);
  const [onboardingStatus, setOnboardingStatus] = useState<
    UserOnboardingStatus | undefined
  >(undefined); // Default fallback if unauthenticated or data not loaded

  // Computed
  const urlStatus = params.get("status"); // Get status from URL: success | failed | null
  const verifiedEmail = params.get("email"); // Get email from URL

  const userEmail = verifiedEmail || user?.email || "";
  const emailMismatch =
    isLoggedIn && verifiedEmail && user?.email !== verifiedEmail;

  const showInitialPrompt = useMemo(
    () => onboardingStatus === "not_started",
    [onboardingStatus]
  );
  const showVerified = useMemo(
    () => onboardingStatus === "email_verified" || urlStatus === "success",
    [onboardingStatus, urlStatus]
  );
  const showFailed = useMemo(() => urlStatus === "failed", [urlStatus]);
  const loadingStatus = isLoggedIn && onboardingStatus === undefined;

  const handleResendEmail = async () => {};
  const handleContinue = () => {
    try {
      // Update user onboarding status
      updateOnboardingStatus({
        userId: user.id,
        onboardingStatus: "creator_vitals_needed",
      });
      navigate(routes.onboarding.step.buildPath({ step: "companyVitals" }));
    } catch (error) {
      toast.error("An unexpected error occurred");
    }
  };

  useEffect(() => {
    let isCancelled = false;

    const poll = async () => {
      if (!isLoggedIn || !user?.id || emailMismatch) return;

      try {
        const res = await getUserDetails(user.id);
        if (res.success && res.data) {
          if (isCancelled) return;

          setOnboardingStatus(res.data.onboardingStatus);

          if (res.data.emailVerificationTokenHash) {
            setEmailVerificationTokenHash(res.data.emailVerificationTokenHash);
          }

          if (res.data.emailVerified) {
            setEmailVerifiedStatus(true);
            return; // stop polling
          }

          setTimeout(poll, 5000); // poll again only if not yet verified
        }
      } catch (err) {
        console.error("Email verification poll failed", err);
        setTimeout(poll, 5000); // retry anyway
      }
    };

    poll();

    return () => {
      isCancelled = true;
    };
  }, [isLoggedIn, user?.id, emailMismatch]);

  if (loadingStatus) return <CenteredLoader />;

  // console.log({
  //   isLoggedIn,
  //   user,
  //   verifiedEmail,
  //   urlStatus,
  //   showFailed,
  //   showVerified,
  //   showInitialPrompt,
  //   loadingStatus,
  // });
  return (
    <div className="flex flex-col items-center p-8 md:p-16 gap-4 w-full flex-1 justify-between md:justify-center max-h-[45rem]">
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
            <img src={icon} alt="verify email icon" />
          </div>

          <div className="text-center text-sm md:text-base">
            We've sent a verification link to{" "}
            <span className="text-blue-500">{userEmail}</span>. Click it to
            verify your account and continue setup. Can't find it? Check your
            spam folder or click 'Resend' below.
          </div>

          <div className="flex gap-4 mb-16 md:mb-0 md:mt-16">
            {isLoggedIn && !emailMismatch && (
              <Button variant="outline" onClick={handleResendEmail}>
                Resend Email
              </Button>
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
