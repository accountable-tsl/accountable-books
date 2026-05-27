import { ThemeToggle } from '@/components/ThemeToggle';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/shared/hooks/use-media-query';

import { OnboardingCallback } from './Callback';

export const OnboardingHeader = ({
  firmName,
  logoUrl,
  className,
  showSidebar,
  sidebarWidth,
}: {
  firmName?: string;
  className?: string;
  logoUrl?: string;
  showSidebar?: boolean;
  sidebarWidth?: string;
}) => {
  const isMobile = useIsMobile();
  const nameParts = (firmName ?? '').split(' ');
  const initials =
    nameParts[0].charAt(0) + nameParts[nameParts.length - 1].charAt(0);

  return (
    <>
      <div
        className={cn(
          'flex h-12 items-center justify-between border-b',
          className,
        )}
      >
        <div
          className={cn(
            showSidebar && sidebarWidth ? `md:w-[${sidebarWidth}]` : '',
          )}
        >
          <div className="flex items-center gap-2 p-4 md:h-12">
            <div className="bg-muted flex h-6 w-6 items-center justify-center overflow-hidden rounded-full">
              {logoUrl ? (
                <img src={logoUrl} alt={`${firmName} Logo`} />
              ) : (
                <div className="p-1 text-sm">{initials}</div>
              )}
            </div>
            <div className="text-muted-foreground truncate">{firmName}</div>
          </div>
        </div>
        <div
          className={cn(
            'justify between flex flex-1 items-center',
            showSidebar ? 'relative' : '',
          )}
        >
          <div className="mr-2 ml-auto">
            <ThemeToggle />
          </div>
          {!isMobile && (
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2">
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
