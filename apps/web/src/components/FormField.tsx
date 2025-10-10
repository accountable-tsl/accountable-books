import { CircleHelp } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { TooltipHelper } from './TooltipHelper';
import { cn } from '@/lib/utils';
import { HTMLAttributes } from 'react';

interface FormFieldProps extends HTMLAttributes<HTMLDivElement> {
  id?: string;
  label?: string;
  renderLabel?: React.ReactNode;
  required?: boolean;
  error?: string;
  helpIcon?: boolean;
  helpTooltip?: string;
  iconSize?: number;
  tooltipStyle?: string;
  children?: React.ReactNode;
  errorTooltip?: boolean;
  errorTooltipStyle?: string;

  // Optional class overrides
  className?: string;
  labelWrapperClassName?: string;
  labelClassName?: string;
  errorClassName?: string;
}

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
  className = '',
  errorClassName,
  ...rest
}: FormFieldProps) => (
  <div className={cn('space-y-2 relative', className)} {...rest}>
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
        errorClassName={errorClassName}
        {...rest}
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
}: Omit<FormFieldProps, 'children' | 'renderLabel'>) => (
  <div
    className={cn(
      'flex justify-between items-center gap-2',
      labelWrapperClassName,
    )}
  >
    <div className="flex gap-1 items-center">
      <Label htmlFor={id} className={cn('whitespace-nowrap', labelClassName)}>
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
          'text-xs text-destructive truncate cursor-help',
          errorClassName,
        )}
        id={`${id}-error`}
      >
        {errorTooltip ? '' : error}
        {errorTooltip && (
          <TooltipHelper
            content={error}
            contentStyle={errorTooltipStyle}
            trigger={error}
          />
        )}
      </div>
    )}
  </div>
);
