import type { ComponentPropsWithRef, ReactElement, ReactNode } from 'react';
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

const helpPopoverContentClass =
  'border-0 bg-primary px-3 py-1.5 text-xs text-primary-foreground shadow-md';

type TriggerElementProps = {
  href?: string;
  onClick?: unknown;
  onKeyDown?: unknown;
  onMouseDown?: unknown;
  onPointerDown?: unknown;
  role?: string;
  tabIndex?: number;
  className?: string;
  'aria-label'?: string;
};

function canUseAsChild(
  node: ReactNode,
): node is ReactElement<TriggerElementProps> {
  return isValidElement(node) && node.type !== Fragment;
}

function isInteractiveElement(
  element: ReactElement<TriggerElementProps>,
): boolean {
  const props = element.props;

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
  element: ReactElement<TriggerElementProps>,
  className?: string,
  ariaLabel?: string,
): ReactElement<TriggerElementProps> {
  const props = element.props;

  return cloneElement(element, {
    className: cn(props.className, className),
    'aria-label': props['aria-label'] ?? ariaLabel,
  });
}

function usePreferTapHelp(): boolean {
  const [preferTapHelp, setPreferTapHelp] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(PREFER_TAP_HELP_QUERY);
    const apply = () => setPreferTapHelp(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  return preferTapHelp;
}

function HelpBody({
  content,
  contentStyle,
  className,
}: Readonly<{
  content?: ReactNode;
  contentStyle?: string;
  className?: string;
}>) {
  return (
    <p
      className={cn(
        'text-primary-foreground/90 w-[200px] max-w-[min(200px,calc(100vw-2rem))]',
        contentStyle,
        className,
      )}
    >
      {content}
    </p>
  );
}

function HelpTriggerContent({
  trigger,
  icon,
  iconSize,
}: Readonly<{
  trigger?: ReactNode | string;
  icon: boolean;
  iconSize: number;
}>) {
  return (
    <>
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
    </>
  );
}

// Rendered via Radix `asChild`, which injects its trigger handlers and ref as
// props — they must be spread onto the real button or the tooltip/popover
// never opens.
function HelpWrapperButton({
  children,
  className,
  ariaLabel,
  variant,
  ...triggerProps
}: Readonly<
  ComponentPropsWithRef<'button'> & {
    ariaLabel?: string;
    variant: 'tap' | 'tooltip';
  }
>) {
  return (
    <button
      type="button"
      {...triggerProps}
      className={cn(
        className,
        wrapperTriggerClass,
        variant === 'tap' ? 'touch-manipulation' : 'cursor-help',
      )}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
}

function TapHelpPopover({
  trigger,
  body,
  side = 'top',
  align = 'center',
}: Readonly<{
  trigger: ReactNode;
  body: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
}>) {
  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        side={side}
        align={align}
        className={cn(helpPopoverContentClass, 'w-auto')}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {body}
      </PopoverContent>
    </Popover>
  );
}

function HoverHelpTooltip({
  trigger,
  body,
  side = 'top',
  align = 'center',
}: Readonly<{
  trigger: ReactNode;
  body: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
}>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{trigger}</TooltipTrigger>
      <TooltipContent side={side} align={align}>
        {body}
      </TooltipContent>
    </Tooltip>
  );
}

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
}: Readonly<HelpTooltipProps>) => {
  const preferTapHelp = usePreferTapHelp();
  const triggerElement = canUseAsChild(trigger) ? trigger : null;
  const hasInteractiveTrigger = triggerElement
    ? isInteractiveElement(triggerElement)
    : false;
  const useDirectTrigger =
    Boolean(triggerElement) && hasInteractiveTrigger && !icon;
  const fallbackAriaLabel =
    ariaLabel ?? (!trigger && icon ? 'Help' : undefined);
  const body = <HelpBody content={content} contentStyle={contentStyle} />;

  if (preferTapHelp && !hasInteractiveTrigger) {
    return (
      <TapHelpPopover
        body={body}
        trigger={
          <HelpWrapperButton
            variant="tap"
            className={triggerWrapperClassName}
            ariaLabel={fallbackAriaLabel}
          >
            <HelpTriggerContent
              trigger={trigger}
              icon={icon}
              iconSize={iconSize}
            />
          </HelpWrapperButton>
        }
      />
    );
  }

  const tooltipTrigger =
    useDirectTrigger && triggerElement ? (
      enhanceTriggerElement(
        triggerElement,
        cn(triggerWrapperClassName, 'cursor-help'),
        ariaLabel,
      )
    ) : (
      <HelpWrapperButton
        variant="tooltip"
        className={triggerWrapperClassName}
        ariaLabel={fallbackAriaLabel}
      >
        <HelpTriggerContent trigger={trigger} icon={icon} iconSize={iconSize} />
      </HelpWrapperButton>
    );

  return <HoverHelpTooltip trigger={tooltipTrigger} body={body} />;
};

type SimpleTooltipProps = {
  content: ReactNode;
  children: ReactElement<TriggerElementProps>;
  ariaLabel?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  contentClassName?: string;
};

export const SimpleTooltip = ({
  content,
  children,
  ariaLabel = '',
  side = 'top',
  align = 'center',
  contentClassName = '',
}: Readonly<SimpleTooltipProps>) => {
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
      <TapHelpPopover side={side} align={align} body={inner} trigger={child} />
    );
  }

  return (
    <HoverHelpTooltip side={side} align={align} body={inner} trigger={child} />
  );
};
