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
  // New props for wrapper mode
  wrapper?: boolean;
  children?: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  delayDuration?: number;
};

export const TooltipHelper = ({
  content,
  trigger,
  icon = true,
  iconSize = 12,
  contentStyle = "",
  ariaLabel = "",
  wrapper = false,
  children,
  side = "top",
  align = "center",
  delayDuration = 150,
}: HelpTooltipProps) => {
  // If no content, don't render tooltip
  if (!content || content.trim() === "") {
    return wrapper ? <>{children}</> : null;
  }

  // Wrapper mode - wrap children with tooltip
  if (wrapper && children) {
    return (
      <TooltipProvider delayDuration={delayDuration}>
        <Tooltip>
          <TooltipTrigger asChild aria-label={ariaLabel}>
            {children}
          </TooltipTrigger>
          <TooltipContent side={side} align={align}>
            <p className={`text-background/85 text ${contentStyle}`}>
              {content}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Original help icon mode (backward compatible)
  return (
    <TooltipProvider delayDuration={delayDuration}>
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
        <TooltipContent side={side} align={align}>
          <p className={`w-[200px] text-background/85 text ${contentStyle}`}>
            {content}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
