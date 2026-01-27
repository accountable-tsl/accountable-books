import type {
  PayrollComputedRun,
  PayrollRun,
  PayrollRunIndexEntry,
} from '@/payroll/domain';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { formatMonthGaps } from '@/payroll/compute/gap-detection';
import { formatPeriodLong } from '@/payroll/utils';
import { motion } from 'framer-motion';
import {
  CircleCheckBig,
  CloudUploadIcon,
  TriangleAlertIcon,
} from 'lucide-react';

function formatNgnAmount(value: unknown): string {
  const asNumber =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? parseFloat(value)
        : NaN;
  if (!Number.isFinite(asNumber)) return '—';
  return `₦${asNumber.toLocaleString('en-NG')}`;
}

export interface FinalizeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRequestClose: () => void;
  finalizedByName: string;
  onFinalizedByNameChange: (value: string) => void;
  isFinalizing: boolean;
  onFinalize: (name: string, sync: 'local' | 'cloud') => void;
  currentRun: PayrollRun | null;
  computed: PayrollComputedRun | null;
  isMdScreen: boolean;
  // Override confirmation mode
  mode?: 'finalize' | 'override';
  conflictingRun?: PayrollRunIndexEntry | null;
  onOverrideConfirm?: (shouldReplace: boolean) => void;
  // Month gap detection
  monthGaps?: string[];
}

export function FinalizeDialog({
  open,
  onOpenChange,
  onRequestClose,
  finalizedByName,
  onFinalizedByNameChange,
  isFinalizing,
  onFinalize,
  currentRun,
  computed,
  isMdScreen,
  mode = 'finalize',
  conflictingRun,
  onOverrideConfirm,
  monthGaps = [],
}: FinalizeDialogProps) {
  const isOverrideMode = mode === 'override';

  const title = isOverrideMode
    ? 'Replace Existing Finalized Run?'
    : `Lock ${currentRun ? formatPeriodLong(currentRun) : 'this'} payroll?`;

  const description = isOverrideMode
    ? ''
    : "You're about to lock this run. Where do you want to save it?";

  const Footer = isMdScreen ? DialogFooter : SheetFooter;

  const overrideContent = (
    <>
      <div className="space-y-2 p-4 md:px-0">
        <div className="text-[16px] font-medium md:flex">
          <p>A finalized run already exists for</p>
          <p>
            {conflictingRun
              ? formatPeriodLong({
                  periodMonth: conflictingRun.periodMonth,
                  periodYear: conflictingRun.periodYear,
                  periodEndMonth: conflictingRun.periodEndMonth,
                  periodEndYear: conflictingRun.periodEndYear,
                })
              : 'this period'}
          </p>
        </div>
        <p className="text-muted-foreground text-sm">
          Do you want to replace it? The existing finalized run will be deleted.
        </p>
      </div>
      <Footer>
        <Button
          variant="outline"
          onClick={() => onOverrideConfirm?.(false)}
          disabled={isFinalizing}
          className="w-full md:w-auto"
        >
          Cancel
        </Button>
        <Button
          variant="destructive"
          onClick={() => onOverrideConfirm?.(true)}
          disabled={isFinalizing}
          className="w-full md:w-auto"
        >
          Replace Existing Run
        </Button>
      </Footer>
    </>
  );

  const finalizeContent = (
    <>
      <div className="space-y-4 border-t pb-4">
        <div className="flex flex-col divide-y rounded">
          {/* Summary */}
          <div className="hidden space-y-1 p-3 px-4 text-sm md:block">
            <div>
              <p className="font-medium">
                {currentRun?.companyName ?? 'Payroll run'}
              </p>
              <p className="text-muted-foreground">
                {currentRun
                  ? `${currentRun.items.length} employees · ${formatPeriodLong(currentRun)}`
                  : null}
              </p>
            </div>
            {computed?.periodTotals && (
              <div className="bg-muted/50 flex items-center justify-between text-xs">
                <div className="flex-1 px-2 py-1">
                  <span className="text-muted-foreground">Gross</span>
                  <div className="text-sm font-medium tabular-nums">
                    {formatNgnAmount(computed.periodTotals.grossTotal)}
                  </div>
                </div>
                <Separator orientation="vertical" className="py-2" />
                <div className="flex-1 px-2 py-1">
                  <span className="text-muted-foreground">Net</span>
                  <div className="text-sm font-medium tabular-nums">
                    {formatNgnAmount(computed.periodTotals.netTotal)}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Month Gap Warning */}
          {monthGaps.length > 0 && (
            <div className="border-chart-1 space-y-2 border-l-4 bg-yellow-50/30 p-4 text-amber-700 dark:bg-yellow-950/20 dark:text-yellow-600">
              <div className="flex items-start gap-2">
                <div className="mt-0.5">
                  <TriangleAlertIcon className="size-4" />
                </div>
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium">
                    Missing finalized months detected
                  </p>
                  <p className="text-xs">
                    You're finalizing{' '}
                    {currentRun ? formatPeriodLong(currentRun) : 'this run'},
                    but there is no finalized run for{' '}
                    {formatMonthGaps(monthGaps)}. This may affect PAYE accuracy
                    for employees.
                  </p>
                  <p className="mt-2 text-xs">
                    <strong>What to do:</strong> If these months were handled
                    outside the system, you can proceed. Otherwise, consider
                    creating finalized runs for the missing months to ensure
                    accurate YTD calculations.
                  </p>
                </div>
              </div>
            </div>
          )}

          {computed?.warnings?.incompleteRentData &&
            computed.warnings.incompleteRentData.length > 0 && (
              <div className="border-chart-1 space-y-2 border-l-4 bg-yellow-50/30 p-4 text-amber-700 dark:bg-yellow-950/20 dark:text-yellow-600">
                <div className="flex items-start gap-2">
                  <div className="mt-0.5">
                    <TriangleAlertIcon className="size-4" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-medium">
                      Incomplete rent data detected
                    </p>
                    <p className="text-xs">
                      The following employees have rent data that doesn't cover
                      the full tax year:{' '}
                      <strong>
                        {computed.warnings.incompleteRentData.join(', ')}
                      </strong>
                      . Rent relief was computed using the last known rent
                      amount (extrapolation).
                    </p>
                    <p className="mt-2 text-xs">
                      <strong>What to do:</strong> Update rent history for these
                      employees to ensure accurate rent relief calculations. You
                      can proceed with finalization, but consider updating rent
                      data for future accuracy.
                    </p>
                  </div>
                </div>
              </div>
            )}

          {/* Finalized by */}
          <div className="space-y-2 border-b-0 p-4">
            <label
              htmlFor="finalized-by-name"
              className="text-xs leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Finalized by (optional)
            </label>
            <Input
              id="finalized-by-name"
              placeholder="Your name (optional)"
              value={finalizedByName}
              onChange={(e) => onFinalizedByNameChange(e.target.value)}
              className="h-7.5 w-full rounded text-[16px] md:text-sm"
            />
          </div>
          <div className="flex flex-col gap-4 p-4">
            <div className="relative overflow-hidden">
              {/* Hero Option: Cloud Save (overlayed as coming soon) */}
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.3, type: 'spring' }}
                className="pointer-events-none"
              >
                <div className="space-y-2">
                  <div className="flex items-center text-base">
                    <CloudUploadIcon className="mr-1 h-5 w-5 text-green-700" />
                    <div>
                      <span className="font-semibold">Save to cloud</span>
                      <span className="text-muted-foreground text-xs font-medium">
                        {' '}
                        (Recommended)
                      </span>
                    </div>
                  </div>
                  {/* Benefits */}
                  <ul className="flex flex-col gap-1 p-2 opacity-70">
                    {[
                      'Edit and view on any device',
                      'Data safe from browser clearing',
                      "Auto-fill next month's payroll",
                    ].map((benefit) => (
                      <li key={benefit} className="flex items-center gap-2">
                        <CircleCheckBig className="text-muted-foreground size-3" />
                        <span className="text-[12px]">{benefit}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <Button
                  onClick={() => {}}
                  disabled
                  className="w-full cursor-not-allowed rounded active:scale-[0.98]"
                >
                  Create Free Account
                </Button>
              </motion.div>

              {/* Full overlay to signal "coming soon" and block clicks */}
              <div className="bg-background/70 pointer-events-auto absolute inset-0 flex items-center justify-center rounded backdrop-blur-sm">
                <div className="flex flex-col items-center gap-1 text-center">
                  <span className="bg-muted text-muted-foreground rounded-full px-3 py-1 text-[11px] font-semibold tracking-wide uppercase">
                    Coming soon
                  </span>
                  <p className="text-muted-foreground text-[11px]">
                    Cloud saving is not available yet.
                  </p>
                </div>
              </div>
            </div>
            {/* Secondary Option: Local Save */}
            <div className="flex flex-col items-center justify-center">
              <Button
                type="button"
                onClick={() => onFinalize(finalizedByName, 'local')}
                disabled={isFinalizing}
                variant="outline"
                className="w-full rounded"
              >
                Save to this device only
              </Button>
              {/* TODO: Add a warning about data loss once signup is implemented */}
              {/* <p className="text-muted-foreground/60 text-[10px]">
                (Not recommended - Risk of data loss)
              </p> */}
            </div>{' '}
          </div>
        </div>
      </div>
    </>
  );

  const content = isOverrideMode ? overrideContent : finalizeContent;

  const handleOpenChange = (next: boolean) => {
    if (isFinalizing) return;
    onOpenChange(next);
    if (!next) {
      // Call onRequestClose when dialog is closed
      onRequestClose();
    }
  };

  if (isMdScreen) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="rounded sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {content}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-w-2xl rounded">
        <SheetHeader className="gap-0 pr-8 pb-0">
          <SheetTitle className={'text-[16px]'}>{title}</SheetTitle>
          {!isOverrideMode && (
            <SheetDescription className="text-sm">
              {description}
            </SheetDescription>
          )}
        </SheetHeader>
        {content}
      </SheetContent>
    </Sheet>
  );
}
