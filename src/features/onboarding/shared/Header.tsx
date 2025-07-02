import { ThemeToggle } from "@/components/ThemeToggle";
import { OnboardingCallback } from "./Callback";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/shared/hooks/use-mobile";

export const OnboardingHeader = ({
  firmName,
  logoUrl,
  className,
}: {
  firmName?: string;
  className?: string;
  logoUrl?: string;
}) => {
  const isMobile = useIsMobile();
  const nameParts = (firmName ?? "").split(" ");
  const initials =
    nameParts[0].charAt(0) + nameParts[nameParts.length - 1].charAt(0);

  return (
    <>
      <div
        className={cn(
          "border-b h-12 flex items-center justify-between",
          className
        )}
      >
        <div className="md:w-[250px]">
          <div className="flex items-center gap-2 p-4 md:h-12">
            <div className="bg-muted rounded-full flex items-center justify-center h-6 w-6 overflow-hidden">
              {logoUrl ? (
                <img src={logoUrl} alt={`${firmName} Logo`} />
              ) : (
                <div className="p-1 text-sm">{initials}</div>
              )}
            </div>
            <div className="truncate text-muted-foreground">{firmName}</div>
          </div>
        </div>
        <div className="relative flex-1 flex items-center justify between">
          <div className="ml-auto mr-2">
            <ThemeToggle />
          </div>
          {!isMobile && (
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
          )}
        </div>
      </div>
    </>
  );
};
