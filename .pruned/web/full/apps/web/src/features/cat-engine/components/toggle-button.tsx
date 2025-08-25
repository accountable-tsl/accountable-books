import { cn } from '@/lib/utils';
import React from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface ToggleButtonProps {
  active: boolean;
  onClick?: () => void;
  icon: React.ReactNode;
  activeClasses?: string;
  inactiveClasses?: string;
  tooltip?: string;
  tooltipDisabled?: boolean;
  ariaLabel?: string;
}

export function ToggleButton({
  active,
  onClick,
  icon,
  activeClasses,
  inactiveClasses,
  tooltip,
  tooltipDisabled = false,
  ariaLabel,
}: ToggleButtonProps) {
  const commonProps = {
    'aria-pressed': active,
    'aria-label': ariaLabel || tooltip || undefined,
    role: 'button',
    tabIndex: 0,
    onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick?.();
      }
    },
  } as const;

  const classes = cn(
    'cursor-pointer hover:bg-background p-0.5 rounded text-muted-foreground border border-muted',
    'flex items-center justify-center',
    active
      ? activeClasses || 'bg-background text-foreground border-border'
      : inactiveClasses || 'opacity-50',
  );

  if (tooltipDisabled || !tooltip) {
    return (
      <div className={classes} onClick={onClick} {...commonProps}>
        {icon}
      </div>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={classes} onClick={onClick} {...commonProps}>
          {icon}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p>{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}
