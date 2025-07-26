import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Row } from "@tanstack/react-table";

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
      <SheetContent className="w-md sm:max-w-md mx-auto px-2">
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
