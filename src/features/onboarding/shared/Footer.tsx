import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/hooks";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { Headset, ScreenShareIcon } from "lucide-react";

export function OnboardingFormFooter() {
  const isMobile = useIsMobile();
  const { logout } = useAuth();

  const handleLogout = async () => {
    await logout();
  };

  return (
    <div className="flex flex-col items-center gap-2 mb-4 md:mb-8">
      {isMobile && (
        <span className="text-center text-foreground/70 text-xs px-4">
          For a better experience, view on larger screen
        </span>
      )}
      {!isMobile && (
        <div
          className={cn(
            "text-sm hover:underline flex gap-1 text-muted-foreground hover:text-foreground cursor-pointer",
            "flex items-center gap-1",
            isMobile ? "font-medium underline text-foreground" : ""
          )}
        >
          <span>See the platform in action</span> <ScreenShareIcon size={14} />
          {/* <span className={cn("font-medium cursor-pointer")}>Demo Company</span> */}
        </div>
      )}
      <div className="flex flex-col">
        <Button variant={"outline"} size={"sm"}>
          <Headset size={14} />
          <span className="font-light text-xs">Contact support</span>
        </Button>
        <Button
          variant="link"
          size={"sm"}
          className="text-xs text-muted-foreground h-6"
          onClick={handleLogout}
        >
          Logout
        </Button>
      </div>
    </div>
  );
}
