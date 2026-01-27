import type {
  PayrollCompanyDefaults,
  PayrollComputedRun,
  PayrollRun,
  PayrollRunIndexEntry,
  PayrollRunItem,
} from '@/payroll/domain';
import type { SummaryCardKey, SummaryCardProps } from '@/payroll/summary-card';
import type { CompanyDefaultsUpdate } from '@/payroll/utils';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn, useMediaQuery } from '@/lib/utils';
import {
  addEmployeeToRun,
  addEmployeesToRun,
} from '@/payroll/actions/add-employee';
import {
  deleteEmployeeRecord,
  upsertEmployeeRecordFromRunItem,
} from '@/payroll/actions/employee-directory';
import {
  createAndSaveSamplePayrollRun,
  createSamplePayrollRunPreview,
} from '@/payroll/data/sample-payroll-run';
import { makeNewPayrollRun } from '@/payroll/domain';
import {
  deleteRun,
  findExistingFinalizedRun,
  findRunByPeriod,
  loadCompanyDefaults,
  loadRun,
  loadRunsIndex,
  saveCompanyDefaults,
  saveRun,
} from '@/payroll/storage';
import {
  getCompanyDefaultsKey,
  getEmployeeDirectoryKey,
  getRunsIndexKey,
  getRunKey,
} from '@/payroll/storage/keys';
import { storageDelete } from '@/payroll/storage/kv';
import { SummaryCard } from '@/payroll/summary-card';
import {
  deepMerge,
  formatRunTooltipText,
  generateId,
  getCurrentTimestamp,
  parsePeriod,
  updateCompanyDefaultSettings,
} from '@/payroll/utils';
import { useNavigate } from '@tanstack/react-router';
import confetti from 'canvas-confetti';
import {
  ChevronDown,
  Copy,
  Download,
  Ellipsis,
  Eye,
  EyeClosed,
  FileDown,
  Grid2x2Plus,
  Plus,
  Save,
  SaveIcon,
  Settings2,
  Trash2,
  Upload,
  UserRoundPlus,
} from 'lucide-react';
import { toast } from 'sonner';

import { computeRun } from '../compute/compute-run';
import { detectMonthGaps } from '../compute/gap-detection';
import {
  COMPANY_DEFAULTS,
  DEMO_COMPANY_DEFAULTS,
} from '../data/company-defaults';
import { NIGERIAN_STATES } from '../data/states';
import { SimpleSelect } from '../simple-select';
import { logger } from '../utils/logger';
import { CsvImportDialog } from './csv-import-dialog';
import { FinalizeDialog } from './finalize-dialog';
import { PayrollTable } from './payroll-table';
import { getTableRowData } from './payroll-table-utils';
import type { EmployeeRecord } from '@/payroll/domain';

import type { StatutoryDeduction } from '../domain/payroll.schemas';

// App Load → Check runs → If empty:
//  1. Create sample run in memory (not saved)
//  2. Set as currentRun (for display)
//  3. Show welcome dialog
//  4. User clicks "Try with sample data"
//      - Save sample run to storage (triggers lazy defaults init if first run)
//      - Close dialog

//   OR
//  4. User clicks "Start payroll"
//      - Create new empty run
//      - Save to storage (triggers lazy defaults init if first run)
//      - Close dialog

const LG_VISIBLE_COUNT = 4;

const MOBILE_VISIBLE_KEYS = new Set<SummaryCardKey>([
  'gross',
  'paye',
  'total_pension',
  'net',
  'employees',
]);

const MONTH_OPTIONS = [
  { label: 'January', value: '1' },
  { label: 'February', value: '2' },
  { label: 'March', value: '3' },
  { label: 'April', value: '4' },
  { label: 'May', value: '5' },
  { label: 'June', value: '6' },
  { label: 'July', value: '7' },
  { label: 'August', value: '8' },
  { label: 'September', value: '9' },
  { label: 'October', value: '10' },
  { label: 'November', value: '11' },
  { label: 'December', value: '12' },
] as const;

type StatutoryDeductionKey = keyof StatutoryDeduction;
const STATUTORY_DEDUCTIONS: {
  id: string;
  key: StatutoryDeductionKey;
  label: string;
  className: string;
}[] = [
  {
    id: 'company-policy-deduction-pension',
    key: 'pension',
    label: 'Pension',
    className: 'flex-[1.35]',
  },
  {
    id: 'company-policy-deduction-nhf',
    key: 'nhf',
    label: 'NHF',
    className: 'flex-1',
  },
  {
    id: 'company-policy-deduction-nhis',
    key: 'nhis',
    label: 'NHIS',
    className: 'flex-1',
  },
] as const;

type PayrollTabId =
  | 'employees'
  | 'paye-by-state'
  | 'import'
  | 'journals'
  | 'runs'
  | 'company-settings';

function StatutoryDeductionToggle({
  value,
  onChange,
  label,
  className,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
  label: string;
  className?: string;
}) {
  return (
    <label
      htmlFor={label}
      className={cn(
        'hover:bg-muted/40 focus-within:ring-ring/50 flex h-7.5 cursor-pointer items-center justify-between gap-3 rounded border px-2 py-2 text-xs focus-within:ring-[3px]',
        className,
      )}
    >
      <span className="capitalize">{label}</span>
      <Checkbox
        id={label}
        checked={value}
        onCheckedChange={(checked) => onChange(checked === true)}
      />
    </label>
  );
}

type RunsListVariant = 'sidebar' | 'full';

function RunsList({
  runs,
  currentRunId,
  onSelectRun,
  onDeleteRunClick,
  onNewRun,
  variant = 'sidebar',
}: {
  runs: PayrollRunIndexEntry[];
  currentRunId?: string;
  onSelectRun: (run: PayrollRunIndexEntry) => void;
  onDeleteRunClick: (run: PayrollRunIndexEntry) => void;
  onNewRun: () => void;
  variant?: RunsListVariant;
}) {
  const containerClasses =
    variant === 'sidebar'
      ? 'flex max-h-[160px] min-h-[100px] flex-col overflow-y-auto rounded border text-sm xl:h-full xl:max-h-none xl:flex-1'
      : 'flex h-full flex-col rounded border bg-card text-sm';

  if (variant === 'sidebar') {
    return (
      <div className={containerClasses}>
        <div className="border-b p-2 font-medium">Payroll runs</div>
        <ul className="scrollbar-thin-2px flex-1 space-y-1 overflow-x-hidden overflow-y-auto px-2 py-1 pr-6">
          {runs.length === 0 ? (
            <li className="text-muted-foreground py-6 text-center text-xs">
              No runs yet
            </li>
          ) : (
            runs.map((run) => {
              const isCurrentRun = currentRunId === run.id;
              const isDemoRun = run.isDemo;
              const tooltipText = formatRunTooltipText(run);

              return (
                <li
                  key={run.id}
                  className={cn(
                    'flex flex-nowrap items-center justify-between gap-4 whitespace-nowrap',
                    !isCurrentRun && 'text-muted-foreground',
                  )}
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className={cn(
                          'flex flex-1 cursor-pointer items-center overflow-hidden',
                          isCurrentRun ? 'font-medium text-blue-500' : '',
                        )}
                        title={tooltipText}
                        onClick={() => onSelectRun(run)}
                      >
                        <span className="text-muted-foreground pr-2 font-normal">
                          -
                        </span>
                        <span className="truncate text-[0.85rem]">
                          <span className="hidden sm:inline">
                            {run.companyName} &bull;
                          </span>
                          <span>{run.label}</span>
                          {isDemoRun && ' (Demo)'}
                          {run.status === 'final' ? ' (final)' : ''}
                          {isCurrentRun && (
                            <span className="text-primary ml-1 text-xs font-medium">
                              &bull; Current
                            </span>
                          )}
                        </span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs whitespace-pre-line">
                        {tooltipText}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                  <button
                    type="button"
                    className="shrink-0 cursor-pointer text-xs hover:text-red-600"
                    onClick={() => onDeleteRunClick(run)}
                  >
                    Delete
                  </button>
                </li>
              );
            })
          )}
        </ul>
        <button
          type="button"
          className="bg-muted flex w-full cursor-pointer items-center justify-center gap-1 p-1 text-xs"
          onClick={onNewRun}
        >
          <Plus className="size-4" />
          <span>New Run</span>
        </button>
      </div>
    );
  }

  // Full variant - card-based layout
  return (
    <div className={containerClasses}>
      <div className="border-b p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold">Payroll runs</h3>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {runs.length} {runs.length === 1 ? 'run' : 'runs'}
            </p>
          </div>
          <Button onClick={onNewRun} size="sm">
            <Plus className="mr-1.5 size-4" />
            New Run
          </Button>
        </div>
      </div>
      <div className="scrollbar-thin-2px flex-1 overflow-y-auto p-4">
        {runs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-muted-foreground mb-2 text-sm font-medium">
              No payroll runs yet
            </p>
            <p className="text-muted-foreground mb-4 text-xs">
              Create your first payroll run to get started
            </p>
            <Button onClick={onNewRun} size="sm">
              <Plus className="mr-1.5 size-4" />
              Create Run
            </Button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {runs.map((run) => {
              const isCurrentRun = currentRunId === run.id;
              const isDemoRun = run.isDemo;
              const tooltipText = formatRunTooltipText(run);
              const monthNames = [
                'Jan',
                'Feb',
                'Mar',
                'Apr',
                'May',
                'Jun',
                'Jul',
                'Aug',
                'Sep',
                'Oct',
                'Nov',
                'Dec',
              ];
              const periodLabel =
                run.periodEndMonth != null && run.periodEndYear != null
                  ? `${monthNames[run.periodMonth - 1]} ${run.periodYear} - ${monthNames[run.periodEndMonth - 1]} ${run.periodEndYear}`
                  : `${monthNames[run.periodMonth - 1]} ${run.periodYear}`;

              return (
                <div
                  key={run.id}
                  className={cn(
                    'group bg-card hover:border-primary/50 relative cursor-pointer rounded-lg border p-4 transition-all hover:shadow-md',
                    isCurrentRun && 'border-primary ring-primary/20 ring-2',
                  )}
                  onClick={() => onSelectRun(run)}
                >
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <h4 className="truncate text-sm font-semibold">
                          {run.companyName}
                        </h4>
                        {isCurrentRun && (
                          <span className="bg-primary/10 text-primary shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium">
                            Current
                          </span>
                        )}
                        {run.status === 'final' && (
                          <span className="shrink-0 rounded bg-green-500/10 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:text-green-400">
                            Final
                          </span>
                        )}
                        {isDemoRun && (
                          <span className="shrink-0 rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-400">
                            Demo
                          </span>
                        )}
                      </div>
                      <p className="text-muted-foreground text-xs">
                        {periodLabel}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteRunClick(run);
                      }}
                      className="text-muted-foreground hover:text-destructive shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="text-muted-foreground text-xs">
                        {tooltipText}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs whitespace-pre-line">
                        {tooltipText}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

// Convert rate (0-1) to percentage (0-100) for display
function rateToPercent(rate: number | undefined): number {
  if (rate === undefined) return 0;
  return Math.round(rate * 100);
}

// Convert percentage (0-100) to rate (0-1) for storage
function percentToRate(percent: number): number {
  return clampPercent(percent) / 100;
}

export function Payroll() {
  const navigate = useNavigate();
  const [showAllOnLg, setShowAllOnLg] = useState(false);
  const [showAllOnMobile, setShowAllOnMobile] = useState(false);
  const [month, setMonth] = useState(() => String(new Date().getMonth() + 1));
  const [year, setYear] = useState(() => String(new Date().getFullYear()));
  const [isCompanyPolicyOpen, setIsCompanyPolicyOpen] = useState(false);
  const [showPolicyAndRuns, setShowPolicyAndRuns] = useState(false);
  const [activeTab, setActiveTab] = useState<PayrollTabId>('employees');
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [isLoadingRuns, setIsLoadingRuns] = useState(true);
  const [currentRun, setCurrentRun] = useState<PayrollRun | null>(null);
  const [isSampleRun, setIsSampleRun] = useState(false);
  const [runList, setRunList] = useState<PayrollRunIndexEntry[]>([]);
  const [computed, setComputed] = useState<PayrollComputedRun | null>(null);
  const [isComputing, setIsComputing] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [runToDelete, setRunToDelete] = useState<{
    id: string;
    label: string;
    status: 'draft' | 'final';
  } | null>(null);
  const [finalizeDialogOpen, setFinalizeDialogOpen] = useState(false);
  const [isFinalizingRun, setIsFinalizingRun] = useState(false);
  const [finalizedByName, setFinalizedByName] = useState('');
  const [finalizeDialogMode, setFinalizeDialogMode] = useState<
    'finalize' | 'override'
  >('finalize');
  const [conflictingRun, setConflictingRun] =
    useState<PayrollRunIndexEntry | null>(null);
  const [monthGaps, setMonthGaps] = useState<string[]>([]);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [hasFinalizedRuns, setHasFinalizedRuns] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [csvImportDialogOpen, setCsvImportDialogOpen] = useState(false);
  const isInitialMount = useRef(true);
  const currentRunRef = useRef<PayrollRun | null>(null);

  // Initialize company settings with default values
  const [companyDefaults, setCompanyDefaults] =
    useState<PayrollCompanyDefaults>(COMPANY_DEFAULTS);

  const companySettings = companyDefaults.settings;
  const companyName = companyDefaults.companyName ?? '';
  const runCompanyName = companyDefaults.companyName?.trim() || 'Company';
  const currentYear = new Date().getFullYear();
  const yearOptions = [String(currentYear), String(currentYear + 1)];
  const finalizedPeriodKeys = useMemo(() => {
    if (!currentRun) return [];
    const keySet = new Set<string>();

    for (const run of runList) {
      if (run.status !== 'final') continue;
      const sameCompany =
        run.companyId === currentRun.companyId ||
        (run.companyId == null && currentRun.companyId == null);
      if (!sameCompany) continue;

      const startMonth = run.periodMonth;
      const startYear = run.periodYear;
      const endMonth = run.periodEndMonth ?? run.periodMonth;
      const endYear = run.periodEndYear ?? run.periodYear;
      const startTotal = startYear * 12 + startMonth;
      const endTotal = endYear * 12 + endMonth;

      for (let total = startTotal; total <= endTotal; total++) {
        const year = Math.floor((total - 1) / 12);
        const month = ((total - 1) % 12) + 1;
        keySet.add(`${year}-${String(month).padStart(2, '0')}`);
      }
    }

    return Array.from(keySet).sort();
  }, [runList, currentRun]);

  // Default to detailed view on screens >= 1280px, standard otherwise
  const isXlScreen = useMediaQuery('(min-width: 1280px)');
  const isMdScreen = useMediaQuery('(min-width: 768px)');

  const tabs = [
    { id: 'employees' as const, label: 'Employees' },
    // { id: 'paye-by-state' as const, label: 'PAYE by state' },
    { id: 'import' as const, label: 'Import' },
    { id: 'journals' as const, label: 'Journals' },
    // Only show these tabs on xl screens
    ...(isXlScreen
      ? [
          { id: 'runs' as const, label: 'Runs' },
          { id: 'company-settings' as const, label: 'Company settings' },
        ]
      : []),
  ] as const;

  const [viewMode, setViewMode] = useState<'standard' | 'detailed'>(
    isXlScreen ? 'detailed' : 'standard',
  ); // Toggle button will be added later

  useEffect(() => {
    setViewMode(isXlScreen ? 'detailed' : 'standard');
  }, [isXlScreen]);

  useEffect(() => {
    currentRunRef.current = currentRun;
  }, [currentRun]);

  // Switch to a visible tab if current tab is hidden on smaller screens
  useEffect(() => {
    if (
      !isXlScreen &&
      (activeTab === 'runs' || activeTab === 'company-settings')
    ) {
      setActiveTab('employees');
    }
  }, [isXlScreen, activeTab]);

  // Force standard view on screens < 1024px
  const isLargeScreen = useMediaQuery('(min-width: 1024px)');
  const effectiveViewMode = isLargeScreen ? viewMode : 'standard';

  // Compute run on-the-fly (now async) - debounced to avoid excessive computations
  // Use runId as primary dependency to ensure recomputation when selecting runs,
  // even if the object reference is the same
  const runId = currentRun?.id;
  useEffect(() => {
    if (!currentRun) {
      setComputed(null);
      setIsComputing(false);
      return;
    }

    let cancelled = false;
    let showLoadingTimeoutId: ReturnType<typeof setTimeout> | null = null;

    // Debounce computation by 100ms to avoid excessive recomputations during rapid changes
    const timeoutId = setTimeout(async () => {
      // Only show loading indicator if computation takes longer than 200ms total
      showLoadingTimeoutId = setTimeout(() => {
        if (!cancelled) {
          setIsComputing(true);
        }
      }, 200);

      try {
        // Read currentRun from closure to ensure we use the latest value
        const runToCompute = currentRun;
        const result = await computeRun(runToCompute, {
          nowIso: runToCompute.updatedAt,
        });
        if (!cancelled) {
          setComputed(result);
          setIsComputing(false);
          if (showLoadingTimeoutId) {
            clearTimeout(showLoadingTimeoutId);
          }
        }
      } catch (e) {
        logger.error('Payroll computation error', e, {
          runId: currentRun.id,
          periodMonth: currentRun.periodMonth,
          periodYear: currentRun.periodYear,
        });
        if (!cancelled) {
          setComputed(null);
          setIsComputing(false);
          if (showLoadingTimeoutId) {
            clearTimeout(showLoadingTimeoutId);
          }
        }
      }
    }, 100); // Reduced debounce for better responsiveness

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      if (showLoadingTimeoutId) {
        clearTimeout(showLoadingTimeoutId);
      }
      setIsComputing(false);
    };
  }, [currentRun, runId]);

  // Helper to update company settings and save
  const updateCompanyDefaults = useCallback(
    async (updates: CompanyDefaultsUpdate) => {
      const updated = updateCompanyDefaultSettings(companyDefaults, updates);
      setCompanyDefaults(updated);

      if (currentRun?.status === 'draft') {
        // Ensure we have a valid object for deepMerge (settings are optional in types but practically always present)
        const baseSettings =
          currentRun.settings ?? updated.settings ?? COMPANY_DEFAULTS.settings!;

        const nextRunSettings = updates.settings
          ? deepMerge(baseSettings, updates.settings)
          : baseSettings;
        const nextRunCompanyName =
          updates.companyName === undefined
            ? currentRun.companyName
            : updates.companyName;
        const updatedRun: PayrollRun = {
          ...currentRun,
          companyName: nextRunCompanyName,
          settings: nextRunSettings,
          updatedAt: getCurrentTimestamp(),
        };
        setCurrentRun(updatedRun);
        saveRun(updatedRun).catch((error) => {
          logger.error('Failed to save run settings update', error, {
            runId: updatedRun.id,
          });
        });
      }

      if (updates.companyName !== undefined && currentRun) {
        setRunList((prev) =>
          prev.map((entry) =>
            entry.id === currentRun.id
              ? { ...entry, companyName: updates.companyName ?? entry.companyName }
              : entry,
          ),
        );
      }

      try {
        await saveCompanyDefaults({
          companyName: updated.companyName,
          settings: updated.settings,
        });
      } catch (error) {
        logger.error('Failed to save company settings', error);
      }
    },
    [companyDefaults, currentRun],
  );

  const refreshRunList = useCallback(async () => {
    const updatedIndex = await loadRunsIndex();
    setRunList(updatedIndex.runs);
    return updatedIndex;
  }, []);

  const applyLoadedRun = useCallback(
    (run: PayrollRun | null) => {
      if (!run) {
        setCurrentRun(null);
        setIsSampleRun(false);
        return;
      }

      // Update company defaults first (company name + settings come from the run)
      // We do this before setting currentRun to avoid race conditions
      updateCompanyDefaults({
        companyName: run.companyName,
        settings: run.settings,
      });

      // Set currentRun to trigger computation - this will always create a new reference
      // even if it's the same run, ensuring the computation effect runs
      setCurrentRun({ ...run });
      setIsSampleRun(false);
      // Don't update month/year when loading a run - these are for new run creation only
      // This prevents flickering caused by triggering the load effect below
    },
    [updateCompanyDefaults],
  );

  const handleSelectRun = useCallback(
    async (run: PayrollRunIndexEntry) => {
      try {
        const loadedRun = await loadRun(run.id);
        if (loadedRun) {
          applyLoadedRun(loadedRun);
        } else {
          toast.error('Could not load run', {
            position: isMdScreen ? 'bottom-right' : 'top-center',
          });
        }
      } catch (error) {
        logger.error('Error loading run', error, { runId: run.id });
        toast.error('Could not load run', {
          position: isMdScreen ? 'bottom-right' : 'top-center',
        });
      }
    },
    [applyLoadedRun, isMdScreen],
  );

  const findFirstLoadableRun = useCallback(
    async (runs: PayrollRunIndexEntry[]) => {
      for (let i = 0; i < runs.length; i++) {
        const attempt = await loadRun(runs[i].id);
        if (attempt) {
          return { run: attempt, index: i };
        }
      }

      return { run: null, index: -1 };
    },
    [],
  );

  // Load company defaults on mount
  useEffect(() => {
    (async () => {
      try {
        const defaults = await loadCompanyDefaults();
        if (defaults) {
          setCompanyDefaults(defaults);
        }
      } catch (error) {
        logger.error('Failed to load company defaults', error);
      }
    })();
  }, []);

  // Check for runs on load and load the most recent one, or pre-load sample data if none exist
  useEffect(() => {
    (async () => {
      try {
        setIsLoadingRuns(true);
        const runsIndexData = await loadRunsIndex();

        if (runsIndexData.runs.length === 0) {
          // No runs exist - pre-load sample data for visual preview
          setRunList([]);
          const { periodYear, periodMonth } = parsePeriod(year, month);
          const { run } = createSamplePayrollRunPreview(
            periodMonth,
            periodYear,
          );
          setCurrentRun(run);
          setIsSampleRun(true);
          setCompanyDefaults((prev) => ({
            ...prev,
            companyName: run.companyName,
            settings: run.settings ?? prev.settings,
          }));
          setWelcomeOpen(true);
        } else {
          // Update runs index for display
          setRunList(runsIndexData.runs);

          const { run: loadedRun, index: loadedRunIndex } =
            await findFirstLoadableRun(runsIndexData.runs);

          if (loadedRun) {
            applyLoadedRun(loadedRun);

            // Warn if we had to skip some runs
            if (loadedRunIndex > 0) {
              toast.warning('Some runs could not be loaded', {
                position: isMdScreen ? 'bottom-right' : 'top-center',
              });
            }
          } else {
            // All runs failed to load - show blank state (no sample data)
            toast.error('Could not load any payroll runs', {
              position: isMdScreen ? 'bottom-right' : 'top-center',
            });
            applyLoadedRun(null);
            setWelcomeOpen(true);
          }
        }
      } catch (e) {
        // If there's an error loading runs, assume no runs exist
        // Still pre-load sample data
        toast.warning('Could not load saved runs', {
          position: isMdScreen ? 'bottom-right' : 'top-center',
        });
        setRunList([]);
        const { periodYear, periodMonth } = parsePeriod(year, month);
        const { run } = createSamplePayrollRunPreview(periodMonth, periodYear);
        setCurrentRun(run);
        setIsSampleRun(true);
        setCompanyDefaults((prev) => ({
          ...prev,
          companyName: run.companyName,
          settings: run.settings ?? prev.settings,
        }));
        setWelcomeOpen(true);
      } finally {
        setIsLoadingRuns(false);
      }
    })();
    // Only run on mount - month/year changes don't trigger reload
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle month/year changes - update currentRun period or load existing run
  // Debounced to avoid excessive async operations when user changes month/year rapidly
  useEffect(() => {
    // Skip on initial mount (let the initial load effect handle it)
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    // Skip if still loading initial runs or if there's no currentRun
    const run = currentRunRef.current;
    if (isLoadingRuns || !run) return;

    // Debounce by 500ms to avoid triggering multiple async operations when user changes month/year rapidly
    const timeoutId = setTimeout(async () => {
      try {
        const { periodYear, periodMonth } = parsePeriod(year, month);

        // Check if the currentRun's period already matches the selected month/year
        if (
          run.periodMonth === periodMonth &&
          run.periodYear === periodYear
        ) {
          // Period already matches - no action needed
          return;
        }

        // Period doesn't match - check if there's an existing run for the new period
        const existingRunEntry = await findRunByPeriod(
          periodMonth,
          periodYear,
          run.companyId,
        );

        if (existingRunEntry) {
          // Found an existing run for the new period - load it
          const loadedRun = await loadRun(existingRunEntry.id);
          if (loadedRun) {
            setCurrentRun(loadedRun);
            setIsSampleRun(false);
            return;
          }
        }

        // No existing run found - update currentRun's period if it's a draft
        if (run.status === 'draft') {
          const updatedRun: PayrollRun = {
            ...run,
            periodMonth,
            periodYear,
            // Clear period end if it was set (for multi-period runs)
            periodEndMonth: undefined,
            periodEndYear: undefined,
            updatedAt: getCurrentTimestamp(),
          };

          // Save the updated run
          const savedRun = await saveRun(updatedRun);
          setCurrentRun(savedRun);
          await refreshRunList();
        } else {
          // Current run is finalized - create a new draft run for the new period
          const newRun = makeNewPayrollRun({
            id: generateId(),
            nowIso: getCurrentTimestamp(),
            companyName: run.companyName,
            companyId: run.companyId,
            periodMonth,
            periodYear,
          });

          // Copy settings from current run if they exist
          if (run.settings) {
            newRun.settings = run.settings;
          }

          const savedRun = await saveRun(newRun);
          await refreshRunList();
          setCurrentRun(savedRun);
          setIsSampleRun(false);
        }
      } catch (error) {
        logger.error('Error handling period change', error, {
          month,
          year,
          currentRunId: run?.id,
        });
        toast.error('Could not update payroll period', {
          position: isMdScreen ? 'bottom-right' : 'top-center',
        });
      }
    }, 500);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [month, year, isLoadingRuns, isMdScreen, refreshRunList]);

  // Handlers for actions
  const handleNewRun = useCallback(async () => {
    try {
      // Clear sample data if it was pre-loaded
      if (isSampleRun) {
        setCurrentRun(null);
        setIsSampleRun(false);
      }

      // Use current month/year from UI state
      const { periodYear, periodMonth } = parsePeriod(year, month);

      // Create new run
      const newRun = makeNewPayrollRun({
        id: generateId(),
        nowIso: getCurrentTimestamp(),
        // rulesetKey defaults to NG-2026-v1 defined in schema
        companyName: runCompanyName,
        companyId: companyDefaults?.companyId,
        periodMonth,
        periodYear,
      });

      // Apply company settings to new run
      if (companySettings) {
        newRun.settings = companySettings;
      }

      // Save the run (this will trigger lazy defaults initialization if first run)
      const savedRun = await saveRun(newRun);

      // Refresh runs index
      await refreshRunList();

      // Set as current run
      setCurrentRun(savedRun);
      setIsSampleRun(false);

      // Close welcome dialog
      setWelcomeOpen(false);
      toast.success('New payroll run created', {
        position: isMdScreen ? 'bottom-right' : 'top-center',
      });
    } catch (error) {
      logger.error('Error creating new run', error, { month, year });
      toast.error('Could not create payroll run', {
        position: isMdScreen ? 'bottom-right' : 'top-center',
      });
    }
  }, [
    year,
    month,
    isSampleRun,
    companySettings,
    refreshRunList,
    runCompanyName,
  ]);

  const handleDuplicateRun = useCallback(async () => {
    if (!currentRun) return;

    try {
      // Create a new run with same period/settings but new ID and timestamps
      const newRun = makeNewPayrollRun({
        id: generateId(),
        nowIso: getCurrentTimestamp(),
        companyName: currentRun.companyName,
        periodMonth: currentRun.periodMonth,
        periodYear: currentRun.periodYear,
        periodEndMonth: currentRun.periodEndMonth,
        periodEndYear: currentRun.periodEndYear,
        companyId: currentRun.companyId,
      });

      // Copy all items from current run (snapshots remain intact)
      // CRITICAL: employeeRefId is preserved in the copied items, which is essential
      // for matching employees across runs for YTD calculations
      newRun.items = [...currentRun.items];

      // Copy settings if they exist
      if (currentRun.settings) {
        newRun.settings = currentRun.settings;
      }

      // Status is already 'draft' from makeNewPayrollRun
      // finalizedAt is undefined (not copied)

      // Save the new run
      const savedRun = await saveRun(newRun);

      // Refresh runs index
      await refreshRunList();

      // Set as current run
      setCurrentRun(savedRun);
      setIsSampleRun(false);

      toast.success('Payroll run duplicated', {
        position: isMdScreen ? 'bottom-right' : 'top-center',
      });
    } catch (error) {
      console.error('Error duplicating run:', error);
      toast.error('Could not duplicate payroll run', {
        position: isMdScreen ? 'bottom-right' : 'top-center',
      });
    }
  }, [currentRun, refreshRunList]);

  const handleFinalizeRunClick = useCallback(async () => {
    if (!currentRun) return;

    // Validation with helpful toast messages
    if (currentRun.items.length === 0) {
      toast.error('Cannot finalize empty payroll', {
        position: isMdScreen ? 'bottom-right' : 'top-center',
      });
      return;
    }

    // Compute payroll to check if gross is zero
    const computedData = await computeRun(currentRun);
    const totalGross = parseFloat(computedData.periodTotals.grossTotal);
    if (totalGross === 0) {
      toast.error('Cannot finalize payroll with zero gross', {
        position: isMdScreen ? 'bottom-right' : 'top-center',
      });
      return;
    }

    // Check for existing finalized run for the same month/year
    const existingRun = await findExistingFinalizedRun(currentRun);
    if (existingRun) {
      // Conflict found - show override confirmation in finalize dialog
      setConflictingRun(existingRun);
      setFinalizeDialogMode('override');
      setFinalizeDialogOpen(true);
      return;
    }

    // Check for month gaps (missing finalized months)
    const runsIndex = await loadRunsIndex();
    const gaps = detectMonthGaps(currentRun, runsIndex);
    setMonthGaps(gaps);

    // No conflict - open finalize dialog in normal mode
    setFinalizeDialogMode('finalize');
    setFinalizeDialogOpen(true);
  }, [currentRun, isMdScreen]);

  const handleOverrideConfirm = useCallback(
    async (shouldReplace: boolean) => {
      if (!currentRun || !conflictingRun) return;

      if (!shouldReplace) {
        // User chose to cancel - close dialog and reset state
        setFinalizeDialogOpen(false);
        setConflictingRun(null);
        setFinalizeDialogMode('finalize');
        return;
      }

      // User chose to replace - delete the old run and proceed with finalization
      try {
        await deleteRun(conflictingRun.id);
        setConflictingRun(null);
        // Switch dialog to finalize mode
        setFinalizeDialogMode('finalize');
        // Dialog stays open, now showing finalize content
      } catch (error) {
        logger.error('Error deleting conflicting run', error, {
          conflictingRunId: conflictingRun?.id,
        });
        toast.error('Could not delete existing run', {
          position: isMdScreen ? 'bottom-right' : 'top-center',
        });
        setFinalizeDialogOpen(false);
        setConflictingRun(null);
        setFinalizeDialogMode('finalize');
      }
    },
    [currentRun, conflictingRun, isMdScreen],
  );

  const handleFinalizeRun = useCallback(
    async (_name: string, sync: 'local' | 'cloud') => {
      if (!currentRun) return;

      try {
        setIsFinalizingRun(true);
        // Compute payroll before finalizing to ensure data is ready
        const computedData = await computeRun(currentRun);

        // Set status to final and record finalized timestamp
        const finalizedRun: PayrollRun = {
          ...currentRun,
          status: 'final',
          finalizedAt: getCurrentTimestamp(),
          updatedAt: getCurrentTimestamp(),
          computed: computedData, // Store computed data
          // Note: finalizedByName and sync option are for future use
          // For now, both options save locally
        };

        // Save the finalized run
        const savedRun = await saveRun(finalizedRun);

        // Refresh runs index
        await refreshRunList();

        // Update current run state
        setCurrentRun(savedRun);

        // Close dialog and reset state
        setFinalizeDialogOpen(false);
        setFinalizedByName('');
        setConflictingRun(null);
        setFinalizeDialogMode('finalize');
        setMonthGaps([]);

        if (sync === 'cloud') {
          // Trigger confetti for cloud save
          confetti({
            particleCount: 150,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#22c55e', '#3b82f6', '#f59e0b', '#ec4899'],
            disableForReducedMotion: true,
          });

          toast.success('Payroll finalized! Redirecting to signup...', {
            position: isMdScreen ? 'bottom-right' : 'top-center',
            duration: 3000,
          });

          setTimeout(async () => {
            await navigate({
              to: '/signup',
              search: {
                intent: 'sync-final-run',
                runId: savedRun.id,
                returnTo: '/',
              },
            });
          }, 1500);
        } else {
          // Trigger confetti for local save too
          confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 },
            disableForReducedMotion: true,
            zIndex: 9999,
          });

          toast.success(
            <div className="flex flex-col">
              <p className="text-sm font-medium">Saved!</p>
              <p className="cursor-pointer text-xs text-blue-500 underline">
                Create account to sync
              </p>
            </div>,
            {
              position: isMdScreen ? 'bottom-right' : 'top-center',
              duration: Infinity,
              closeButton: true,
            },
          );
        }
      } catch (error) {
        logger.error('Error finalizing run', error, {
          runId: currentRun?.id,
          employeeCount: currentRun?.items.length,
        });
        toast.error('Could not finalize payroll run', {
          position: isMdScreen ? 'bottom-right' : 'top-center',
        });
      } finally {
        setIsFinalizingRun(false);
      }
    },
    [currentRun, refreshRunList, isMdScreen, navigate],
  );

  const handleStartWithSampleData = useCallback(async () => {
    try {
      const { periodYear, periodMonth } = parsePeriod(year, month);
      const { run: savedRun } = await createAndSaveSamplePayrollRun(
        periodMonth,
        periodYear,
      );

      await refreshRunList();
      setCurrentRun(savedRun);
      setIsSampleRun(false);

      await updateCompanyDefaults(DEMO_COMPANY_DEFAULTS);

      setWelcomeOpen(false);
      toast.success('Sample data loaded', {
        position: isMdScreen ? 'bottom-right' : 'top-center',
      });
    } catch (error) {
      logger.error('Error saving sample data', error);
      toast.error('Could not save sample data', {
        position: isMdScreen ? 'bottom-right' : 'top-center',
      });
    }
  }, [year, month, refreshRunList, updateCompanyDefaults, isMdScreen]);

  const handleExportCsv = useCallback(() => {
    if (!currentRun || !computed) {
      toast.error('No computed payroll to export', {
        position: isMdScreen ? 'bottom-right' : 'top-center',
      });
      return;
    }

    if (!currentRun.items || currentRun.items.length === 0) {
      toast.error(
        'Cannot export an empty payroll. Add at least one employee.',
        {
          position: isMdScreen ? 'bottom-right' : 'top-center',
        },
      );
      return;
    }

    try {
      const header = [
        'Employee Name',
        'Role',
        'Monthly Gross',
        'Monthly Basic',
        'Monthly Housing',
        'Monthly Transport',
        'One-off Allowances',
        'PAYE',
        'Employee Pension',
        'Employer Pension',
        'Employee NHF',
        'Employee NHIS',
        'Employer NHIS',
        'One-off Deductions',
        'Total Deductions',
        'Net Pay',
        'Employer Cost',
      ];

      const escapeCsv = (value: string | number | undefined | null): string => {
        const str = value == null ? '' : String(value);
        if (str.includes('"') || str.includes(',') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const moneyToNumber = (money: string | undefined): number => {
        return money ? parseFloat(money) : 0;
      };

      const rows = currentRun.items.map((item) => {
        const computedItem = computed.items.find(
          (ci) => ci.runItemId === item.id,
        );
        const rowData = getTableRowData(item, computedItem);

        // Calculate one-off allowances total
        const oneOffAllowancesTotal =
          computedItem?.taxBreakdown?.oneOffAllowances?.total != null
            ? moneyToNumber(computedItem.taxBreakdown.oneOffAllowances.total)
            : (item.edits?.oneOffAllowances?.reduce(
                (sum, allowance) => sum + moneyToNumber(allowance.amount),
                0,
              ) ?? 0);

        // Calculate one-off deductions total
        const oneOffDeductionsTotal =
          item.edits?.oneOffDeductions?.reduce(
            (sum, deduction) => sum + moneyToNumber(deduction.amount),
            0,
          ) ?? 0;

        return [
          rowData.name,
          rowData.role ?? '',
          rowData.monthlyGross.toFixed(2),
          rowData.monthlyBasic.toFixed(2),
          rowData.monthlyHousing.toFixed(2),
          rowData.monthlyTransport.toFixed(2),
          oneOffAllowancesTotal > 0 ? oneOffAllowancesTotal.toFixed(2) : '',
          rowData.paye != null ? rowData.paye.toFixed(2) : '',
          rowData.employeePension.toFixed(2),
          rowData.employerPension.toFixed(2),
          rowData.employeeNhf != null ? rowData.employeeNhf.toFixed(2) : '',
          rowData.employeeNhis != null ? rowData.employeeNhis.toFixed(2) : '',
          rowData.employerNhis != null ? rowData.employerNhis.toFixed(2) : '',
          oneOffDeductionsTotal > 0 ? oneOffDeductionsTotal.toFixed(2) : '',
          rowData.totalDeductions != null
            ? rowData.totalDeductions.toFixed(2)
            : '',
          rowData.netPay.toFixed(2),
          rowData.employerCost != null ? rowData.employerCost.toFixed(2) : '',
        ].map(escapeCsv);
      });

      const csv = [
        header.map(escapeCsv).join(','),
        ...rows.map((r) => r.join(',')),
      ].join('\n');

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      const periodKey = `${currentRun.periodYear}-${String(
        currentRun.periodMonth,
      ).padStart(2, '0')}`;
      const company =
        currentRun.companyName?.trim().replace(/\s+/g, '-') || 'company';
      a.href = url;
      a.download = `${company}-payroll-${periodKey}.csv`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('Payroll exported', {
        position: isMdScreen ? 'bottom-right' : 'top-center',
      });
    } catch (error) {
      logger.error('Failed to export payroll CSV', error, {
        runId: currentRun?.id,
      });
      toast.error('Could not export payroll', {
        position: isMdScreen ? 'bottom-right' : 'top-center',
      });
    }
  }, [currentRun, computed, isMdScreen]);

  const handleResetClick = useCallback(async () => {
    try {
      // Check for finalized runs
      const runsIndex = await loadRunsIndex();
      const finalizedRuns = runsIndex.runs.filter((r) => r.status === 'final');
      const hasFinalized = finalizedRuns.length > 0;

      setHasFinalizedRuns(hasFinalized);
      setResetConfirmOpen(true);
    } catch (error) {
      logger.error('Error checking for finalized runs', error);
      toast.error('Could not check for finalized runs', {
        position: isMdScreen ? 'bottom-right' : 'top-center',
      });
    }
  }, [isMdScreen]);

  const handleResetConfirm = useCallback(async () => {
    try {
      // Delete all runs
      const runsIndex = await loadRunsIndex();
      for (const run of runsIndex.runs) {
        const runKey = getRunKey(run.id);
        await storageDelete(runKey);
      }

      // Delete runs index
      await storageDelete(getRunsIndexKey());

      // Delete employee directory
      await storageDelete(getEmployeeDirectoryKey());

      // Delete company defaults
      await storageDelete(getCompanyDefaultsKey());

      // Reset state
      setCurrentRun(null);
      setRunList([]);
      setComputed(null);
      setCompanyDefaults(COMPANY_DEFAULTS);

      // Close dialog
      setResetConfirmOpen(false);

      // Refresh the page to reset the app
      window.location.reload();
    } catch (error) {
      logger.error('Error resetting payroll data', error);
      toast.error('Could not reset data', {
        position: isMdScreen ? 'bottom-right' : 'top-center',
      });
    }
  }, [isMdScreen]);

  const handleAddEmployee = useCallback(async () => {
    if (!currentRun) return;

    try {
      const { run, runItem: _runItem } = await addEmployeeToRun(
        currentRun,
        companyDefaults,
      );
      // Update state with the new run (which contains the new item)
      // Note: This will trigger computation, but the loading indicator is now delayed
      setCurrentRun(run);

      isXlScreen &&
        toast.success('New employee added', {
          position: isMdScreen ? 'bottom-right' : 'top-center',
        });
    } catch (error) {
      logger.error('Failed to add employee', error, {
        runId: currentRun?.id,
      });
      toast.error('Could not add employee', {
        position: isMdScreen ? 'bottom-right' : 'top-center',
      });
    }
  }, [currentRun, companyDefaults, isMdScreen, isXlScreen]);

  const handleCsvImport = useCallback(
    async (employees: EmployeeRecord[]) => {
      if (!currentRun) return;

      try {
        // If there are existing employees, replace them (as per design doc)
        const runToUpdate =
          currentRun.items.length > 0
            ? { ...currentRun, items: [] }
            : currentRun;

        const { run } = await addEmployeesToRun(runToUpdate, employees);
        setCurrentRun(run);

        toast.success(
          `Imported ${employees.length} employee${employees.length !== 1 ? 's' : ''}`,
          {
            position: isMdScreen ? 'bottom-right' : 'top-center',
          },
        );
      } catch (error) {
        logger.error('Failed to import employees from CSV', error, {
          runId: currentRun?.id,
          employeeCount: employees.length,
        });
        toast.error('Could not import employees', {
          position: isMdScreen ? 'bottom-right' : 'top-center',
        });
        throw error; // Re-throw so dialog can handle it
      }
    },
    [currentRun, isMdScreen],
  );

  const handleEditEmployee = useCallback(
    async (runItem: PayrollRunItem) => {
      if (!currentRun) return;

      const isDraft = currentRun.status === 'draft';

      // Always update EmployeeRecord (source of truth for future runs)
      const { employeeId } = await upsertEmployeeRecordFromRunItem(runItem, {
        allowCreateRef: isDraft,
      }).catch((error: unknown) => {
        logger.error('Failed to save employee directory', error, {
          employeeName: runItem.employeeSnapshot.fullName,
        });
        return { employeeId: undefined };
      });

      const nextRunItem =
        employeeId && runItem.employeeRefId !== employeeId
          ? { ...runItem, employeeRefId: employeeId }
          : runItem;

      // Only update PayrollRunItem snapshot if run is draft
      // Final runs are immutable - snapshot remains unchanged for historical accuracy
      if (isDraft) {
        const updatedRun = {
          ...currentRun,
          items: currentRun.items.map((item) =>
            item.id === nextRunItem.id ? nextRunItem : item,
          ),
          updatedAt: getCurrentTimestamp(),
        };
        setCurrentRun(updatedRun);
        saveRun(updatedRun).catch((error) => {
          logger.error('Failed to save run', error, {
            runId: updatedRun.id,
          });
        });
      } else {
        // Run is finalized - show warning that changes only affect future runs
        toast.info(
          'Changes saved to employee directory. Will apply to future runs only.',
          {
            position: isMdScreen ? 'bottom-right' : 'top-center',
          },
        );
      }
    },
    [currentRun, isMdScreen],
  );

  const handleDeleteEmployee = useCallback(
    async (runItemId: string) => {
      if (!currentRun) return;

      // Prevent deleting from finalized runs
      if (currentRun.status === 'final') {
        toast.error('Cannot delete from finalized run', {
          position: isMdScreen ? 'bottom-right' : 'top-center',
        });
        return;
      }

      const runItem = currentRun.items.find((item) => item.id === runItemId);

      // Remove item from current run and save
      const updatedRun = {
        ...currentRun,
        items: currentRun.items.filter((item) => item.id !== runItemId),
        updatedAt: getCurrentTimestamp(),
      };
      setCurrentRun(updatedRun);
      saveRun(updatedRun).catch((error) => {
        logger.error('Failed to save run', error, {
          runId: updatedRun.id,
        });
      });

      if (!runItem?.employeeRefId) return;

      deleteEmployeeRecord(runItem.employeeRefId).catch((error: unknown) => {
        logger.error('Failed to delete employee record', error, {
          employeeRefId: runItem.employeeRefId,
        });
      });
    },
    [currentRun, isMdScreen],
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'employees':
        return currentRun ? (
          <PayrollTable
            runItems={currentRun.items}
            computedItems={computed?.items}
            onEdit={handleEditEmployee}
            onDelete={handleDeleteEmployee}
            onAdd={handleAddEmployee}
            viewMode={effectiveViewMode}
            runStatus={currentRun.status}
            runPeriod={{
              month: currentRun.periodMonth,
              year: currentRun.periodYear,
              endMonth: currentRun.periodEndMonth,
              endYear: currentRun.periodEndYear,
            }}
            finalizedPeriodKeys={finalizedPeriodKeys}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-muted-foreground text-center">
              <p className="mb-2 text-lg font-medium">
                No payroll run selected
              </p>
              <p className="text-sm">
                Create a new run or load an existing one to get started
              </p>
            </div>
          </div>
        );
      // case 'paye-by-state':
      //   return (
      //     <div className="flex flex-1 items-center justify-center p-6 text-center">
      //       <div className="mx-auto max-w-md space-y-2">
      //         <h2 className="text-lg font-semibold">PAYE by state</h2>
      //         <p className="text-muted-foreground text-sm">
      //           A detailed PAYE breakdown by state is coming soon. For now, you
      //           can export your payroll and analyze PAYE in your own tools.
      //         </p>
      //       </div>
      //     </div>
      //   );
      case 'import':
        return (
          <div className="flex flex-1 flex-col items-center justify-center p-6">
            <div className="mx-auto max-w-md space-y-4 text-center">
              <h2 className="text-lg font-semibold">Import employees</h2>
              <p className="text-muted-foreground text-sm">
                Upload a CSV file to bulk import employees. Download a template
                to get started with the correct format.
              </p>
              <Button
                onClick={() => setCsvImportDialogOpen(true)}
                className="mt-4"
              >
                <Upload className="mr-2 h-4 w-4" />
                Import from CSV
              </Button>
            </div>
            {currentRun && (
              <CsvImportDialog
                open={csvImportDialogOpen}
                onOpenChange={setCsvImportDialogOpen}
                onImport={handleCsvImport}
                periodYear={currentRun.periodYear}
                periodMonth={currentRun.periodMonth}
                existingEmployeeCount={currentRun.items.length}
                isMdScreen={isMdScreen}
              />
            )}
          </div>
        );
      case 'journals':
        return (
          <div className="flex flex-1 items-center justify-center p-6 text-center">
            <div className="mx-auto max-w-md space-y-2">
              <h2 className="text-lg font-semibold">Journals</h2>
              <p className="text-muted-foreground text-sm">
                Journals you can download for use in your accounting system is
                coming soon.
              </p>
            </div>
          </div>
        );
      case 'runs':
        return (
          <div className="flex h-full flex-col gap-3 p-3 sm:p-4">
            <div>
              <h2 className="text-base font-semibold sm:text-lg">
                Payroll runs
              </h2>
              <p className="text-muted-foreground text-xs sm:text-sm">
                Switch between previous payrolls or start a new run.
              </p>
            </div>
            <RunsList
              runs={runList}
              currentRunId={currentRun?.id}
              onSelectRun={handleSelectRun}
              onDeleteRunClick={(run) => {
                setRunToDelete(run);
                setDeleteConfirmOpen(true);
              }}
              onNewRun={handleNewRun}
              variant="full"
            />
          </div>
        );
      case 'company-settings':
        const defaultState = companySettings?.defaultState ?? 'Lagos';
        const prorationMethod =
          companySettings?.employmentProrationMethod ?? 'calendar_days';
        const enableRentRelief = companySettings?.enableRentRelief ?? true;
        const enableYtd = companySettings?.enableYtd ?? true;

        const stateOptions = NIGERIAN_STATES.map((state) => ({
          label: state,
          value: state,
        }));

        const prorationOptions = [
          {
            label: 'Calendar Days',
            value: 'calendar_days',
            description: 'Uses actual days in month',
          },
          {
            label: '30/360',
            value: 'thirty_360',
            description: 'Assumes 30 days per month',
          },
          {
            label: 'Business Days',
            value: 'business_days',
            description: 'Mon-Fri only',
          },
          {
            label: 'Full Month',
            value: 'full_month',
            description: 'Any employment = full month',
          },
        ];

        const pensionConfig = companySettings?.statutoryDeductions?.pension;
        const nhfConfig = companySettings?.statutoryDeductions?.nhf;
        const nhisConfig = companySettings?.statutoryDeductions?.nhis;

        return (
          <div className="scrollbar-thin-2px flex h-full flex-col overflow-y-auto px-3 py-3 sm:px-5 sm:py-5">
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
              <div className="space-y-1">
                <h2 className="text-base font-semibold sm:text-lg">
                  Company settings
                </h2>
                <p className="text-muted-foreground text-xs sm:text-sm">
                  These defaults apply when you create employees and payroll
                  runs.
                </p>
              </div>

              {/* Basic Info */}
              <div className="bg-card space-y-3 rounded border p-3 sm:p-4">
                <div>
                  <p className="text-sm font-medium">Basic information</p>
                  <p className="text-muted-foreground text-xs">
                    Company name and default state for tax calculations.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-muted-foreground text-xs font-medium">
                      Company name
                    </label>
                    <Input
                      type="text"
                      placeholder="Acme Inc."
                      value={companyName}
                      onChange={(e) =>
                        updateCompanyDefaults({ companyName: e.target.value })
                      }
                      className="h-9 rounded"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-muted-foreground text-xs font-medium">
                      Default state
                    </label>
                    <SimpleSelect
                      value={defaultState}
                      onChange={(value) =>
                        updateCompanyDefaults({
                          settings: {
                            defaultState: value as typeof defaultState,
                          },
                        })
                      }
                      options={stateOptions}
                      placeholder="Select state"
                      className="h-9 rounded"
                    />
                  </div>
                </div>
              </div>

              {/* BHT Breakdown */}
              <div className="space-y-3 rounded border p-3 sm:p-4">
                <div>
                  <p className="text-sm font-medium">BHT breakdown</p>
                  <p className="text-muted-foreground text-xs">
                    How basic, housing and transport are split from gross
                    salary.
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {percentSplitFields.map((field) => (
                    <div key={field.id} className="space-y-1">
                      <div className="flex h-7.5 w-full items-center overflow-hidden rounded border bg-transparent shadow-xs">
                        <div className="bg-muted text-muted-foreground flex h-full w-24 shrink-0 items-center border-r px-2 text-xs font-medium sm:w-20 md:w-24 md:uppercase">
                          {field.label}
                        </div>
                        <div className="relative h-full flex-1">
                          <Input
                            id={field.id}
                            inputMode="numeric"
                            type="number"
                            min={0}
                            max={100}
                            step="0.01"
                            placeholder="0"
                            className="h-full rounded-none border-0 pr-7 text-right text-sm shadow-none focus-visible:ring-0"
                            onKeyDown={(e) => {
                              if (e.key === '-') e.preventDefault();
                            }}
                            value={field.value}
                            onChange={(e) => {
                              const raw = e.currentTarget.value;
                              setPolicySplit(field.key, raw ? Number(raw) : 0);
                            }}
                          />
                          <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs">
                            %
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="contents md:col-span-3">
                    <div className="flex h-7.5 gap-3 space-y-1 divide-x sm:col-span-3 sm:justify-between lg:col-span-2">
                      <div className="bg-muted flex h-7.5 w-full items-center overflow-hidden rounded border shadow-xs">
                        <div className="text-muted-foreground flex h-full shrink-0 items-center px-2 text-xs font-medium md:uppercase">
                          Other Allowances
                        </div>
                        <div className="relative h-full flex-1">
                          <Input
                            inputMode="numeric"
                            type="number"
                            value={otherAllowancesPct}
                            readOnly
                            tabIndex={-1}
                            aria-label="Other allowances percent (calculated)"
                            className="h-full rounded-none border-0 pr-7 text-right text-sm shadow-none focus-visible:ring-0"
                          />
                          <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs">
                            %
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Statutory Deductions */}
              <div className="space-y-3 rounded border p-3 sm:p-4">
                <div>
                  <p className="text-sm font-medium">Statutory deductions</p>
                  <p className="text-muted-foreground text-xs">
                    Configure which deductions apply and their rates. You can
                    still override settings per employee later.
                  </p>
                </div>
                <div className="space-y-4">
                  {/* Pension */}
                  <div className="space-y-2 rounded border p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={pensionConfig?.enabled ?? true}
                          onCheckedChange={(checked) =>
                            updateCompanyDefaults({
                              settings: {
                                statutoryDeductions: {
                                  pension: {
                                    enabled: checked === true,
                                    employeeRate:
                                      pensionConfig?.employeeRate ?? 0.08,
                                    employerRate:
                                      pensionConfig?.employerRate ?? 0.1,
                                  },
                                },
                              },
                            })
                          }
                        />
                        <label className="text-sm font-medium">Pension</label>
                      </div>
                    </div>
                    {pensionConfig?.enabled !== false && (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="space-y-1">
                          <label className="text-muted-foreground text-xs">
                            Employee rate
                          </label>
                          <div className="relative">
                            <Input
                              type="number"
                              min={0}
                              max={1}
                              step="0.001"
                              value={
                                pensionConfig?.employeeRate != null
                                  ? (pensionConfig.employeeRate * 100).toFixed(
                                      1,
                                    )
                                  : '8.0'
                              }
                              onChange={(e) => {
                                const value = parseFloat(e.target.value) || 0;
                                updateCompanyDefaults({
                                  settings: {
                                    statutoryDeductions: {
                                      pension: {
                                        enabled: true,
                                        employeeRate: value / 100,
                                        employerRate:
                                          pensionConfig?.employerRate ?? 0.1,
                                      },
                                    },
                                  },
                                });
                              }}
                              className="h-8 pr-8 text-sm"
                            />
                            <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs">
                              %
                            </span>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-muted-foreground text-xs">
                            Employer rate
                          </label>
                          <div className="relative">
                            <Input
                              type="number"
                              min={0}
                              max={1}
                              step="0.001"
                              value={
                                pensionConfig?.employerRate != null
                                  ? (pensionConfig.employerRate * 100).toFixed(
                                      1,
                                    )
                                  : '10.0'
                              }
                              onChange={(e) => {
                                const value = parseFloat(e.target.value) || 0;
                                updateCompanyDefaults({
                                  settings: {
                                    statutoryDeductions: {
                                      pension: {
                                        enabled: true,
                                        employeeRate:
                                          pensionConfig?.employeeRate ?? 0.08,
                                        employerRate: value / 100,
                                      },
                                    },
                                  },
                                });
                              }}
                              className="h-8 pr-8 text-sm"
                            />
                            <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs">
                              %
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* NHF */}
                  <div className="space-y-2 rounded border p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={nhfConfig?.enabled ?? false}
                          onCheckedChange={(checked) =>
                            updateCompanyDefaults({
                              settings: {
                                statutoryDeductions: {
                                  nhf: {
                                    enabled: checked === true,
                                    employeeRate:
                                      nhfConfig?.employeeRate ?? 0.025,
                                  },
                                },
                              },
                            })
                          }
                        />
                        <label className="text-sm font-medium">NHF</label>
                      </div>
                    </div>
                    {nhfConfig?.enabled !== false && (
                      <div className="space-y-1">
                        <label className="text-muted-foreground text-xs">
                          Employee rate (of Basic)
                        </label>
                        <div className="relative">
                          <Input
                            type="number"
                            min={0}
                            max={1}
                            step="0.001"
                            value={
                              nhfConfig?.employeeRate != null
                                ? (nhfConfig.employeeRate * 100).toFixed(2)
                                : '2.5'
                            }
                            onChange={(e) => {
                              const value = parseFloat(e.target.value) || 0;
                              updateCompanyDefaults({
                                settings: {
                                  statutoryDeductions: {
                                    nhf: {
                                      enabled: true,
                                      employeeRate: value / 100,
                                    },
                                  },
                                },
                              });
                            }}
                            className="h-8 pr-8 text-sm"
                          />
                          <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs">
                            %
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* NHIS */}
                  <div className="space-y-2 rounded border p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={nhisConfig?.enabled ?? false}
                          onCheckedChange={(checked) =>
                            updateCompanyDefaults({
                              settings: {
                                statutoryDeductions: {
                                  nhis: {
                                    enabled: checked === true,
                                    employeeRate:
                                      nhisConfig?.employeeRate ?? 0.05,
                                    employerRate:
                                      nhisConfig?.employerRate ?? 0.1,
                                  },
                                },
                              },
                            })
                          }
                        />
                        <label className="text-sm font-medium">NHIS</label>
                      </div>
                    </div>
                    {nhisConfig?.enabled !== false && (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="space-y-1">
                          <label className="text-muted-foreground text-xs">
                            Employee rate (of Basic)
                          </label>
                          <div className="relative">
                            <Input
                              type="number"
                              min={0}
                              max={1}
                              step="0.001"
                              value={
                                nhisConfig?.employeeRate != null
                                  ? (nhisConfig.employeeRate * 100).toFixed(1)
                                  : '5.0'
                              }
                              onChange={(e) => {
                                const value = parseFloat(e.target.value) || 0;
                                updateCompanyDefaults({
                                  settings: {
                                    statutoryDeductions: {
                                      nhis: {
                                        enabled: true,
                                        employeeRate: value / 100,
                                        employerRate:
                                          nhisConfig?.employerRate ?? 0.1,
                                      },
                                    },
                                  },
                                });
                              }}
                              className="h-8 pr-8 text-sm"
                            />
                            <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs">
                              %
                            </span>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-muted-foreground text-xs">
                            Employer rate (of Basic)
                          </label>
                          <div className="relative">
                            <Input
                              type="number"
                              min={0}
                              max={1}
                              step="0.001"
                              value={
                                nhisConfig?.employerRate != null
                                  ? (nhisConfig.employerRate * 100).toFixed(1)
                                  : '10.0'
                              }
                              onChange={(e) => {
                                const value = parseFloat(e.target.value) || 0;
                                updateCompanyDefaults({
                                  settings: {
                                    statutoryDeductions: {
                                      nhis: {
                                        enabled: true,
                                        employeeRate:
                                          nhisConfig?.employeeRate ?? 0.05,
                                        employerRate: value / 100,
                                      },
                                    },
                                  },
                                });
                              }}
                              className="h-8 pr-8 text-sm"
                            />
                            <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs">
                              %
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Proration & Tax Settings */}
              <div className="space-y-3 rounded border p-3 sm:p-4">
                <div>
                  <p className="text-sm font-medium">
                    Proration & tax settings
                  </p>
                  <p className="text-muted-foreground text-xs">
                    How to calculate partial months and tax relief options.
                  </p>
                </div>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-muted-foreground text-xs font-medium">
                      Employment proration method
                    </label>
                    <SimpleSelect
                      value={prorationMethod}
                      onChange={(value) =>
                        updateCompanyDefaults({
                          settings: {
                            employmentProrationMethod:
                              value as typeof prorationMethod,
                          },
                        })
                      }
                      options={prorationOptions.map((opt) => ({
                        label: `${opt.label} - ${opt.description}`,
                        value: opt.value,
                      }))}
                      placeholder="Select method"
                      className="h-9 rounded"
                    />
                  </div>
                  <div className="flex items-center justify-between rounded border p-3">
                    <div className="space-y-0.5">
                      <label className="text-sm font-medium">
                        Enable rent relief
                      </label>
                      <p className="text-muted-foreground text-xs">
                        20% of annual rent, capped at ₦500k
                      </p>
                    </div>
                    <Checkbox
                      checked={enableRentRelief}
                      onCheckedChange={(checked) =>
                        updateCompanyDefaults({
                          settings: {
                            enableRentRelief: checked === true,
                          },
                        })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between rounded border p-3">
                    <div className="space-y-0.5">
                      <label className="text-sm font-medium">
                        Enable YTD computation
                      </label>
                      <p className="text-muted-foreground text-xs">
                        Cumulative PAYE from all finalized runs in tax year
                      </p>
                    </div>
                    <Checkbox
                      checked={enableYtd}
                      onCheckedChange={(checked) =>
                        updateCompanyDefaults({
                          settings: {
                            enableYtd: checked === true,
                          },
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check for CMD (Mac) or Ctrl (Windows/Linux)
      const isModifierPressed = event.metaKey || event.ctrlKey;

      if (!isModifierPressed) return;

      // CMD/CTRL + Shift + N: Create new run
      // Using Shift+N to avoid conflict with CMD/CTRL+R (browser refresh)
      if (event.shiftKey && (event.key === 'n' || event.key === 'N')) {
        event.preventDefault();
        handleNewRun();
        return;
      }

      // CMD/CTRL + E: Add new employee
      if (event.key === 'e' || event.key === 'E') {
        event.preventDefault();
        handleAddEmployee();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleNewRun, handleAddEmployee]);

  function setPolicySplit(
    key: 'basic' | 'housing' | 'transport',
    nextValue: number,
  ) {
    const current = companySettings?.bhtBreakdown || {};
    const values = {
      basic: current.basic ?? 1,
      housing: current.housing ?? 0,
      transport: current.transport ?? 0,
    };

    const next = percentToRate(clampPercent(nextValue));
    const otherSum = Object.entries(values)
      .filter(([k]) => k !== key)
      .reduce((sum, [, v]) => sum + v, 0);

    updateCompanyDefaults({
      settings: {
        bhtBreakdown: {
          [key]: Math.min(next, 1 - otherSum),
        },
      },
    });
  }

  const breakdown = companySettings?.bhtBreakdown;

  const basicPct = rateToPercent(breakdown?.basic ?? 1);
  const housingPct = rateToPercent(breakdown?.housing ?? 0);
  const transportPct = rateToPercent(breakdown?.transport ?? 0);

  const otherAllowancesPct = Number(
    Math.max(0, 100 - (basicPct + housingPct + transportPct)).toFixed(2),
  );

  const handleStatutoryChange = useCallback(
    (checked: boolean, key: StatutoryDeductionKey) => {
      updateCompanyDefaults({
        settings: {
          statutoryDeductions: {
            [key]: {
              enabled: checked,
            },
          },
        },
      });
    },
    [companySettings, updateCompanyDefaults],
  );

  const renderStatutoryToggles = () =>
    STATUTORY_DEDUCTIONS.map((item) => {
      const deduction = companySettings?.statutoryDeductions?.[item.key];
      return (
        <StatutoryDeductionToggle
          key={item.id}
          label={item.label}
          value={deduction?.enabled ?? false}
          onChange={(checked: boolean) =>
            handleStatutoryChange(checked, item.key)
          }
        />
      );
    });

  const percentSplitFields = [
    {
      id: 'company-policy-basic',
      label: 'Basic',
      value: basicPct,
      key: 'basic',
    },
    {
      id: 'company-policy-housing',
      label: 'Housing',
      value: housingPct,
      key: 'housing',
    },
    {
      id: 'company-policy-transport',
      label: 'Transport',
      value: transportPct,
      key: 'transport',
    },
  ] as const;

  // Extract totals from computed payroll data
  const totals = computed?.periodTotals;
  const moneyToNumber = (money: string | undefined): number => {
    return money ? parseFloat(money) : 0;
  };

  // Compute total "other deductions" (non-statutory) across all employees.
  // This is: totalDeductions - (employee pension + employee NHF + employee NHIS),
  // summed over all items. It lets users reconcile statutory vs other deductions.
  const otherDeductionsTotal =
    computed?.items?.reduce((sum, item) => {
      if (!item.totalDeductions) {
        return sum;
      }

      const totalDeductions = moneyToNumber(item.totalDeductions);
      const employeePension = item.employeePension
        ? moneyToNumber(item.employeePension)
        : 0;
      const employeeNhf = item.employeeNhf
        ? moneyToNumber(item.employeeNhf)
        : 0;
      const employeeNhis = item.employeeNhis
        ? moneyToNumber(item.employeeNhis)
        : 0;

      // "Other" = recurring + one-off non-statutory deductions
      const otherForItem =
        totalDeductions - (employeePension + employeeNhf + employeeNhis);

      return sum + otherForItem;
    }, 0) ?? 0;

  const summaryValues: Partial<Record<SummaryCardKey, number>> = {
    gross: totals ? moneyToNumber(totals.grossTotal) : 0,
    paye: totals ? moneyToNumber(totals.payeTotal) : undefined,
    total_pension: totals
      ? moneyToNumber(totals.employeePensionTotal) +
        moneyToNumber(totals.employerPensionTotal)
      : 0,
    nhis: totals
      ? moneyToNumber(totals.employeeNhisTotal) +
        moneyToNumber(totals.employerNhisTotal)
      : undefined,
    nhf: totals ? moneyToNumber(totals.nhfTotal) : undefined,
    net: totals ? moneyToNumber(totals.netTotal) : 0,
    ee_pension: totals ? moneyToNumber(totals.employeePensionTotal) : 0,
    er_pension: totals ? moneyToNumber(totals.employerPensionTotal) : 0,
    other: otherDeductionsTotal,
    employees: currentRun ? currentRun.items.length : 0,
  };

  const hasNhis = summaryValues.nhis != null;
  const hasNhf = summaryValues.nhf != null;

  // Always keep this display order.
  const summaryKeys: SummaryCardKey[] = [
    'gross',
    'paye',
    'total_pension',
    'net',
    ...(hasNhis || hasNhf
      ? (['nhis', 'nhf'] as const)
      : (['ee_pension', 'er_pension'] as const)),
    'other',
    'employees',
  ];

  const summaryCards = summaryKeys.reduce<SummaryCardProps[]>(
    (acc, summaryKey) => {
      const value = summaryValues[summaryKey];
      // Only include cards with defined values (undefined means not applicable)
      if (value != null && value !== undefined) {
        acc.push({ summaryKey, value });
      }
      return acc;
    },
    [],
  );

  const mobileVisibleSummaryCount = summaryCards.reduce((count, item) => {
    return count + (MOBILE_VISIBLE_KEYS.has(item.summaryKey) ? 1 : 0);
  }, 0);

  // Mobile UX: clamp the grid height and fade the bottom so the screen
  // has more room; tap to expand/collapse.
  const shouldClampOnMobile = mobileVisibleSummaryCount > 3;
  const isMobileClamped = shouldClampOnMobile && !showAllOnMobile;

  return (
    <div className="relative mx-auto flex h-full min-h-0 w-full max-w-7xl flex-col">
      <div className="flex flex-1 touch-pan-y flex-col overflow-y-auto pt-4 md:overflow-hidden">
        <div className="flex flex-col items-center justify-between gap-3 px-4 pb-3 sm:px-8 sm:pb-0 md:flex-row">
          <div className="h-9 w-full md:h-10">
            <Input
              type="text"
              placeholder="Acme Inc."
              value={companyName}
              onChange={(e) =>
                updateCompanyDefaults({ companyName: e.target.value })
              }
              className="h-full rounded"
            />
          </div>
          <div className="flex h-9 w-full items-center justify-between gap-3 rounded border md:h-10 md:w-fit">
            <SimpleSelect
              value={month}
              onChange={setMonth}
              options={MONTH_OPTIONS}
              placeholder="Month"
              className="w-[115px] flex-1 !gap-1 border-none bg-transparent px-2 !shadow-none focus-visible:ring-0"
            />
            <div className="bg-border h-4 w-px" />
            <SimpleSelect
              value={year}
              onChange={setYear}
              placeholder="Year"
              options={yearOptions}
              className="w-[80px] border-none bg-transparent px-2 !shadow-none focus:ring-0 focus-visible:ring-0"
            />
          </div>
        </div>

        <div
          className={cn(
            'scrollbar-thin-2px flex flex-1 touch-pan-y flex-col space-y-3 overflow-x-hidden overflow-y-auto px-4 sm:px-8 sm:pt-3',
            'md:overflow-hidden',
          )}
        >
          <div className="relative">
            {summaryCards.length > LG_VISIBLE_COUNT && (
              <div className="absolute -top-2 right-0 z-50 hidden justify-end lg:flex">
                <button
                  type="button"
                  className="text-muted-foreground/50 hover:text-muted-foreground cursor-pointer text-xs underline underline-offset-2"
                  onClick={() => setShowAllOnLg((v) => !v)}
                >
                  {showAllOnLg ? 'Show less' : 'Show more'}
                </button>
              </div>
            )}
            <div
              className={[
                'grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4 lg:pt-2',
                isMobileClamped && 'max-h-[240px] overflow-hidden',
                'lg:max-h-none lg:overflow-visible',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {summaryCards.map((item, index) => {
                const isMobileHidden = !MOBILE_VISIBLE_KEYS.has(
                  item.summaryKey,
                );
                const isExtraOnLg = index >= LG_VISIBLE_COUNT;

                const className =
                  [
                    // Mobile: only show the core keys.
                    isMobileHidden && 'hidden sm:block',

                    // Large screens: default to only the first N cards.
                    !showAllOnLg && isExtraOnLg && 'lg:hidden',

                    // Large screens: animate in the extra cards when expanding.
                    showAllOnLg &&
                      isExtraOnLg &&
                      'lg:animate-in lg:fade-in-0 lg:zoom-in-95 lg:duration-200 motion-reduce:lg:animate-none',
                  ]
                    .filter(Boolean)
                    .join(' ') || undefined;

                return (
                  <SummaryCard
                    key={item.summaryKey}
                    summaryKey={item.summaryKey}
                    value={item.value}
                    className={className}
                  />
                );
              })}
            </div>

            {isMobileClamped && (
              <>
                <div className="to-background pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-b from-transparent lg:hidden" />
                <div className="absolute inset-x-0 bottom-2 flex justify-center lg:hidden">
                  <button
                    type="button"
                    className="bg-background/80 text-foreground border-border/30 hover:bg-background cursor-pointer rounded-md border border-t-0 px-3 py-1 text-xs shadow-xs backdrop-blur"
                    onClick={() => setShowAllOnMobile(true)}
                  >
                    Show more
                  </button>
                </div>
              </>
            )}

            {shouldClampOnMobile && showAllOnMobile && (
              <div className="mt-2 flex justify-center lg:hidden">
                <button
                  type="button"
                  className="text-muted-foreground/70 hover:text-muted-foreground text-xs underline underline-offset-2"
                  onClick={() => setShowAllOnMobile(false)}
                >
                  Show less
                </button>
              </div>
            )}
          </div>

          <div
            className={cn(
              'relative space-y-3 xl:flex xl:flex-row xl:gap-4 xl:space-y-0',
              showPolicyAndRuns ? 'xl:h-[170px]' : '',
            )}
          >
            {/* Show/hide the company policy and payroll run container */}
            <button
              type="button"
              className="absolute top-0 -left-5 z-10 hidden cursor-pointer transition-opacity hover:opacity-70 md:block"
              onClick={() => setShowPolicyAndRuns((v) => !v)}
              aria-label={
                showPolicyAndRuns
                  ? 'Hide company policy and runs'
                  : 'Show company policy and runs'
              }
            >
              {showPolicyAndRuns ? (
                <Eye className="text-muted-foreground size-4" />
              ) : (
                <EyeClosed className="text-muted-foreground size-4" />
              )}
            </button>
            {/* Company Policy */}
            {(!isMdScreen || showPolicyAndRuns) && (
              <div className="hidden overflow-hidden rounded-sm border text-sm md:block xl:flex-1">
                <button
                  type="button"
                  className="hover:bg-muted/30 flex w-full items-center justify-between gap-3 rounded p-4 py-3 text-left xl:cursor-default xl:hover:bg-transparent"
                  aria-expanded={isCompanyPolicyOpen || isXlScreen}
                  onClick={() =>
                    !isXlScreen && setIsCompanyPolicyOpen((v) => !v)
                  }
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-sm font-medium">
                      <Settings2 className="size-4" />
                      Company Policy
                    </div>
                    <div className="text-muted-foreground mt-0.5 truncate text-xs">
                      Defaults applied when creating employees.
                    </div>
                  </div>
                  <ChevronDown
                    className={[
                      'text-muted-foreground size-4 shrink-0 transition-transform xl:hidden',
                      isCompanyPolicyOpen ? 'rotate-180' : 'rotate-0',
                    ].join(' ')}
                  />
                </button>
                {(isCompanyPolicyOpen || isXlScreen) && (
                  <div className="border-t p-4 sm:p-5">
                    <div className="grid gap-2 sm:grid-cols-3">
                      {percentSplitFields.map((field) => (
                        <div key={field.id} className="space-y-1">
                          <div className="flex h-7.5 w-full items-center overflow-hidden rounded border bg-transparent shadow-xs">
                            <div className="bg-muted text-muted-foreground flex h-full w-24 shrink-0 items-center border-r px-2 text-xs font-medium sm:w-20 md:w-24 md:uppercase">
                              {field.label}
                            </div>
                            <div className="relative h-full flex-1">
                              <Input
                                id={field.id}
                                inputMode="numeric"
                                type="number"
                                min={0}
                                max={100}
                                step="0.01"
                                placeholder="0"
                                className="h-full rounded-none border-0 pr-7 text-right text-sm shadow-none focus-visible:ring-0"
                                onKeyDown={(e) => {
                                  if (e.key === '-') e.preventDefault();
                                }}
                                value={field.value}
                                onChange={(e) => {
                                  const raw = e.currentTarget.value;
                                  setPolicySplit(
                                    field.key,
                                    raw ? Number(raw) : 0,
                                  );
                                }}
                              />
                              <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs">
                                %
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                      {/* Auto-calculated: 100% - Basic - Housing - Transport */}
                      <div className="contents xl:col-span-3 xl:flex xl:w-full xl:items-center xl:gap-2">
                        <div className="flex h-7.5 gap-3 space-y-1 divide-x sm:col-span-3 sm:justify-between lg:col-span-2 xl:flex-1">
                          <div className="bg-muted flex h-7.5 w-full items-center overflow-hidden rounded border shadow-xs">
                            <div className="text-muted-foreground flex h-full shrink-0 items-center px-2 text-xs font-medium md:uppercase">
                              Other Allowances
                            </div>
                            <div className="relative h-full flex-1">
                              <Input
                                inputMode="numeric"
                                type="number"
                                value={otherAllowancesPct}
                                readOnly
                                tabIndex={-1}
                                aria-label="Other allowances percent (calculated)"
                                className="h-full rounded-none border-0 pr-7 text-right text-sm shadow-none focus-visible:ring-0"
                              />
                              <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs">
                                %
                              </span>
                            </div>
                          </div>
                          <div className="hidden justify-between gap-2 sm:flex sm:flex-shrink-0 lg:hidden">
                            {/* <StatutoryDeductionToggles
                              pension={pensionEnabled}
                              nhf={nhfEnabled}
                              nhis={nhisEnabled}
                              onPensionChange={handlePensionChange}
                              onNhfChange={handleNhfChange}
                              onNhisChange={handleNhisChange}
                            /> */}
                            {renderStatutoryToggles()}
                          </div>
                        </div>
                        <div className="hidden justify-between gap-2 lg:flex xl:flex-1">
                          {renderStatutoryToggles()}
                        </div>
                      </div>
                    </div>
                    <fieldset className="space-y-2 sm:hidden">
                      <legend className="text-muted-foreground text-xs">
                        Apply statutory deductions company-wide
                      </legend>
                      <div className="flex justify-between gap-2">
                        {renderStatutoryToggles()}
                      </div>
                    </fieldset>
                  </div>
                )}
              </div>
            )}

            {/* Runs */}
            {(!isMdScreen || showPolicyAndRuns) && (
              <RunsList
                runs={runList}
                currentRunId={currentRun?.id}
                onSelectRun={handleSelectRun}
                onDeleteRunClick={(run) => {
                  setRunToDelete(run);
                  setDeleteConfirmOpen(true);
                }}
                onNewRun={handleNewRun}
                variant="sidebar"
              />
            )}
          </div>

          {/* Tabs Navigation */}
          <div className="hidden items-center justify-between md:flex">
            <div className="*:hover:bg-muted/50 *:text-muted-foreground flex items-center gap-1 rounded border p-1 text-sm *:cursor-pointer *:rounded *:px-3 *:py-1">
              {tabs.map((tab) => (
                <div
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    activeTab === tab.id &&
                      '!text-primary bg-muted font-medium',
                  )}
                >
                  {tab.label}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 *:cursor-pointer *:rounded">
              <Button variant="ghost" onClick={handleNewRun}>
                <Grid2x2Plus className="size-4" /> <span>New Run</span>
              </Button>
              {currentRun?.status === 'final' ? (
                <Button variant="outline" onClick={handleDuplicateRun}>
                  <Copy className="size-4" /> <span>Make a copy</span>
                </Button>
              ) : (
                <Button onClick={handleFinalizeRunClick}>
                  <Save className="size-4" /> <span>Finalize</span>
                </Button>
              )}
              <Button variant="outline" onClick={handleExportCsv}>
                <Download className="size-4" />
                <span className="">Export</span>
              </Button>
            </div>
          </div>

          <div className="relative flex-1 rounded border md:flex md:min-h-0 md:flex-col">
            {isComputing && (
              <div className="bg-background/50 absolute inset-0 z-10 flex items-center justify-center backdrop-blur-sm">
                <div className="text-muted-foreground text-sm">
                  Computing payroll...
                </div>
              </div>
            )}
            {renderTabContent()}
          </div>
        </div>
      </div>
      <div className="min-h-3">
        <div className="text-muted-foreground hidden items-center justify-between px-4 text-[10px] sm:px-8 md:flex">
          <div className="flex items-center gap-2">
            <p className="before:text-red-500 before:content-['*_']">
              Based on NTA 2025
            </p>
            <button
              onClick={handleResetClick}
              className="text-red-500 hover:text-red-600 hover:underline cursor-pointer"
            >
              Reset
            </button>
          </div>
          <p className="space-x-1">
            <a
              href="https://getaccountable.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-blue-600 hover:underline"
            >
              Accountable
            </a>
            <span>•</span>
            <a
              href="https://linkedin.com/in/temi-adenuga/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-blue-500 hover:underline"
            >
              Temi
            </a>
            <a />
          </p>
        </div>
      </div>

      {/* Small screen Nav */}
      <div
        className={cn(
          'flex flex-shrink-0 items-center justify-between gap-2 border-t px-6 py-2 md:hidden',
        )}
      >
        <div
          className="flex cursor-pointer flex-col items-center justify-center"
          onClick={
            currentRun?.status === 'final'
              ? handleDuplicateRun
              : handleFinalizeRunClick
          }
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              if (currentRun?.status === 'final') {
                handleDuplicateRun();
              } else {
                handleFinalizeRunClick();
              }
            }
          }}
        >
          {currentRun?.status === 'final' ? (
            <>
              <Copy className="size-5" />
              <span className="text-[11px]">Copy</span>
            </>
          ) : (
            <>
              <SaveIcon className="size-5" />
              <span className="text-[11px]">Finalize</span>
            </>
          )}
        </div>
        <div
          className="flex cursor-pointer flex-col items-center justify-center"
          onClick={handleAddEmployee}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleAddEmployee();
            }
          }}
        >
          <UserRoundPlus className="bg-muted size-5 rounded-full" />
          <span className="text-[11px]">Add Employee</span>
        </div>
        <Popover open={moreMenuOpen} onOpenChange={setMoreMenuOpen}>
          <PopoverTrigger asChild>
            <div className="flex cursor-pointer flex-col items-center justify-center">
              <Ellipsis className="size-5" />
              <span className="text-[11px]">More</span>
            </div>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            side="top"
            className="-mr-2 mb-2 w-56 rounded p-2"
          >
            {[
              {
                label: 'New Run',
                icon: Plus,
                onClick: () => {
                  handleNewRun();
                },
              },
              // Removing temporarily until we have a CSV import feature
              // {
              //   label: 'Import Employees (CSV)',
              //   icon: FileUp,
              //   onClick: () => {
              //     logger.info('Import Employees CSV - not yet implemented');
              //   },
              // },
              {
                label: 'Export Payroll (CSV)',
                icon: FileDown,
                onClick: () => {
                  handleExportCsv();
                },
              },
              {
                label: 'Reset',
                icon: Trash2,
                onClick: () => {
                  setMoreMenuOpen(false);
                  handleResetClick();
                },
                isDestructive: true,
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  onClick={item.onClick}
                  className={cn(
                    'hover:bg-accent hover:text-accent-foreground flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors outline-none',
                    item.isDestructive && 'text-red-500 hover:text-red-600',
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </button>
              );
            })}
          </PopoverContent>
        </Popover>
      </div>

      {/* Welcome Dialog */}
      <WelcomeDialog
        open={welcomeOpen}
        onOpenChange={setWelcomeOpen}
        isLoading={isLoadingRuns}
        onNewRun={handleNewRun}
        onStartWithSampleData={handleStartWithSampleData}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="rounded sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Payroll Run</DialogTitle>
            <DialogDescription>
              {runToDelete?.status === 'final' ? (
                <>
                  Are you sure you want to delete this finalized payroll run?
                  This action cannot be undone.
                </>
              ) : (
                <>
                  Are you sure you want to delete this payroll run? This action
                  cannot be undone.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {runToDelete && (
            <div className="bg-muted/50 rounded border p-3 text-sm">
              <div className="font-medium">{runToDelete.label}</div>
              {runToDelete.status === 'final' && (
                <div className="text-muted-foreground mt-1 text-xs">
                  Status: Finalized
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteConfirmOpen(false);
                setRunToDelete(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!runToDelete) return;

                try {
                  await deleteRun(runToDelete.id);

                  // Refresh runs index
                  const updatedIndex = await refreshRunList();

                  // If we deleted the current run, load the next available one or show blank
                  if (currentRun?.id === runToDelete.id) {
                    if (updatedIndex.runs.length > 0) {
                      // Try to load the next run
                      const { run: loadedRun } = await findFirstLoadableRun(
                        updatedIndex.runs,
                      );
                      applyLoadedRun(loadedRun);
                    } else {
                      // No runs left
                      applyLoadedRun(null);
                      setWelcomeOpen(true);
                    }
                  }

                  toast.success('Payroll run deleted', {
                    position: isMdScreen ? 'bottom-right' : 'top-center',
                  });
                  setDeleteConfirmOpen(false);
                  setRunToDelete(null);
                } catch (error) {
                  logger.error('Error deleting run', error, {
                    runId: runToDelete.id,
                  });
                  toast.error('Could not delete run', {
                    position: isMdScreen ? 'bottom-right' : 'top-center',
                  });
                }
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Confirmation Dialog */}
      <Dialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <DialogContent className="rounded sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset Payroll Data</DialogTitle>
            <DialogDescription>
              {hasFinalizedRuns ? (
                <>
                  Are you sure you want to reset all payroll data? This will
                  delete all runs, including finalized runs, employees, and
                  company settings. This action cannot be undone.
                </>
              ) : (
                <>
                  Are you sure you want to reset all payroll data? This will
                  delete all runs, employees, and company settings. This action
                  cannot be undone.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setResetConfirmOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleResetConfirm}
            >
              Reset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FinalizeDialog
        open={finalizeDialogOpen}
        onOpenChange={(open) => {
          if (isFinalizingRun) return;
          setFinalizeDialogOpen(open);
          if (!open) {
            setFinalizedByName('');
            setConflictingRun(null);
            setFinalizeDialogMode('finalize');
          }
        }}
        onRequestClose={() => {
          setFinalizeDialogOpen(false);
          setFinalizedByName('');
          setConflictingRun(null);
          setFinalizeDialogMode('finalize');
          setMonthGaps([]);
        }}
        finalizedByName={finalizedByName}
        mode={finalizeDialogMode}
        conflictingRun={conflictingRun}
        onOverrideConfirm={handleOverrideConfirm}
        monthGaps={monthGaps}
        onFinalizedByNameChange={setFinalizedByName}
        isFinalizing={isFinalizingRun}
        onFinalize={handleFinalizeRun}
        currentRun={currentRun}
        computed={computed}
        isMdScreen={isMdScreen}
      />
    </div>
  );
}

function WelcomeDialog({
  open,
  onOpenChange,
  isLoading,
  onNewRun,
  onStartWithSampleData,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isLoading: boolean;
  onNewRun: () => void;
  onStartWithSampleData: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="rounded sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle>Welcome</DialogTitle>
          <DialogDescription>
            Get started by creating your first payroll run or explore with
            sample data.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="!flex-col gap-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-start">
            <Button
              variant="outline"
              onClick={onStartWithSampleData}
              disabled={isLoading}
              className="w-full rounded sm:w-auto"
            >
              Try with sample data
            </Button>
            <Button
              onClick={onNewRun}
              disabled={isLoading}
              className="w-full rounded sm:w-auto"
            >
              Start payroll
            </Button>
          </div>
          <p className="text-muted-foreground text-right text-xs">
            Made with 💙 by{' '}
            <a
              href="https://linkedin.com/in/temi-adenuga/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              Temi
            </a>
          </p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
