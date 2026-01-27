import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface LoadingStateProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function LoadingState({
  message = 'Loading...',
  size = 'md',
  className,
}: LoadingStateProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
  };

  return (
    <div
      className={cn('flex items-center justify-center gap-2 p-4', className)}
    >
      <Loader2
        className={cn(sizeClasses[size], 'text-muted-foreground animate-spin')}
      />
      <span className="text-muted-foreground text-sm">{message}</span>
    </div>
  );
}

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return <div className={cn('bg-muted animate-pulse rounded', className)} />;
}

export function TransactionSkeleton() {
  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-6 w-24" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-6 w-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-6 w-full" />
        </div>
        <div className="col-span-2 space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-6 w-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-6 w-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-6 w-full" />
        </div>
      </div>

      <div className="space-y-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-8 w-full" />
      </div>
    </div>
  );
}
