import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

interface FailedProps {
  text?: string;
  showText?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const Failed: React.FC<FailedProps> = ({
  text = 'Failed!',
  showText = true,
  size = 'md',
  className,
}) => {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
  };

  const iconSizes = {
    sm: 16,
    md: 24,
    lg: 32,
  };

  const textSizes = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
  };

  return (
    <div className={cn('flex flex-col items-center gap-3', className)}>
      <div
        className={cn(
          'rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center animate-scale-in border border-red-200 dark:border-red-800',
          sizeClasses[size],
        )}
      >
        <X
          size={iconSizes[size]}
          className="text-red-600 dark:text-red-400 animate-fade-in"
          strokeWidth={3}
        />
      </div>

      {showText && text && (
        <p
          className={cn(
            'text-red-700 dark:text-red-300 font-medium animate-fade-in',
            textSizes[size],
          )}
        >
          {text}
        </p>
      )}
    </div>
  );
};
