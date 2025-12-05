import { PanelLeftOpen } from 'lucide-react';

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ToggleButton } from '@/domains-pending-migration/cat-engine/components/toggle-button';

export function CatEngineAdvFilter() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <div>
          <ToggleButton
            icon={<PanelLeftOpen className="w-4 h-4" />}
            tooltip="Advanced Filters"
            active={false}
            activeClasses="p-1.5"
            ariaLabel="Open advanced filters"
          />
        </div>
      </PopoverTrigger>
      <PopoverContent align="start">
        <div className="min-w-64">
          <h2 className="text-sm font-medium mb-2">Advanced Filters</h2>
          <div className="text-xs text-muted-foreground">
            Coming soon: filter by amount range, confidence, contact, project,
            etc.
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
