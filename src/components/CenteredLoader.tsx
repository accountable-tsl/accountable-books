import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { BeatLoader } from "react-spinners";

export function CenteredLoader({
  delay = 0,
  fullscreen = false,
  className,
  loader,
}: {
  delay?: number;
  fullscreen?: boolean;
  className?: string;
  loader?: React.ReactNode;
}) {
  const [visible, setVisible] = useState(delay === 0);

  useEffect(() => {
    if (delay === 0) return;

    const timeout = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timeout);
  }, [delay]);

  if (!visible) return null;

  return (
    <div
      className={cn(
        "flex items-center justify-center",
        fullscreen
          ? "fixed inset-0 z-50 bg-background/50 backdrop-blur-sm"
          : "w-full h-full",
        className
      )}
    >
      {loader ?? <BeatLoader color="currentColor" />}
    </div>
  );
}
