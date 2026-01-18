import { CircleHelp } from 'lucide-react';
import { HTMLAttributes } from 'react';

import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

import { TooltipHelper } from './TooltipHelper';

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
  <div className={cn('relative space-y-2', className)} {...rest}>
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
      'flex items-center justify-between gap-2',
      labelWrapperClassName,
    )}
  >
    <div className="flex items-center gap-1">
      <Label htmlFor={id} className={cn('whitespace-nowrap', labelClassName)}>
        {label}
        {required && <span className="text-destructive -ml-1.5">*</span>}
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
          'text-destructive cursor-help truncate text-xs',
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
