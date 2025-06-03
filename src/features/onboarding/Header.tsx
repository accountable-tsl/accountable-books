import { ThemeToggle } from "@/components/ThemeToggle";
import { OnboardingCallback } from "./Callback";
import { cn } from "@/lib/utils";

export const OnboardingHeader = ({ className }: { className?: string }) => {
  return (
    <>
      <div
        className={cn(
          "border-b h-12 flex items-center justify-between px-2 relative",
          className
        )}
      >
        <div></div>
        <ThemeToggle />
        <div className="absolute left-1/2 -translate-x-1/2 bottom-0 translate-y-1/2">
          <OnboardingCallback />
          {/* <span className="text-nowrap">Need help? </span>
          <span className="font-medium hover:underline hover:text-foreground cursor-pointer text-nowrap flex">
            Request a callback <MousePointerClick size={16} />
          </span>
          <span className="text-nowrap hidden md:block">
            - we'll call to guide you through!
          </span> */}
        </div>
      </div>
    </>
  );
};
