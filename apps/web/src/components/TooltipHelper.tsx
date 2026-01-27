import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { CircleHelp } from 'lucide-react';

type HelpTooltipProps = {
  content?: string;
  trigger?: React.ReactNode | string;
  icon?: boolean;
  iconSize?: number;
  contentStyle?: string;
  ariaLabel?: string;
  triggerWrapperClassName?: string;
};

export const TooltipHelper = ({
  content,
  trigger,
  icon = true,
  iconSize = 12,
  contentStyle = '',
  ariaLabel = '',
  triggerWrapperClassName = 'flex items-center',
}: HelpTooltipProps) => {
  return (
    <Tooltip>
      <TooltipTrigger asChild aria-label={ariaLabel}>
        <div className={triggerWrapperClassName}>
          {trigger && typeof trigger !== 'string' ? (
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
        <p className={`text-background/85 text w-[200px] ${contentStyle}`}>
          {content}
        </p>
      </TooltipContent>
    </Tooltip>
  );
};

type SimpleTooltipProps = {
  content: React.ReactNode;
  children: React.ReactElement; // must be an element for asChild to work
  ariaLabel?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  contentClassName?: string; // was contentStyle
};

export const SimpleTooltip: React.FC<SimpleTooltipProps> = ({
  content,
  children,
  ariaLabel = '',
  side = 'top',
  align = 'center',
  contentClassName = '',
}) => {
  return (
    <Tooltip>
      <TooltipTrigger asChild aria-label={ariaLabel}>
        {children}
      </TooltipTrigger>

      <TooltipContent side={side} align={align}>
        <p className={`max-w-[240px] text-sm ${contentClassName}`}>{content}</p>
      </TooltipContent>
    </Tooltip>
  );
};
