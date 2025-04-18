import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CircleHelp } from "lucide-react";

type HelpTooltipProps = {
  content: string;
  iconSize?: number;
  contentStyle?: string;
  ariaLabel?: string;
};

export const TooltipHelper = ({
  content,
  iconSize = 12,
  contentStyle = "",
  ariaLabel = "",
}: HelpTooltipProps) => {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild aria-label={ariaLabel}>
          <CircleHelp
            size={iconSize}
            className="text-muted-foreground cursor-help"
          />
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
