import { Check, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { OnboardingFormFooter } from '@/domains-pending-migration/onboarding/shared/Footer';
import type { EnrichedOnboardingStep } from '@/domains-pending-migration/onboarding/types';
import { cn } from '@/lib/utils';

export function OnboardingSidebar({
  steps,
  className,
}: {
  steps: EnrichedOnboardingStep[];
  className?: string;
}) {
  const renderedSteps = (
    <div className="relative flex flex-col gap-6 pt-4">
      <div className="absolute top-4 bottom-4 left-4 w-px bg-border z-0" />

      {steps.map((step) => {
        const { title, description, icon: Icon, current, complete } = step;
        return (
          <div
            key={step.key}
            className="relative flex gap-2 items-center text-sm md:text-base"
          >
            <div
              className={cn(
                // "bg-background p-2 rounded-md outline relative flex h-8 w-8 shrink-0 items-center justify-center border",
                'h-8 w-8 flex items-center justify-center shrink-0 border rounded-md bg-background',
                current ? 'border-foreground' : '',
              )}
            >
              {complete ? (
                <Check size={14} />
              ) : (
                <Icon
                  color={`${current ? 'currentColor' : 'gray'}`}
                  size={14}
                />
              )}
            </div>

            <div className="flex flex-col min-w-0">
              <div
                className={cn(
                  'truncate text-sm text-muted-foreground/50',
                  current ? 'text-card-foreground' : '',
                  // current || completed ? "text-gray-900" : "text-gray-500"
                )}
              >
                {title}
              </div>
              <div
                className={cn(
                  'text-muted-foreground/30 text-xs truncate',
                  current ? 'text-card-foreground/50' : '', // "truncate text-xs text-gray-500"
                )}
              >
                {description}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className={cn('flex flex-col justify-between flex-1', className)}>
      <div className="px-4 overflow-hidden">{renderedSteps}</div>
      <OnboardingFormFooter />
    </div>
  );
}

export function MobileOnboardingSidebar({
  steps,
  onClose,
}: {
  steps: EnrichedOnboardingStep[];
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-50 flex">
      {/* Clickable overlay */}
      <div className="flex-1 bg-black/50" onClick={onClose} />

      {/* Sidebar content */}
      <div className="w-2/3 max-w-xs min-w-[250px] bg-background shadow-lg border-l relative flex flex-col">
        <div className="flex items-center justify-between p-3">
          <div className="text-muted-foreground">Onboarding Steps</div>

          <Button
            variant={'ghost'}
            size={'icon'}
            onClick={onClose}
            className="text-muted-foreground ml-auto"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <OnboardingSidebar steps={steps} />
      </div>
    </div>
  );
}
