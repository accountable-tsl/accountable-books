import { cn } from "@/lib/utils";
import React from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ToggleButtonProps {
  active: boolean;
  onClick?: () => void;
  icon: React.ReactNode;
  activeClasses?: string;
  inactiveClasses?: string;
  tooltip?: string;
  tooltipDisabled?: boolean;
}

export function ToggleButton({
  active,
  onClick,
  icon,
  activeClasses,
  inactiveClasses,
  tooltip,
  tooltipDisabled = false,
}: ToggleButtonProps) {
  // If tooltip is disabled or no tooltip content provided, return button without tooltip
  if (tooltipDisabled || !tooltip) {
    return (
      <div
        className={cn(
          "cursor-pointer hover:bg-background p-0.5 rounded text-muted-foreground border border-muted",
          "flex items-center justify-center",
          active
            ? activeClasses || "bg-background text-foreground border-border"
            : inactiveClasses || "opacity-50"
        )}
        onClick={onClick}
      >
        {icon}
      </div>
    );
  }

  // Return button wrapped with tooltip
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "cursor-pointer hover:bg-background p-0.5 rounded text-muted-foreground border border-muted",
            "flex items-center justify-center",
            active
              ? activeClasses || "bg-background text-foreground border-border"
              : inactiveClasses || "opacity-50"
          )}
          onClick={onClick}
        >
          {icon}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p>{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}
