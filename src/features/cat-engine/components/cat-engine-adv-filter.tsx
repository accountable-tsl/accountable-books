import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ToggleButton } from "@/features/cat-engine/components/toggle-button";
import { PanelLeftOpen } from "lucide-react";

export function CatEngineAdvFilter() {
  return (
    <Popover>
      <PopoverTrigger>
        <ToggleButton
          icon={<PanelLeftOpen className="w-4 h-4" />}
          tooltip="Advanced Filters"
          active={true}
          activeClasses="p-1.5"
        />
      </PopoverTrigger>
      <PopoverContent className="" align="start">
        <div>
          <h1>Advanced Filters Showing...</h1>
        </div>
      </PopoverContent>
    </Popover>
  );
}
