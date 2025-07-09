import { useNavigate } from "react-router-dom";
import { AuthHeader } from "./AuthHeader";
import { cn } from "@/lib/utils";
import { routes } from "@/shared/routes/routes";
import { useSession } from "@/features/auth/Session";

type ErrorType = "404" | "403" | "default";
// | "500"
// | "401"
// | "503"
// | "not-found"
// | "unauthorized"
// | "no-data"
// | "screen-size";

interface ErrorPageProps {
  type?: ErrorType;
  title?: string;
  showTitle?: boolean;
  showIcon?: boolean;
  message?: string;
  showHeader?: boolean;
  showHomeLink?: boolean;
  showSupport?: boolean;
  supportEmail?: string;
  className?: string;
}

const errorConfigs = {
  "404": {
    icon: "🔍",
    title: "Page Not Found",
    message: "Sorry, we can’t find that page.",
  },
  "403": {
    icon: "🔒",
    title: "Access Denied",
    message: "You don't have permission to view this page.",
  },
  default: {
    icon: "⚠️",
    title: "Something went wrong",
    message: "We're sorry, but something unexpected happened.",
  },
};

export default function ErrorPage({
  type = "404",
  title,
  message,
  showTitle = false,
  showIcon = false,
  showHomeLink = true,
  showSupport = true,
  supportEmail = "hello@accountable.global",
  showHeader = true,
  className = "",
}: ErrorPageProps) {
  const { isLoggedIn, companyId: currentCompanyId } = useSession();
  const navigate = useNavigate();
  const config =
    errorConfigs[type as keyof typeof errorConfigs] || errorConfigs.default;
  const displayTitle = title || config.title;
  const displayMessage = message || config.message;

  const routeLink = isLoggedIn
    ? routes.general.dashboard.build({ companyId: currentCompanyId || "" })
    : routes.auth.login.staticPath;

  return (
    <div
      className={cn("flex flex-col min-h-screen justify-between", className)}
    >
      {showHeader && <AuthHeader />}
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="text-center max-w-md space-y-4">
          <h1 className="text-4xl font-bold flex items-center justify-center gap-1">
            {type === "default" ? (
              <span>{config.icon}</span>
            ) : (
              <>
                {type}{" "}
                {showIcon && (
                  <span className="h-5 w-5 text-sm">{config.icon}</span>
                )}
              </>
            )}
          </h1>

          {showTitle && (
            <h2 className="text-2xl font-semibold text-gray-700 dark:text-gray-200">
              {displayTitle}
            </h2>
          )}

          <p className="text-lg">{displayMessage}</p>
          {showHomeLink && (
            <div
              onClick={() => navigate(routeLink, { replace: true })}
              className="text-blue-600 hover:underline"
            >
              Go back home
            </div>
          )}
        </div>
      </div>

      {isLoggedIn && showSupport && (
        <div className="text-center mb-4">
          <p className="text-sm">
            Need help? Contact{" "}
            <a href={`mailto:${supportEmail}`} className="underline">
              {supportEmail}
            </a>
          </p>
        </div>
      )}
    </div>
  );
}
