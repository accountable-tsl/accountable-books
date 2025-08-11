import {
  PanelLeftOpen,
  TableProperties,
  Rows3,
  Menu,
  Expand,
} from "lucide-react";
import { ToggleButton } from "@/features/cat-engine/components/toggle-button";

export function LeftCatEngineToolbar({
  view,
  setView,
}: {
  view: "table" | "group";
  setView: (view: "table" | "group") => void;
}) {
  return (
    <div className="flex gap-1 items-center px-1 py-0.5 bg-muted w-fit rounded h-full">
      <div className="text-muted-foreground text-sm pl-1">View:</div>

      <ToggleButton
        active={view === "table"}
        onClick={() => setView("table")}
        icon={<TableProperties className="w-4 h-4" />}
        tooltip="Table View"
      />
      <ToggleButton
        active={view === "group"}
        onClick={() => setView("group")}
        icon={<Rows3 className="w-4 h-4" />}
        tooltip="View by Confidence"
      />
    </div>
  );
}
export function RightCatEngineToolbar({
  rowHeight,
  setRowHeight,
  isFullScreen,
  setIsFullScreen,
}: {
  rowHeight: "min" | "mid" | "max";
  setRowHeight: (height: "min" | "mid" | "max") => void;
  isFullScreen: boolean;
  setIsFullScreen: (isFullScreen: boolean) => void;
}) {
  return (
    <div className="flex gap-1 items-center w-fit px-1 py-0.5 bg-muted rounded h-full">
      <div className="text-sm text-muted-foreground pl-1">Row:</div>
      <div className="flex gap-1 items-center text-muted-foreground">
        <ToggleButton
          active={rowHeight === "min"}
          onClick={() => setRowHeight("min")}
          icon={<Menu strokeWidth={1} className="w-4 h-4" />}
          tooltip="Compact Row Height"
        />
        <ToggleButton
          active={rowHeight === "mid"}
          onClick={() => setRowHeight("mid")}
          icon={<Menu strokeWidth={2.5} className="w-4 h-4" />}
          tooltip="Medium Row Height"
        />
        <ToggleButton
          active={rowHeight === "max"}
          onClick={() => setRowHeight("max")}
          icon={<Menu strokeWidth={4} className="w-4 h-4" />}
          tooltip="Large Row Height"
        />
        <div className="text-muted-foreground">|</div>
        <ToggleButton
          active={isFullScreen}
          onClick={() => setIsFullScreen(!isFullScreen)}
          icon={<Expand className="w-4 h-4" />}
          tooltip="View Full Screen"
        />
      </div>
    </div>
  );
}
