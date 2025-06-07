import { cn } from "@/lib/utils";
import { Check, LucideIcon, MenuIcon } from "lucide-react";
import { useState } from "react";
import {
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/shared/hooks/use-mobile";

type Step = {
  key: string | number;
  title: string;
  description: string;
  icon: LucideIcon;
};

type SingleStepProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  active?: boolean;
  completed?: boolean;
};

export function VerticalStepper({
  steps,
  currentStep: controlledStep,
  onChange,
  stepperOption = 1,
  className,
  footer,
}: {
  steps: Step[];
  currentStep?: string | number;
  onChange?: (newStep: string | number) => void;
  stepperOption?: number;
  className?: string;
  footer?: string | React.ReactNode;
}) {
  const [internalStep] = useState<string | number>(steps[0]?.key ?? "");
  // Use controlledStep if provided, otherwise fall back to internalStep
  const currentStep =
    controlledStep !== undefined ? controlledStep : internalStep;

  const currentStepObj = steps.find((step) => step.key === currentStep);
  const currentIndex = steps.findIndex((step) => step.key === currentStep);
  const isMobile = useIsMobile();

  const stepUi = (step: SingleStepProps) => {
    if (stepperOption === 1) {
      return (
        <>
          <SingleStep
            icon={step.icon}
            title={step.title}
            description={step.description}
            active={step.active}
            completed={step.completed}
          />
        </>
      );
    }
    return (
      <SingleStep
        icon={step.icon}
        title={step.title}
        description={step.description}
        active={step.active}
        completed={step.completed}
      />
    );
  };

  const renderedSteps = steps.map((step, index) => {
    const uniqueKey = step.key;
    const isActive = String(uniqueKey) === String(currentStep);
    const isCompleted = index < currentIndex;
    const isLastStep = index === steps.length - 1;

    const stepObj = {
      ...step,
      active: isActive,
      completed: isCompleted,
    };

    return (
      <div
        key={String(uniqueKey)}
        className={cn(
          isMobile ? "" : "hidden md:block relative space-y-6",
          className
        )}
      >
        {stepUi(stepObj)}

        {/* Connecting line on desktop */}
        {!isMobile && !isLastStep && (
          <div
            className={cn(
              "absolute left-4 top-8 -ml-px h-full w-0.5",
              isCompleted ? "bg-ring/50" : "bg-ring"
            )}
            // style={{ height: "2.5rem" }} // Matches space-y-4 and SingleStep height
            aria-hidden="true"
          />
        )}
      </div>
    );
  });

  if (!steps.length || currentStepObj === undefined) return null;

  return (
    <>
      <div className="px-4 overflow-hidden">
        {/* Mobile header with current step and menu button */}
        <div className="md:hidden flex items-center justify-between p-3 rounded-md mb-4 bg-card shadow-sm">
          <SheetTrigger
            className="p-2 rounded-md outline bg-background"
            aria-label="Toggle progress menu"
          >
            <MenuIcon className="w-5 h-5" />
            <span className="sr-only">Toggle onboarding navigation menu</span>
          </SheetTrigger>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-sm">
              <currentStepObj.icon className="h-4 w-4" />
            </div>
            <span className="text-sm">{currentStepObj.title}</span>
            <span className="text-xs text-gray-500">
              Step {currentIndex + 1} of {steps.length}
            </span>
          </div>
        </div>

        {isMobile ? (
          <SheetContent side="left" className="p-4">
            <SheetHeader className="px-0">
              <SheetTitle>Onboarding Steps</SheetTitle>
              <SheetDescription className="hidden">
                Progress menu
              </SheetDescription>
            </SheetHeader>
            {renderedSteps}
            {footer && <StepperFooter>{footer}</StepperFooter>}
          </SheetContent>
        ) : (
          renderedSteps
        )}
      </div>
    </>
  );
}

const SingleStep: React.FC<SingleStepProps> = ({
  icon: Icon,
  title,
  description,
  active,
  completed,
}) => {
  return (
    <div className="flex items-center gap-2 text-sm md:text-base">
      <div
        className={cn(
          "bg-background p-2 rounded-md outline relative z-10 flex h-8 w-8 shrink-0 items-center justify-center border",
          active ? "outline-card-foreground" : ""
        )}
      >
        {completed ? (
          <Check />
        ) : (
          <Icon color={`${active ? "currentColor" : "gray"}`} />
        )}
      </div>
      <div className="flex flex-col min-w-0">
        <div
          className={cn(
            "truncate text-sm text-muted-foreground/50",
            active ? "text-card-foreground" : ""
            // active || completed ? "text-gray-900" : "text-gray-500"
          )}
        >
          {title}
        </div>
        <div
          className={cn(
            "text-muted-foreground/30 text-xs truncate",
            active ? "text-card-foreground" : "" // "truncate text-xs text-gray-500"
          )}
        >
          {description}
        </div>
      </div>
    </div>
  );
};

interface StepperFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  children: string | React.ReactNode;
}

const StepperFooter = ({
  className,
  children,
  ...props
}: StepperFooterProps) => {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 py-2 md:p-4", className)}
      {...props}
    >
      {children}
    </div>
  );
};
