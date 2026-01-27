import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ToggleButton } from '@/domains-pending-migration/cat-engine/components/toggle-button';
import { PanelLeftOpen } from 'lucide-react';

export function CatEngineAdvFilter() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <div>
          <ToggleButton
            icon={<PanelLeftOpen className="h-4 w-4" />}
            tooltip="Advanced Filters"
            active={false}
            activeClasses="p-1.5"
            ariaLabel="Open advanced filters"
          />
        </div>
      </PopoverTrigger>
      <PopoverContent align="start">
        <div className="min-w-64">
          <h2 className="mb-2 text-sm font-medium">Advanced Filters</h2>
          <div className="text-muted-foreground text-xs">
            Coming soon: filter by amount range, confidence, contact, project,
            etc.
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
