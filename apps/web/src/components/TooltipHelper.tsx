import type { KeyboardEvent, ReactElement, ReactNode } from 'react';
import {
  cloneElement,
  Fragment,
  isValidElement,
  useEffect,
  useState,
} from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { CircleHelp } from 'lucide-react';

/** True when we should use tap-to-open help instead of hover tooltip. */
const PREFER_TAP_HELP_QUERY =
  '(pointer: coarse), (any-pointer: coarse), (hover: none), (any-hover: none)';

const INTERACTIVE_TAGS = new Set([
  'a',
  'button',
  'input',
  'select',
  'summary',
  'textarea',
]);

const INTERACTIVE_ROLES = new Set([
  'button',
  'checkbox',
  'link',
  'menuitem',
  'option',
  'radio',
  'switch',
  'tab',
]);

const wrapperTriggerClass =
  'rounded-sm bg-transparent p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/50';

const handlePseudoButtonKeyDown = (event: KeyboardEvent<HTMLElement>) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  event.currentTarget.click();
};

function canUseAsChild(node: ReactNode): node is ReactElement {
  return isValidElement(node) && node.type !== Fragment;
}

function isInteractiveElement(element: ReactElement): boolean {
  const props = element.props as {
    href?: string;
    onClick?: unknown;
    onKeyDown?: unknown;
    onMouseDown?: unknown;
    onPointerDown?: unknown;
    role?: string;
    tabIndex?: number;
  };

  return (
    (typeof element.type === 'string' && INTERACTIVE_TAGS.has(element.type)) ||
    typeof props.href === 'string' ||
    typeof props.onClick === 'function' ||
    typeof props.onKeyDown === 'function' ||
    typeof props.onMouseDown === 'function' ||
    typeof props.onPointerDown === 'function' ||
    (typeof props.role === 'string' && INTERACTIVE_ROLES.has(props.role)) ||
    typeof props.tabIndex === 'number'
  );
}

function enhanceTriggerElement(
  element: ReactElement,
  className?: string,
  ariaLabel?: string,
): ReactElement {
  const props = element.props as {
    'aria-label'?: string;
    className?: string;
  };

  return cloneElement(element, {
    className: cn(props.className, className),
    'aria-label': props['aria-label'] ?? ariaLabel,
  });
}

function usePreferTapHelp(): boolean {
  const [preferTapHelp, setPreferTapHelp] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(PREFER_TAP_HELP_QUERY);
    const legacyMq = mq as MediaQueryList & {
      addListener?: (listener: (event: MediaQueryListEvent) => void) => void;
      removeListener?: (listener: (event: MediaQueryListEvent) => void) => void;
    };
    const apply = () => setPreferTapHelp(mq.matches);
    apply();

    if ('addEventListener' in mq) {
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }

    legacyMq.addListener?.(apply);
    return () => legacyMq.removeListener?.(apply);
  }, []);

  return preferTapHelp;
}

const helpPopoverContentClass =
  'border-0 bg-primary px-3 py-1.5 text-xs text-primary-foreground shadow-md';

type HelpTooltipProps = {
  content?: string;
  trigger?: ReactNode | string;
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
  ariaLabel,
  triggerWrapperClassName = 'flex items-center',
}: HelpTooltipProps) => {
  const preferTapHelp = usePreferTapHelp();
  const triggerElement = canUseAsChild(trigger) ? trigger : null;
  const hasInteractiveTrigger = triggerElement
    ? isInteractiveElement(triggerElement)
    : false;
  const useDirectTrigger = !!triggerElement && hasInteractiveTrigger && !icon;
  const fallbackAriaLabel =
    ariaLabel ?? (!trigger && icon ? 'Help' : undefined);

  const body = (
    <p
      className={cn(
        'text-primary-foreground/90 w-[200px] max-w-[min(200px,calc(100vw-2rem))]',
        contentStyle,
      )}
    >
      {content}
    </p>
  );

  if (preferTapHelp && !hasInteractiveTrigger) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <div
            role="button"
            tabIndex={0}
            className={cn(
              triggerWrapperClassName,
              wrapperTriggerClass,
              'touch-manipulation',
            )}
            aria-label={fallbackAriaLabel}
            onKeyDown={handlePseudoButtonKeyDown}
          >
            {trigger && typeof trigger !== 'string' ? (
              trigger
            ) : (
              <span>{trigger}</span>
            )}
            {icon ? (
              <CircleHelp
                size={iconSize}
                className="text-muted-foreground shrink-0"
              />
            ) : null}
          </div>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="center"
          className={cn(helpPopoverContentClass, 'w-auto')}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {body}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {useDirectTrigger ? (
          enhanceTriggerElement(
            triggerElement,
            cn(triggerWrapperClassName, 'cursor-help'),
            ariaLabel,
          )
        ) : (
          <div
            role="button"
            tabIndex={0}
            className={cn(
              triggerWrapperClassName,
              wrapperTriggerClass,
              'cursor-help',
            )}
            aria-label={fallbackAriaLabel}
            onKeyDown={handlePseudoButtonKeyDown}
          >
            {trigger && typeof trigger !== 'string' ? (
              trigger
            ) : (
              <span>{trigger}</span>
            )}
            {icon ? (
              <CircleHelp
                size={iconSize}
                className="text-muted-foreground shrink-0"
              />
            ) : null}
          </div>
        )}
      </TooltipTrigger>
      <TooltipContent side="top" align="center">
        {body}
      </TooltipContent>
    </Tooltip>
  );
};

type SimpleTooltipProps = {
  content: ReactNode;
  children: ReactElement;
  ariaLabel?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  contentClassName?: string;
};

export const SimpleTooltip: React.FC<SimpleTooltipProps> = ({
  content,
  children,
  ariaLabel = '',
  side = 'top',
  align = 'center',
  contentClassName = '',
}) => {
  const preferTapHelp = usePreferTapHelp();
  const interactiveChild = isInteractiveElement(children);
  const child = enhanceTriggerElement(
    children,
    undefined,
    ariaLabel || undefined,
  );

  const inner = (
    <div
      className={cn(
        'text-primary-foreground/90 max-w-[min(240px,calc(100vw-2rem))] text-sm',
        contentClassName,
      )}
    >
      {content}
    </div>
  );

  if (preferTapHelp && !interactiveChild) {
    return (
      <Popover>
        <PopoverTrigger asChild>{child}</PopoverTrigger>
        <PopoverContent
          side={side}
          align={align}
          className={cn(helpPopoverContentClass, 'w-auto')}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {inner}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{child}</TooltipTrigger>

      <TooltipContent side={side} align={align}>
        {inner}
      </TooltipContent>
    </Tooltip>
  );
};
