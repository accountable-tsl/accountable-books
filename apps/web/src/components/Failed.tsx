import { X } from 'lucide-react';

import { cn } from '@/lib/utils';

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
          'animate-scale-in flex items-center justify-center rounded-full border border-red-200 bg-red-100 dark:border-red-800 dark:bg-red-900/30',
          sizeClasses[size],
        )}
      >
        <X
          size={iconSizes[size]}
          className="animate-fade-in text-red-600 dark:text-red-400"
          strokeWidth={3}
        />
      </div>

      {showText && text && (
        <p
          className={cn(
            'animate-fade-in font-medium text-red-700 dark:text-red-300',
            textSizes[size],
          )}
        >
          {text}
        </p>
      )}
    </div>
  );
};
