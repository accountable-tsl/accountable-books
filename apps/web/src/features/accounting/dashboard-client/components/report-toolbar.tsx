import { useState } from 'react';
import { AiAssistButton } from '@/components/ai/ai-assist-button';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { aiRuntimeStore } from '@/modules/ai';
import { ChevronLeft, ChevronRight, Download, Printer, X } from 'lucide-react';

import {
  canCompare,
  canStepInDirection,
  formatCompareLabel,
  formatPeriodLabel,
  stepPeriod,
} from '../report-period';
import { ReportPeriodPicker } from './report-period-picker';

import type { PeriodBounds } from '../period-utils';
import type { ReportPeriod } from '../report-period';

export function ReportToolbar({
  period,
  bounds,
  onPeriodChange,
}: {
  period: ReportPeriod;
  bounds: PeriodBounds;
  onPeriodChange: (rp: ReportPeriod) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const label = formatPeriodLabel(period);
  const compareLabel = formatCompareLabel(period.compare);
  const showCompare = period.compare !== 'none' && canCompare(period);

  const canGoBack = canStepInDirection(period, -1, bounds);
  const canGoForward = canStepInDirection(period, 1, bounds);

  const handleStep = (direction: 1 | -1) => {
    onPeriodChange(stepPeriod(period, direction, bounds));
  };

  const handleRemoveCompare = () => {
    onPeriodChange({ ...period, compare: 'none' });
  };

  const handleAiAssist = () => {
    aiRuntimeStore
      .getState()
      .setInput(
        `Explain the key movements in this report for ${label}${showCompare ? ` (${compareLabel})` : ''}.`,
      );
    aiRuntimeStore.getState().open();
  };

  return (
    <div className="flex items-center justify-between gap-2">
      {/* Left: period navigation */}
      <div className="flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground size-7"
          disabled={!canGoBack}
          onClick={() => handleStep(-1)}
          aria-label="Previous period"
        >
          <ChevronLeft className="size-4" />
        </Button>

        <ReportPeriodPicker
          value={period}
          bounds={bounds}
          onChange={onPeriodChange}
          open={pickerOpen}
          onOpenChange={setPickerOpen}
        >
          <button
            type="button"
            className="hover:bg-accent rounded-md px-2 py-1 text-sm font-medium transition-colors"
          >
            {label}
          </button>
        </ReportPeriodPicker>

        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground size-7"
          disabled={!canGoForward}
          onClick={() => handleStep(1)}
          aria-label="Next period"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {/* Right: compare chip + actions */}
      <div className="flex items-center gap-1">
        {showCompare && (
          <button
            type="button"
            onClick={handleRemoveCompare}
            className="text-muted-foreground hover:bg-accent flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors"
          >
            {compareLabel}
            <X className="size-3" />
          </button>
        )}

        <AiAssistButton
          onClick={handleAiAssist}
          label=""
          ariaLabel="Open AI reporting assistant"
          className="text-muted-foreground hover:bg-accent hover:text-foreground size-7 justify-center rounded-md p-0"
        />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground size-7"
              aria-label="Export"
            >
              <Download className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {/* v1: implement CSV first (simpler); Excel later if needed */}
            <DropdownMenuItem disabled>Export as CSV</DropdownMenuItem>
            <DropdownMenuItem disabled>Export as Excel</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground size-7"
          onClick={() => window.print()}
          aria-label="Print"
        >
          <Printer className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
