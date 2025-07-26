import { Row } from "@tanstack/react-table";
import { CoaResponse } from "@/features/coa/types";

export function CoaViewer({
  row,
  onClose,
}: {
  row?: Row<CoaResponse> | undefined;
  onClose?: () => void;
}) {
  return <div>CoaViewer</div>;
}
