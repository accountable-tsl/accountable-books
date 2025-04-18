import { CircleHelp } from "lucide-react";
import { Label } from "./ui/label";
import { TooltipHelper } from "./TooltipHelper";
import { cn } from "@/lib/utils";

type FormFieldProps = {
  id?: string;
  label?: string;
  renderLabel?: React.ReactNode;
  required?: boolean;
  error?: string;
  helpIcon?: boolean;
  helpTooltip?: string;
  iconSize?: number;
  tooltipStyle?: string;
  children: React.ReactNode;
  errorTooltip?: string;
  errorTooltipStyle?: string;

  // Optional class overrides
  className?: string;
  labelWrapperClassName?: string;
  labelClassName?: string;
  errorClassName?: string;
};

export const FormField = ({
  id,
  label,
  renderLabel,
  required,
  error,
  helpIcon,
  helpTooltip,
  iconSize = 12,
  tooltipStyle,
  children,
  errorTooltip,
  errorTooltipStyle,
  className = "",
}: FormFieldProps) => (
  <div className={cn("space-y-2 relative", className)}>
    {renderLabel ?? (
      <FormFieldLabel
        id={id}
        label={label}
        required={required}
        helpIcon={helpIcon}
        helpTooltip={helpTooltip}
        iconSize={iconSize}
        tooltipStyle={tooltipStyle}
        error={error}
        errorTooltip={errorTooltip}
        errorTooltipStyle={errorTooltipStyle}
      />
    )}
    {children}
  </div>
);

export const FormFieldLabel = ({
  id,
  label,
  required,
  helpIcon,
  helpTooltip,
  iconSize = 12,
  tooltipStyle,
  error,
  errorTooltip,
  errorTooltipStyle,
  labelWrapperClassName,
  labelClassName,
  errorClassName,
}: Omit<FormFieldProps, "children" | "renderLabel">) => (
  <div
    className={cn(
      "flex justify-between items-center gap-2",
      labelWrapperClassName
    )}
  >
    <div className="flex gap-1 items-center">
      <Label htmlFor={id} className={cn("whitespace-nowrap", labelClassName)}>
        {label}
        {required && <span className="-ml-1.5 text-destructive">*</span>}
      </Label>
      {helpIcon && (
        <CircleHelp size={iconSize} className="text-muted-foreground" />
      )}
      {helpTooltip && (
        <TooltipHelper
          content={helpTooltip}
          iconSize={iconSize}
          contentStyle={tooltipStyle}
        />
      )}
    </div>
    {error && (
      <div
        className={cn(
          "text-xs text-destructive truncate cursor-help",
          errorClassName
        )}
        id={`${id}-error`}
      >
        {error}
        {errorTooltip && (
          <TooltipHelper
            content={errorTooltip}
            contentStyle={errorTooltipStyle}
          />
        )}
      </div>
    )}
  </div>
);
