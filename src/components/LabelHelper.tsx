import { CircleHelp } from "lucide-react";
import { Label } from "./ui/label";
import { TooltipHelper } from "./TooltipHelper";

type HelpLabel = {
  htmlFor: string;
  children: React.ReactNode;
  showAsterisk?: boolean;
  helpIconOnly?: boolean;
  iconSize?: number;
  helpIconWithTooltip?: boolean;
  tooltipContent?: string;
  tooltipStyling?: string;
};

export const HelpLabel = ({
  htmlFor,
  children,
  showAsterisk = true,
  helpIconOnly = false,
  iconSize = 12,
  helpIconWithTooltip = false,
  tooltipContent = "",
  tooltipStyling = "",
}: HelpLabel) => {
  return (
    <div className="flex items-center gap-1">
      <Label
        htmlFor={htmlFor}
        className={
          showAsterisk
            ? "after:content-['*'] after:ml-0.5 after:text-red-500 gap-0"
            : ""
        }
      >
        {children}
      </Label>
      {helpIconOnly && (
        <CircleHelp size={iconSize} className="text-muted-foreground" />
      )}
      {helpIconWithTooltip && (
        <TooltipHelper
          content={tooltipContent}
          iconSize={iconSize}
          contentStyle={tooltipStyling}
        />
      )}
    </div>
  );
};
