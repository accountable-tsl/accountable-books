import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { Eye, Save } from 'lucide-react';

export type CatEngineMode = 'review' | 'autosave';

interface CatEngineModeToggleProps {
  mode: CatEngineMode;
  onModeChange: (mode: CatEngineMode) => void;
}

export function CatEngineModeToggle({
  mode,
  onModeChange,
}: CatEngineModeToggleProps) {
  return (
    <div className="border-input bg-background inline-flex h-7.5 items-center rounded-md border p-0.5 shadow-sm">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => onModeChange('review')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs font-medium transition-all',
              'focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
              'disabled:pointer-events-none disabled:opacity-50',
              mode === 'review'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted/50',
            )}
            aria-pressed={mode === 'review'}
            aria-label="Review Mode"
          >
            <Eye className="h-3.5 w-3.5" />
            <span>Review</span>
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Review Mode - Manual save required</p>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => onModeChange('autosave')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs font-medium transition-all',
              'focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
              'disabled:pointer-events-none disabled:opacity-50',
              mode === 'autosave'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted/50',
            )}
            aria-pressed={mode === 'autosave'}
            aria-label="Autosave Mode"
          >
            <Save className="h-3.5 w-3.5" />
            <span>Autosave</span>
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Autosave Mode - Changes save automatically</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
