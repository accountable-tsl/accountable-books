import type { Row } from '@tanstack/react-table';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

interface RowViewerSheetProps<TData> {
  row: Row<TData>;
  onClose: () => void;
  renderContent?: () => React.ReactNode;
}

export function RowViewerSheet<TData>({
  row,
  onClose,
  renderContent,
}: RowViewerSheetProps<TData>) {
  return (
    <Sheet open={!!row} onOpenChange={(open) => !open && onClose?.()}>
      <SheetContent className="mx-auto w-md px-2 pb-2 sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="sr-only">View Row</SheetTitle>
          <SheetDescription className="sr-only">
            Selected row details
          </SheetDescription>
        </SheetHeader>
        {renderContent?.()}
      </SheetContent>
    </Sheet>
  );
}
