import { cn } from '@/lib/utils';
import { aiRuntimeStore } from '@/modules/ai';
import { Loader2, Wand2 } from 'lucide-react';

interface AiAssistButtonProps {
  /** Handler invoked when the button is clicked — domain provides the AI logic. */
  onClick: () => void;
  /** Show the loading / generating state. */
  isLoading?: boolean;
  /** Override the default "Generate" label. */
  label?: string;

  /** Accessibility label, useful when `label=""` to render icon-only. */
  ariaLabel?: string;
  /** Override the default "Writing..." loading label. */
  loadingLabel?: string;
  /** Merge additional classes onto the root button. */
  className?: string;
  /** Optional mousedown handler (e.g. preventDefault to keep focus on adjacent input until click). */
  onMouseDown?: React.MouseEventHandler<HTMLButtonElement>;
}

export function AiAssistButton({
  onClick,
  isLoading = false,
  label = 'Generate',
  ariaLabel,
  loadingLabel = 'Writing...',
  className,
  onMouseDown,
}: AiAssistButtonProps) {
  const isAiEnabled = aiRuntimeStore((s) => s.policy.globalEnabled);

  if (!isAiEnabled) {
    return null;
  }

  const computedAriaLabel =
    ariaLabel ?? (label === '' ? 'AI assist' : undefined);

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseDown={onMouseDown}
      disabled={isLoading}
      aria-label={computedAriaLabel}
      className={cn(
        'text-muted-foreground hover:bg-accent hover:text-foreground flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-colors disabled:opacity-50',
        className,
        label === '' ? 'p-1' : '',
      )}
    >
      {isLoading ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Wand2 className="h-3 w-3" />
      )}
      {isLoading ? loadingLabel : label}
    </button>
  );
}
