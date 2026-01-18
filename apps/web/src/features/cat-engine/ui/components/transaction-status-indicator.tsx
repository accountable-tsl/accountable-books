import { CheckCircle2, Loader2, XCircle } from 'lucide-react';

interface TransactionStatusIndicatorProps {
  status: 'idle' | 'saving' | 'saved' | 'error';
  className?: string;
}

/**
 * Subtle per-row status indicator
 * - Spinner (saving): Shows when intent is pending
 * - Checkmark (saved): Shows briefly after successful save
 * - X (error): Shows when save failed
 * - Nothing (idle): Default state
 */
export function TransactionStatusIndicator({
  status,
  className = '',
}: TransactionStatusIndicatorProps) {
  if (status === 'idle') {
    return null;
  }

  if (status === 'saving') {
    return (
      <Loader2
        className={`text-muted-foreground h-3 w-3 animate-spin ${className}`}
      />
    );
  }

  if (status === 'saved') {
    return (
      <CheckCircle2
        className={`h-3 w-3 text-green-600 dark:text-green-400 ${className}`}
      />
    );
  }

  if (status === 'error') {
    return (
      <XCircle
        className={`h-3 w-3 text-red-600 dark:text-red-400 ${className}`}
      />
    );
  }

  return null;
}
