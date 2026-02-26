import type React from 'react';
import { cn } from '@/lib/utils';
import { aiRuntimeStore } from '@/modules/ai';
import { Loader2, Wand2 } from 'lucide-react';

type AiAssistButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Show the loading / generating state. */
  isLoading?: boolean;
  /** Override the default "Generate" label. */
  label?: string;

  /** Accessibility label, useful when `label=""` to render icon-only. */
  ariaLabel?: string;
  /** Override the default "Writing..." loading label. */
  loadingLabel?: string;
};

export function AiAssistButton({
  isLoading = false,
  label = 'Generate',
  ariaLabel,
  loadingLabel = 'Writing...',
  className,
  disabled,
  type = 'button',
  children,
  ...buttonProps
}: AiAssistButtonProps) {
  const isAiEnabled = aiRuntimeStore((s) => s.policy.globalEnabled);

  if (!isAiEnabled) {
    return null;
  }

  const ariaLabelFromProps = buttonProps['aria-label'];
  const computedAriaLabel =
    ariaLabel ??
    ariaLabelFromProps ??
    (label === '' && children == null ? 'AI assist' : undefined);

  const isIconOnly =
    (children == null && label === '') ||
    (typeof children === 'string' && children.trim() === '');

  return (
    <button
      {...buttonProps}
      type={type}
      disabled={Boolean(disabled) || isLoading}
      aria-label={computedAriaLabel}
      className={cn(
        'text-muted-foreground hover:bg-accent hover:text-foreground flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-colors disabled:opacity-50',
        className,
        isIconOnly ? 'p-1' : '',
      )}
    >
      {isLoading ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Wand2 className="h-3 w-3" />
      )}
      {children ?? (isLoading ? loadingLabel : label)}
    </button>
  );
}
