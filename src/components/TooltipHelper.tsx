import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CircleHelp } from "lucide-react";

type HelpTooltipProps = {
  content?: string;
  trigger?: React.ReactNode | string;
  icon?: boolean;
  iconSize?: number;
  contentStyle?: string;
  ariaLabel?: string;
};

export const TooltipHelper = ({
  content,
  trigger,
  icon = true,
  iconSize = 12,
  contentStyle = "",
  ariaLabel = "",
}: HelpTooltipProps) => {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild aria-label={ariaLabel}>
          <div className="flex items-center">
            {trigger && typeof trigger !== "string" ? (
              trigger
            ) : (
              <span>{trigger}</span>
            )}
            {icon && (
              <CircleHelp
                size={iconSize}
                className="text-muted-foreground cursor-help"
              />
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" align="center">
          <p className={`w-[200px] text-background/85 text ${contentStyle}`}>
            {content}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
