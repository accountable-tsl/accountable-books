import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';

interface SuccessProps {
  text?: string;
  showText?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  description?: string;
}

export const Success: React.FC<SuccessProps> = ({
  text = 'Success!',
  showText = true,
  size = 'md',
  className,
  description,
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
          'animate-scale-in flex items-center justify-center rounded-full border border-green-200 bg-green-100 dark:border-green-800 dark:bg-green-900/30',
          sizeClasses[size],
        )}
      >
        <Check
          size={iconSizes[size]}
          className="animate-fade-in text-green-600 dark:text-green-400"
          strokeWidth={3}
        />
      </div>

      {showText && text && (
        <div className="flex flex-col items-center">
          <p
            className={cn(
              'animate-fade-in font-medium text-green-700 dark:text-green-300',
              textSizes[size],
            )}
          >
            {text}
          </p>
          {description && (
            <p className={cn('text-muted-foreground animate-fade-in text-sm')}>
              {description}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
