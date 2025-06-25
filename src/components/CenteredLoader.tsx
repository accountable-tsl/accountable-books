import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { BeatLoader, PuffLoader } from "react-spinners";
import { AuthHeader } from "./AuthHeader";

export function CenteredLoader({
  delay = 0,
  fullscreen = false,
  className,
  messageClassName,
  loader,
  message,
  showAuthHeader = false,
}: {
  delay?: number;
  fullscreen?: boolean;
  className?: string;
  loader?: React.ReactNode;
  message?: string;
  messageClassName?: string;
  showAuthHeader?: boolean;
}) {
  const [visible, setVisible] = useState(delay === 0);

  useEffect(() => {
    if (delay === 0) return;

    const timeout = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timeout);
  }, [delay]);

  if (!visible) return null;

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
