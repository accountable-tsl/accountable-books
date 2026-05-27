import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/shared/hooks/use-media-query';
import { useSession } from '@session';
import { Headset, ScreenShareIcon } from 'lucide-react';

export function OnboardingFormFooter() {
  const isMobile = useIsMobile();
  const { logout } = useSession();

  const handleLogout = async () => {
    await logout();
  };

  return (
    <div className="mb-4 flex flex-col items-center gap-2 md:mb-8">
      {isMobile && (
        <span className="text-foreground/70 px-4 text-center text-xs">
          For a better experience, view on larger screen
        </span>
      )}
      {!isMobile && (
        <div
          className={cn(
            'text-muted-foreground hover:text-foreground flex cursor-pointer gap-1 text-sm hover:underline',
            'flex items-center gap-1',
            isMobile ? 'text-foreground font-medium underline' : '',
          )}
        >
          <span>See the platform in action</span> <ScreenShareIcon size={14} />
          {/* <span className={cn("font-medium cursor-pointer")}>Demo Company</span> */}
        </div>
      )}
      <div className="flex flex-col">
        <Button variant={'outline'} size={'sm'}>
          <Headset size={14} />
          <span className="text-xs font-light">Contact support</span>
        </Button>
        <Button
          variant="link"
          size={'sm'}
          className="text-muted-foreground h-6 text-xs"
          onClick={handleLogout}
        >
          Logout
        </Button>
      </div>
    </div>
  );
}
