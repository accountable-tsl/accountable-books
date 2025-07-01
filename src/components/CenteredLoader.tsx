import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { PuffLoader } from "react-spinners";
import { AuthHeader } from "./AuthHeader";
import ErrorPage from "./ErrorPage";

export function CenteredLoader({
  delay = 0,
  fullscreen = false,
  className,
  loader,
  message,
  messageClassName,
  showAuthHeader = false,
  errorTimeout = 15000,
  onTimeout,
  showErrorOnTimeout = false,
}: {
  delay?: number;
  fullscreen?: boolean;
  className?: string;
  loader?: React.ReactNode;
  message?: string;
  messageClassName?: string;
  showAuthHeader?: boolean;
  errorTimeout?: number;
  onTimeout?: () => void;
  showErrorOnTimeout?: boolean;
}) {
  const [visible, setVisible] = useState(delay === 0);
  const [showError, setShowError] = useState(false);

  useEffect(() => {
    let showTimeoutId: NodeJS.Timeout | undefined;
    let errorTimeoutId: NodeJS.Timeout | undefined;

    if (delay > 0) {
      showTimeoutId = setTimeout(() => setVisible(true), delay);
    } else {
      setVisible(true);
    }

    if (errorTimeout != null) {
      errorTimeoutId = setTimeout(() => {
        if (showErrorOnTimeout) setShowError(true);
        onTimeout?.();
      }, delay + errorTimeout);
    }

    return () => {
      if (showTimeoutId) clearTimeout(showTimeoutId);
      if (errorTimeoutId) clearTimeout(errorTimeoutId);
    };
  }, [delay, errorTimeout, showErrorOnTimeout, onTimeout]);

  if (!visible) return null;
  if (showError) return <ErrorPage type="default" />;

  return (
    <>
      {showAuthHeader && <AuthHeader className="relative z-31" />}

      <div
        className={cn(
          "flex flex-col items-center justify-center",
          fullscreen
            ? "fixed inset-0 z-30 bg-background/50 backdrop-blur-sm"
            : "w-full h-full",
          className
        )}
      >
        {loader ?? <PuffLoader color="currentColor" />}
        {message && (
          <p className={cn("text-center mt-1", messageClassName)}>{message}</p>
        )}
      </div>
    </>
  );
}
