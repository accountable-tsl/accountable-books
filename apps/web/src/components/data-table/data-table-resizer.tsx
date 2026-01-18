import { GripVertical } from 'lucide-react';

import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

export function DataTableResizer({ header }: { header: any }) {
  const isResizing = header.column.getIsResizing();

  return (
    <div
      onDoubleClick={() => header.column.resetSize()}
      onMouseDown={header.getResizeHandler()}
      onTouchStart={header.getResizeHandler()}
      className={cn(
        'absolute top-1/2 right-0 flex h-full w-4 translate-x-1/2 -translate-y-1/2 cursor-col-resize touch-none items-center justify-center select-none',
        'z-20 opacity-0 group-hover/th:opacity-100',
        isResizing && 'opacity-100',
      )}
      aria-hidden="true"
      data-resizing={isResizing ? 'true' : undefined}
    >
      <div className="flex h-4/5 items-center justify-center">
        <Separator
          orientation="vertical"
          decorative={false}
          className={cn(
            'h-4/5 w-0.5 transition-colors duration-200',
            isResizing ? 'bg-primary' : 'bg-border',
          )}
        />

        {/* GripVertical icon for better visual indication */}
        <GripVertical
          className={cn(
            'text-muted-foreground/50 absolute h-4 w-4',
            isResizing ? 'text-primary' : 'text-muted-foreground/50',
          )}
          strokeWidth={1.5}
        />
      </div>
    </div>
  );
}
