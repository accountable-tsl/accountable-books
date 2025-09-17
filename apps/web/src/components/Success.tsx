import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

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
          'rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center animate-scale-in border border-green-200 dark:border-green-800',
          sizeClasses[size],
        )}
      >
        <Check
          size={iconSizes[size]}
          className="text-green-600 dark:text-green-400 animate-fade-in"
          strokeWidth={3}
        />
      </div>

      {showText && text && (
        <div className="flex flex-col items-center">
          <p
            className={cn(
              'text-green-700 dark:text-green-300 font-medium animate-fade-in',
              textSizes[size],
            )}
          >
            {text}
          </p>
          {description && (
            <p className={cn('text-muted-foreground text-sm animate-fade-in')}>
              {description}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
