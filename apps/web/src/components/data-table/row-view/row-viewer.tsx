import { RowViewerSheet } from '@/components/data-table/row-view/row-viewer-sheet';
import type { RowViewerProps } from '@/components/data-table/types/row-click';

export function RowViewer<TData>({
  rowViewerInfo,
}: {
  rowViewerInfo: RowViewerProps<TData>;
}) {
  const { wrapper, render, viewedRow, closeRowView: onClose } = rowViewerInfo;

  if (!viewedRow) return null;

  const renderContent = render
    ? () => render({ row: viewedRow, onClose })
    : undefined;
  switch (wrapper) {
    case 'dialog':
    case 'sheet':
      return (
        <RowViewerSheet
          row={viewedRow}
          onClose={onClose || (() => {})}
          renderContent={renderContent}
        />
      );
    // case "dialog":
    //   return (
    //     <RowViewerDialog
    //       row={row}
    //       onClose={onClose}
    //       renderContent={renderContent}
    //     />
    //   );
    default:
      return null;
  }
}
