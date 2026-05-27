import { ToggleButton } from '@/domains-pending-migration/cat-engine/components/toggle-button';
import { Focus, Menu, Rows3, TableProperties } from 'lucide-react';

export function LeftCatEngineToolbar({
  view,
  setView,
}: {
  view: 'table' | 'group';
  setView: (view: 'table' | 'group') => void;
}) {
  return (
    <div className="bg-muted flex h-full w-fit items-center gap-1 rounded px-1 py-0.5">
      <div className="text-muted-foreground pl-1 text-sm">View:</div>

      <ToggleButton
        active={view === 'table'}
        onClick={() => setView('table')}
        icon={<TableProperties className="h-4 w-4" />}
        tooltip="Table View"
      />
      <ToggleButton
        active={view === 'group'}
        onClick={() => setView('group')}
        icon={<Rows3 className="h-4 w-4" />}
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
  rowHeight: 'min' | 'mid' | 'max';
  setRowHeight: (height: 'min' | 'mid' | 'max') => void;
  isFullScreen: boolean;
  setIsFullScreen: (isFullScreen: boolean) => void;
}) {
  return (
    <div className="bg-muted flex h-full w-fit items-center gap-1 rounded px-1 py-0.5">
      <div className="text-muted-foreground pl-1 text-sm">Row:</div>
      <div className="text-muted-foreground flex items-center gap-1">
        <ToggleButton
          active={rowHeight === 'min'}
          onClick={() => setRowHeight('min')}
          icon={<Menu strokeWidth={1} className="h-4 w-4" />}
          tooltip="Compact Row Height"
          ariaLabel="Set compact row height"
        />
        <ToggleButton
          active={rowHeight === 'mid'}
          onClick={() => setRowHeight('mid')}
          icon={<Menu strokeWidth={2.5} className="h-4 w-4" />}
          tooltip="Medium Row Height"
          ariaLabel="Set medium row height"
        />
        <ToggleButton
          active={rowHeight === 'max'}
          onClick={() => setRowHeight('max')}
          icon={<Menu strokeWidth={4} className="h-4 w-4" />}
          tooltip="Large Row Height"
          ariaLabel="Set large row height"
        />
        <div className="text-muted-foreground">|</div>
        <ToggleButton
          active={isFullScreen}
          onClick={() => setIsFullScreen(!isFullScreen)}
          icon={<Focus className="h-4 w-4" />}
          tooltip="Focus"
        />
      </div>
    </div>
  );
}
