import { cn } from "@/lib/utils";
import {
  Expand,
  Menu,
  PanelLeftOpen,
  Rows3,
  TableProperties,
} from "lucide-react";
import { useMemo, useState } from "react";
import { ToggleButton } from "@/features/cat-engine/components/toggle-button";
import { useDataTable } from "@/components/data-table/use-data-table";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { DataTableToolbarConfig } from "@/components/data-table/toolbar";
import { getCatEngineColumns } from "@/features/cat-engine/config/table-columns";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export function CatEngine() {
  const [view, setView] = useState<"table" | "group">("table");
  const [rowHeight, setRowHeight] = useState<"min" | "mid" | "max">("mid");
  const [isFullScreen, setIsFullScreen] = useState(false);

  const columns = useMemo(() => getCatEngineColumns(), []);
  const customOptions = useMemo(() => {}, []);
  const { table } = useDataTable({
    columns: [],
    data: [],
  });

  return (
    <div className="min-h-0 h-full flex flex-col p-4 gap-4">
      <div className="flex justify-between items-center">
        <div className="flex gap-1 items-center">
          <div>
            <ToggleButton
              icon={<PanelLeftOpen className="w-4 h-4" />}
              tooltip="Advanced Filters"
              onClick={() => console.log("Advanced Filters clicked")}
              active={true}
            />
          </div>
          <div className="flex gap-1 items-center px-1 py-0.5 bg-muted w-fit rounded">
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
        </div>
        <div className="flex gap-1 items-center w-fit px-1 py-0.5 bg-muted rounded">
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
      </div>

      {view === "table" && <DataTable table={table} />}

      {/* {view === "group" && (
        <Accordion type="single" collapsible>
          <AccordionItem value="high-confidence">
            <AccordionTrigger>High Confidence</AccordionTrigger>
            <AccordionContent>
              <DataTable table={table} />
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="medium-confidence">
            <AccordionTrigger>Medium Confidence</AccordionTrigger>
            <AccordionContent>
              <DataTable table={table} />
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="low-confidence">
            <AccordionTrigger>Low Confidence</AccordionTrigger>
            <AccordionContent>
              <DataTable table={table} />
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="reviewed">
            <AccordionTrigger>Posted</AccordionTrigger>
            <AccordionContent>
              <DataTable table={table} />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )} */}
    </div>
  );
}
