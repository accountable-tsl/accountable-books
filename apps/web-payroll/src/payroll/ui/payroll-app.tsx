import type {
  PayrollCompanyDefaults,
  PayrollRun,
  PayrollRunIndexEntry,
  PayrollRunItem,
} from '@/payroll/domain';
import type { SummaryCardKey, SummaryCardProps } from '@/payroll/summary-card';
import type { CompanyDefaultsUpdate } from '@/payroll/utils';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { addEmployeeToRun } from '@/payroll/actions/add-employee';
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
  loadCompanyDefaults,
  loadRun,
  loadRunsIndex,
  saveCompanyDefaults,
  saveRun,
} from '@/payroll/storage';
import { SummaryCard } from '@/payroll/summary-card';
import {
  formatRunTooltipText,
  generateId,
  getCurrentTimestamp,
  parsePeriod,
  updateCompanyDefaultSettings,
} from '@/payroll/utils';
import {
  ChevronDown,
  Copy,
  Download,
  Ellipsis,
  Eye,
  EyeClosed,
  FileDown,
  FileUp,
  Grid2x2Plus,
  Plus,
  Save,
  SaveIcon,
  Settings2,
  UserRoundPlus,
} from 'lucide-react';
import { toast } from 'sonner';

import { computeRun } from '../compute/compute-run';
import {
  COMPANY_DEFAULTS,
  DEMO_COMPANY_DEFAULTS,
} from '../data/company-defaults';
import { SimpleSelect } from '../simple-select';
import { PayrollTable } from './payroll-table';

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
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [runToDelete, setRunToDelete] = useState<{
    id: string;
    label: string;
    status: 'draft' | 'final';
  } | null>(null);
  const [finalizeDialogOpen, setFinalizeDialogOpen] = useState(false);
  const [finalizedByName, setFinalizedByName] = useState('');
  const [_syncOption, setSyncOption] = useState<'local' | 'cloud' | null>(null);

  // Initialize company settings with default values
  const [companyDefaults, setCompanyDefaults] =
    useState<PayrollCompanyDefaults>(COMPANY_DEFAULTS);

  const companySettings = companyDefaults.settings;
  const companyName = companyDefaults.companyName ?? '';
  const runCompanyName = companyDefaults.companyName?.trim() || 'Company';
  const currentYear = new Date().getFullYear();
  const yearOptions = [String(currentYear), String(currentYear + 1)];

  // Default to detailed view on screens >= 1280px, standard otherwise
  const isXlScreen = useMediaQuery('(min-width: 1280px)');
  const isMdScreen = useMediaQuery('(min-width: 768px)');

  const tabs = [
    { id: 'employees' as const, label: 'Employees' },
    { id: 'paye-by-state' as const, label: 'PAYE by state' },
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

  // Compute run on-the-fly
  const computed = useMemo(() => {
    if (!currentRun) return null;
    try {
      return computeRun(currentRun, { nowIso: currentRun.updatedAt });
    } catch (e) {
      console.error('Compute error:', e);
      return null;
    }
  }, [currentRun]);

  // Helper to update company settings and save
  const updateCompanyDefaults = useCallback(
    async (updates: CompanyDefaultsUpdate) => {
      const updated = updateCompanyDefaultSettings(companyDefaults, updates);
      setCompanyDefaults(updated);
      try {
        await saveCompanyDefaults({
          companyName: updated.companyName,
          settings: updated.settings,
        });
      } catch (error) {
        console.error('Failed to save company settings:', error);
      }
    },
    [companyDefaults],
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

      setCurrentRun(run);
      setIsSampleRun(false);
      // Don't update month/year when loading a run - these are for new run creation only
      // This prevents flickering caused by triggering the load effect below

      if (run.settings) {
        updateCompanyDefaults({ settings: run.settings });
      }
    },
    [updateCompanyDefaults],
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
        console.error('Failed to load company defaults:', error);
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
        setWelcomeOpen(true);
      } finally {
        setIsLoadingRuns(false);
      }
    })();
    // Only run on mount - month/year changes don't trigger reload
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      console.error('Error creating new run:', error);
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

  const handleFinalizeRunClick = useCallback(() => {
    if (!currentRun) return;

    // Validation with helpful toast messages
    if (currentRun.items.length === 0) {
      toast.error('Cannot finalize empty payroll', {
        position: isMdScreen ? 'bottom-right' : 'top-center',
      });
      return;
    }

    // Compute payroll to check if gross is zero
    const computedData = computeRun(currentRun);
    const totalGross = parseFloat(computedData.periodTotals.grossTotal);
    if (totalGross === 0) {
      toast.error('Cannot finalize payroll with zero gross', {
        position: isMdScreen ? 'bottom-right' : 'top-center',
      });
      return;
    }

    // Open dialog if validation passes
    setFinalizeDialogOpen(true);
  }, [currentRun, isMdScreen]);

  const handleFinalizeRun = useCallback(
    async (name: string, sync: 'local' | 'cloud') => {
      if (!currentRun) return;

      try {
        // Compute payroll before finalizing to ensure data is ready
        const computedData = computeRun(currentRun);

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
        setSyncOption(null);

        toast.success('Payroll run finalized', {
          position: isMdScreen ? 'bottom-right' : 'top-center',
        });
      } catch (error) {
        console.error('Error finalizing run:', error);
        const errorMessage =
          error instanceof Error
            ? error.message
            : 'Failed to finalize payroll run';
        toast.error('Could not finalize payroll run', {
          position: isMdScreen ? 'bottom-right' : 'top-center',
        });
      }
    },
    [currentRun, refreshRunList, isMdScreen],
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
      console.error('Error saving sample data:', error);
      toast.error('Could not save sample data', {
        position: isMdScreen ? 'bottom-right' : 'top-center',
      });
    }
  }, [year, month, refreshRunList, updateCompanyDefaults, isMdScreen]);

  const handleAddEmployee = useCallback(async () => {
    if (!currentRun) return;

    try {
      const { run, runItem: _runItem } = await addEmployeeToRun(
        currentRun,
        companyDefaults,
      );
      // Update state with the new run (which contains the new item)
      setCurrentRun(run);

      isXlScreen &&
        toast.success('New employee added', {
          position: isMdScreen ? 'bottom-right' : 'top-center',
        });
    } catch (error) {
      console.error('Failed to add employee:', error);
      toast.error('Could not add employee', {
        position: isMdScreen ? 'bottom-right' : 'top-center',
      });
    }
  }, [currentRun, companyDefaults, isMdScreen, isXlScreen]);

  const handleEditEmployee = useCallback(
    async (runItem: PayrollRunItem) => {
      if (!currentRun) return;

      const isDraft = currentRun.status === 'draft';

      // Always update EmployeeRecord (source of truth for future runs)
      const { employeeId } = await upsertEmployeeRecordFromRunItem(runItem, {
        allowCreateRef: isDraft,
      }).catch((error: unknown) => {
        console.error('Failed to save employee directory:', error);
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
          console.error('Failed to save run:', error);
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
        console.error('Failed to save run:', error);
      });

      if (!runItem?.employeeRefId) return;

      deleteEmployeeRecord(runItem.employeeRefId).catch((error: unknown) => {
        console.error('Failed to delete employee record:', error);
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
            runSettings={currentRun.settings}
            runStatus={currentRun.status}
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
      case 'paye-by-state':
      case 'import':
      case 'journals':
      case 'runs':
      case 'company-settings':
        return null;
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
    other: undefined, // Not computed yet
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
    <div className="relative mx-auto flex h-svh w-full max-w-7xl flex-col">
      <div className="flex flex-1 touch-pan-y flex-col overflow-y-auto pt-15 md:overflow-hidden">
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
              <div className="flex max-h-[160px] min-h-[100px] flex-col overflow-y-auto rounded border text-sm xl:h-full xl:max-h-none xl:flex-1">
                <div className="p-2 font-medium">Payroll runs</div>
                <ul className="scrollbar-thin-2px flex-1 space-y-1 overflow-x-hidden overflow-y-auto px-2 pr-6">
                  {runList.length === 0 ? (
                    <li className="text-muted-foreground py-4 text-center text-xs">
                      No runs yet
                    </li>
                  ) : (
                    runList.map((run) => {
                      const isCurrentRun = currentRun?.id === run.id;
                      const isDemoRun = run.isDemo;
                      const tooltipText = formatRunTooltipText(run);
                      // Extract period from label (format: "Company • YYYY-MM")
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
                                  isCurrentRun
                                    ? 'font-medium text-blue-500'
                                    : '',
                                )}
                                title={tooltipText}
                                onClick={async () => {
                                  try {
                                    const loadedRun = await loadRun(run.id);
                                    if (loadedRun) {
                                      applyLoadedRun(loadedRun);
                                    } else {
                                      toast.error('Could not load run', {
                                        position: isMdScreen
                                          ? 'bottom-right'
                                          : 'top-center',
                                      });
                                    }
                                  } catch (error) {
                                    toast.error('Could not load run', {
                                      position: isMdScreen
                                        ? 'bottom-right'
                                        : 'top-center',
                                    });
                                  }
                                }}
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
                            onClick={() => {
                              setRunToDelete(run);
                              setDeleteConfirmOpen(true);
                            }}
                          >
                            Delete
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
                <div
                  className="bg-muted flex w-full cursor-pointer items-center justify-center gap-1 p-1"
                  onClick={handleNewRun}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleNewRun();
                    }
                  }}
                >
                  <Plus className="size-4" />
                  <span className="text-xs">New Run</span>
                </div>
              </div>
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
                <Button variant="outline" onClick={handleFinalizeRunClick}>
                  <Save className="size-4" /> <span>Finalize</span>
                </Button>
              )}
              <Button variant="outline">
                <Download className="size-4" />
                <span className="">Export</span>
              </Button>
            </div>
          </div>

          <div className="flex-1 rounded border md:flex md:min-h-0 md:flex-col">
            {renderTabContent()}
          </div>
        </div>
      </div>
      <div className="min-h-3">
        <div className="text-muted-foreground hidden items-center justify-between px-4 text-[10px] sm:px-8 md:flex">
          <p className="before:text-red-500 before:content-['*_']">
            Based on NTA 2025
          </p>
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
          onClick={handleFinalizeRunClick}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleFinalizeRunClick();
            }
          }}
        >
          <SaveIcon className="size-5" />
          <span className="text-[11px]">Save</span>
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
        <Popover>
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
              {
                label: 'Import Employees (CSV)',
                icon: FileUp,
                onClick: () => {
                  // TODO: Implement employee data import
                  console.log('Import Employees CSV');
                },
              },
              {
                label: 'Export Payroll (CSV)',
                icon: FileDown,
                onClick: () => {
                  // TODO: Implement payroll export
                  console.log('Export Payroll CSV');
                },
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  onClick={item.onClick}
                  className="hover:bg-accent hover:text-accent-foreground flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors outline-none"
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
                  console.error('Error deleting run:', error);
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

      {/* Finalize Confirmation Dialog */}
      <Dialog open={finalizeDialogOpen} onOpenChange={setFinalizeDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Finalize Payroll Run</DialogTitle>
            <DialogDescription>
              Once finalized, this payroll run will be locked and cannot be
              edited. Make sure all data is correct before proceeding.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label
                htmlFor="finalized-by-name"
                className="text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Finalized by (optional)
              </label>
              <Input
                id="finalized-by-name"
                placeholder="Enter your name"
                value={finalizedByName}
                onChange={(e) => setFinalizedByName(e.target.value)}
                className="w-full"
              />
            </div>
            <div className="space-y-3">
              <p className="text-sm font-medium">Choose how to save:</p>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setSyncOption('local');
                    handleFinalizeRun(finalizedByName, 'local');
                  }}
                  className="w-full rounded-lg border-2 border-orange-200 bg-orange-50 p-4 text-left transition-colors hover:bg-orange-100 focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:outline-none"
                >
                  <div className="font-semibold text-orange-900">
                    Save Locally
                  </div>
                  <div className="mt-1 text-sm text-orange-700">
                    Data saved on this device only. Not accessible on other
                    devices. Risk of data loss if device data is cleared.
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSyncOption('cloud');
                    handleFinalizeRun(finalizedByName, 'cloud');
                  }}
                  className="w-full rounded-lg border-2 border-green-200 bg-green-50 p-4 text-left transition-colors hover:bg-green-100 focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:outline-none"
                >
                  <div className="font-semibold text-green-900">
                    Save & Sync
                  </div>
                  <div className="mt-1 text-sm text-green-700">
                    Data saved and synced across devices. Access from anywhere,
                    anytime.
                  </div>
                </button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setFinalizeDialogOpen(false);
                setFinalizedByName('');
                setSyncOption(null);
              }}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
