import { cn } from '@/lib/utils';
import { Lock } from 'lucide-react';

export const FIRM_NO_BOOK_ACCESS_SUMMARY_ROSTER =
  "You don't have access to this client's books";

export const FIRM_NO_BOOK_ACCESS_SUMMARY_QUEUE =
  "You don't have access to this client's books for this task";

export const FIRM_NO_BOOK_ACCESS_DETAIL = import.meta.env.DEV
  ? "This company isn't in your signed-in accounts (common with demo data). Use the company switcher for books you can open, or a demo user whose clients match your session."
  : 'If this looks wrong, ask your firm admin to check which client books you can access.';

type FirmNoBookAccessContext = 'roster' | 'queue';

const SUMMARY_BY_CONTEXT: Record<FirmNoBookAccessContext, string> = {
  roster: FIRM_NO_BOOK_ACCESS_SUMMARY_ROSTER,
  queue: FIRM_NO_BOOK_ACCESS_SUMMARY_QUEUE,
};

type FirmNoBookAccessOverlayProps = {
  context: FirmNoBookAccessContext;
  className?: string;
  shortMessage?: string;
  detailMessage?: string;
};

export function FirmNoBookAccessOverlay({
  context,
  className,
  shortMessage,
  detailMessage = FIRM_NO_BOOK_ACCESS_DETAIL,
}: FirmNoBookAccessOverlayProps) {
  const line = shortMessage ?? SUMMARY_BY_CONTEXT[context];

  return (
    <div
      role="presentation"
      title={detailMessage}
      className={cn(
        'bg-background/80 text-muted-foreground absolute inset-0 z-10 flex cursor-default items-center justify-center gap-2 px-3 text-center text-[11px] leading-snug backdrop-blur-[2px] sm:text-xs',
        className,
      )}
    >
      <Lock className="size-4 shrink-0 opacity-90" aria-hidden />
      <span className="pointer-events-none max-w-[min(100%,15rem)] min-w-0 sm:max-w-100">
        {line}
      </span>
    </div>
  );
}
