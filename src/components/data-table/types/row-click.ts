import { Row } from "@tanstack/react-table";

// export type RowViewOptions<TData> = {
//   enabled?: boolean;
//   trigger?: "row" | "button";
//   mode?: RowViewMode;

//   render?: (props: {
//     row: Row<TData>;
//     onClose?: () => void;
//   }) => React.ReactNode;

//   renderContent?: (props: {
//     row: Row<TData>;
//     onClose?: () => void;
//   }) => React.ReactNode;
// };

type RowViewWrapper = "sheet" | "dialog";

interface RowViewMode<TData> {
  mode: "view";
  wrapper?: RowViewWrapper;
  render: (props: {
    row?: Row<TData>;
    onClose?: () => void;
  }) => React.ReactNode;
}

interface RowRedirectMode<TData> {
  mode: "redirect";
  onClick: (row?: Row<TData>) => string;
}
interface RowCustomMode<TData> {
  mode: "custom";
  onClick: (row?: Row<TData>) => void;
}
export type RowClickBehavior<TData> =
  | RowViewMode<TData>
  | RowRedirectMode<TData>
  | RowCustomMode<TData>;

interface RowClickExtras<TData> {
  viewedRow?: Row<TData> | null;
  closeRowView?: () => void;
  handleRowClick?: (row: Row<TData>) => void;
}
export type ResolvedRowClick<TData> = RowClickBehavior<TData> &
  RowClickExtras<TData>;

export type RowViewerProps<TData = any> = RowViewMode<TData> &
  RowClickExtras<TData>;
