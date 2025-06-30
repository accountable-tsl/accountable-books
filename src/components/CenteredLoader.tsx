import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import {  PuffLoader } from "react-spinners";
import { AuthHeader } from "./AuthHeader";
import ErrorPage from "./ErrorPage";

export function CenteredLoader({
  delay = 0,
  fullscreen = false,
  className,
  messageClassName,
  loader,
  message,
  showAuthHeader = false,
  errorTimeout = 15000,
}: {
  delay?: number;
  fullscreen?: boolean;
  className?: string;
  loader?: React.ReactNode;
  message?: string;
  messageClassName?: string;
  showAuthHeader?: boolean;
  errorTimeout?: number; // Time in ms before showing error
}) {
  const [visible, setVisible] = useState(delay === 0);
  const [showError, setShowError] = useState(false);

  useEffect(() => {
    if (delay === 0) {
      const errorTimeoutId = setTimeout(() => setShowError(true), errorTimeout);
      return () => clearTimeout(errorTimeoutId);
    }

    const showTimeout = setTimeout(() => setVisible(true), delay);
    const errorTimeoutId = setTimeout(
      () => setShowError(true),
      delay + errorTimeout
    );
    return () => {
      clearTimeout(showTimeout);
      clearTimeout(errorTimeoutId);
    };
  }, [delay, errorTimeout]);

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
