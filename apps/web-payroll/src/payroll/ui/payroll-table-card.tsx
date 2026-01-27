import type { ComponentProps } from 'react';
import { useEffect, useRef, useState } from 'react';
import { DatePicker } from '@/components/date-pickers';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import {
  Calculator,
  ChevronDown,
  Lock,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { z } from 'zod';

import { PFAS } from '../data/pfa';
import { NIGERIAN_STATES } from '../data/states';
import {
  IsoDateSchema,
  MoneySchema,
  PayrollComputedItemSchema,
} from '../domain';
import { SimpleSelect } from '../simple-select';
import {
  buildMonthKey,
  getActiveCompRecord,
  getCompStartPolicy,
  getPreviousMonthKey,
  hasFinalizedOverlap,
  needsFutureStartConfirm,
} from './comp-history-utils';
import { ComputationDetailsSheet } from './computation-details-sheet';
import { getTableRowData, ngnMoneyFormatter } from './payroll-table-utils';

import type { PfaKey } from '../data/pfa';
import type { StateValue } from '../data/states';
import type { PayrollRunItem } from '../domain';

type PayrollComputedItem = z.infer<typeof PayrollComputedItemSchema>;

const STATE_OPTIONS = [
  { label: 'Company default', value: 'default' },
  ...NIGERIAN_STATES.map((state) => ({ label: state, value: state })),
];

const PFA_OPTIONS = [
  { label: 'Not set', value: 'default' },
  ...PFAS.map((pfa) => ({ label: pfa.label, value: pfa.key })),
];

const RECURRING_TAX_TREATMENTS = [
  'non_taxable',
  'pension_voluntary',
  'nhf_voluntary',
  'nhis_voluntary',
  'owner_occupied_mortgage_interest',
  'life_insurance_premium',
] as const;

const RECURRING_TAX_OPTIONS = [
  { label: 'Standard (net pay only)', value: 'non_taxable' },
  { label: 'Voluntary pension (allowable)', value: 'pension_voluntary' },
  { label: 'Voluntary NHF (allowable)', value: 'nhf_voluntary' },
  { label: 'Voluntary NHIS (allowable)', value: 'nhis_voluntary' },
  {
    label: 'Mortgage interest (allowable)',
    value: 'owner_occupied_mortgage_interest',
  },
  {
    label: 'Life insurance premium (allowable)',
    value: 'life_insurance_premium',
  },
];

const ONE_OFF_ALLOWANCE_TAX_TREATMENTS = [
  'taxable',
  'loss_of_employment_benefit',
  'death_injury_compensation',
  'redundancy_payment',
] as const;

const ONE_OFF_ALLOWANCE_TAX_OPTIONS = [
  { label: 'Taxable (default)', value: 'taxable' },
  {
    label: 'Loss of employment benefit (exempt cap)',
    value: 'loss_of_employment_benefit',
  },
  {
    label: 'Death/injury compensation (exempt)',
    value: 'death_injury_compensation',
  },
  { label: 'Redundancy payment (exempt)', value: 'redundancy_payment' },
];

const ONE_OFF_DEDUCTION_TAX_TREATMENTS = RECURRING_TAX_TREATMENTS;

const EMPLOYER_CONTRIBUTION_OPTIONS = [
  { label: 'Pension top-up', value: 'pension' },
  { label: 'NHIS contribution', value: 'nhis' },
  { label: 'Other employer cost', value: 'other' },
];

const MONTH_OPTIONS = [
  { label: 'Jan', value: '1' },
  { label: 'Feb', value: '2' },
  { label: 'Mar', value: '3' },
  { label: 'Apr', value: '4' },
  { label: 'May', value: '5' },
  { label: 'Jun', value: '6' },
  { label: 'Jul', value: '7' },
  { label: 'Aug', value: '8' },
  { label: 'Sep', value: '9' },
  { label: 'Oct', value: '10' },
  { label: 'Nov', value: '11' },
  { label: 'Dec', value: '12' },
] as const;

const getMonthKeyParts = (monthKey?: string) => {
  if (!monthKey) {
    return { month: '', year: '' };
  }
  const [year, month] = monthKey.split('-');
  return { year, month: String(Number(month)) };
};

const formatMonthKeyLabel = (monthKey: string) => {
  const [year, month] = monthKey.split('-');
  if (!year || !month) return '';
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};

const formatPeriodLabel = (fromMonth: string, toMonth?: string) => {
  const startLabel = formatMonthKeyLabel(fromMonth);
  if (!toMonth) {
    return `${startLabel} - Present`;
  }
  const endLabel = formatMonthKeyLabel(toMonth);
  return `${startLabel} - ${endLabel}`;
};

const getMonthsInPeriod = (fromMonth?: string, toMonth?: string) => {
  if (!fromMonth || !toMonth) return null;
  const [fromYear, fromMonthValue] = fromMonth.split('-').map(Number);
  const [toYear, toMonthValue] = toMonth.split('-').map(Number);
  if (
    !Number.isFinite(fromYear) ||
    !Number.isFinite(fromMonthValue) ||
    !Number.isFinite(toYear) ||
    !Number.isFinite(toMonthValue)
  ) {
    return null;
  }
  const months = (toYear - fromYear) * 12 + (toMonthValue - fromMonthValue) + 1;
  return months > 0 ? months : null;
};

const formatTaxTreatmentLabel = (value?: string) => {
  if (!value) return 'Standard';
  const labels: Record<string, string> = {
    taxable: 'Taxable',
    non_taxable: 'Non-taxable',
    loss_of_employment_benefit: 'Loss of employment',
    death_injury_compensation: 'Death/injury',
    redundancy_payment: 'Redundancy',
    pension_voluntary: 'Voluntary pension',
    nhf_voluntary: 'Voluntary NHF',
    nhis_voluntary: 'Voluntary NHIS',
    owner_occupied_mortgage_interest: 'Mortgage interest',
    life_insurance_premium: 'Life insurance',
  };
  return labels[value] ?? value.replace(/_/g, ' ');
};

const oneOffTypeLabels: Record<string, string> = {
  allowance: 'Allowance',
  deduction: 'Deduction',
  employer: 'Employer',
};

const oneOffTypeClassNames: Record<string, string> = {
  allowance:
    'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400',
  deduction: 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400',
  employer: 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400',
};

const ONE_OFF_KIND_OPTIONS = [
  { label: 'Allowance', value: 'allowance' },
  { label: 'Deduction', value: 'deduction' },
  { label: 'Employer contribution', value: 'employer' },
];

const employerTypeLabels: Record<EmployerContributionType, string> = {
  pension: 'Pension',
  nhis: 'NHIS',
  other: 'Other',
};

const normalizeMoneyInput = (value: string) => {
  const cleaned = value.replace(/[^\d.]/g, '');
  if (!cleaned) return '';
  const [whole, ...parts] = cleaned.split('.');
  const normalizedWhole = whole.length > 0 ? whole : '0';
  const normalizedFraction = parts.join('');
  return normalizedFraction.length > 0
    ? `${normalizedWhole}.${normalizedFraction}`
    : normalizedWhole;
};

const formatMoneyDisplayValue = (value: string) => {
  const normalized = normalizeMoneyInput(value);
  if (!normalized) return '';
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return normalized;
  const decimals = normalized.includes('.')
    ? Math.min(6, normalized.split('.')[1].length)
    : 0;
  return ngnMoneyFormatter(parsed, decimals);
};

type MoneyInputProps = {
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  inputMode?: ComponentProps<'input'>['inputMode'];
};

const MoneyInput = ({
  value,
  onValueChange,
  placeholder,
  disabled,
  className,
  inputMode = 'decimal',
}: MoneyInputProps) => {
  const [isFocused, setIsFocused] = useState(false);
  const [displayValue, setDisplayValue] = useState(value ?? '');

  useEffect(() => {
    if (isFocused) return;
    setDisplayValue(value ? formatMoneyDisplayValue(value) : '');
  }, [value, isFocused]);

  return (
    <Input
      value={displayValue}
      onChange={(event) => {
        const nextDisplay = event.target.value;
        setDisplayValue(nextDisplay);
        onValueChange(normalizeMoneyInput(nextDisplay));
      }}
      onFocus={() => {
        setIsFocused(true);
        setDisplayValue(value ?? '');
      }}
      onBlur={() => {
        setIsFocused(false);
        const normalized = normalizeMoneyInput(displayValue);
        onValueChange(normalized);
        setDisplayValue(normalized ? formatMoneyDisplayValue(normalized) : '');
      }}
      placeholder={placeholder}
      disabled={disabled}
      inputMode={inputMode}
      className={className}
    />
  );
};

interface PayrollTableCardProps {
  runItem: PayrollRunItem;
  computedItem?: PayrollComputedItem;
  onEdit: (runItem: PayrollRunItem) => void;
  onDelete: (runItemId: string) => void;
  runStatus?: 'draft' | 'final';
  runPeriod?: {
    month: number;
    year: number;
    endMonth?: number;
    endYear?: number;
  };
  finalizedPeriodKeys?: string[];
}

type HistoryKind = 'comp' | 'rent';
type HistoryMode = 'add' | 'edit';

interface HistoryDraft {
  kind: HistoryKind;
  mode: HistoryMode;
  id?: string;
  fromMonth: string;
  fromYear: string;
  toMonth?: string;
  toYear?: string;
  isOngoing?: boolean;
  entryMode: 'monthly' | 'annual';
  includeBreakdown?: boolean;
  annualGross?: string;
  monthlyGross?: string;
  note?: string;
  basic?: string;
  housing?: string;
  transport?: string;
  periodRent?: string;
  monthlyRent?: string;
  address?: string;
  startLocked?: boolean;
  startLockHint?: string;
  autoEndNotice?: string;
  futureStartConfirmed?: boolean;
}

type PendingCompAutoEnd = {
  startKey: string;
  endKey: string;
};

type RecurringTaxTreatment = (typeof RECURRING_TAX_TREATMENTS)[number];
type RecurringDeduction = NonNullable<
  PayrollRunItem['payProfileSnapshot']['recurringDeductions']
>[number];

interface RecurringDraft {
  mode: 'add' | 'edit';
  id?: string;
  name: string;
  amount: string;
  taxTreatment: RecurringTaxTreatment;
  fromMonth: string;
  fromYear: string;
  toMonth?: string;
  toYear?: string;
  isOngoing?: boolean;
}

type RecurringDraftErrors = {
  name?: string;
  amount?: string;
  taxTreatment?: string;
  from?: string;
  to?: string;
};

type OneOffKind = 'allowance' | 'deduction' | 'employer';
type OneOffAllowanceTaxTreatment =
  (typeof ONE_OFF_ALLOWANCE_TAX_TREATMENTS)[number];
type OneOffDeductionTaxTreatment = RecurringTaxTreatment;
type OneOffTaxTreatment =
  | OneOffAllowanceTaxTreatment
  | OneOffDeductionTaxTreatment;
type EmployerContributionType = 'pension' | 'nhis' | 'other';

type OneOffAllowance = NonNullable<
  NonNullable<PayrollRunItem['edits']>['oneOffAllowances']
>[number];
type OneOffDeduction = NonNullable<
  NonNullable<PayrollRunItem['edits']>['oneOffDeductions']
>[number];
type OneOffEmployerContribution = NonNullable<
  NonNullable<PayrollRunItem['edits']>['oneOffEmployerContributions']
>[number];

interface OneOffDraft {
  mode: 'add' | 'edit';
  id?: string;
  kind: OneOffKind;
  name: string;
  amount: string;
  taxTreatment?: OneOffTaxTreatment;
  employerType?: EmployerContributionType;
}

type OneOffDraftErrors = {
  name?: string;
  amount?: string;
  taxTreatment?: string;
  employerType?: string;
};

type PayrollEmployeeEditorOptions = Pick<
  PayrollTableCardProps,
  | 'runItem'
  | 'computedItem'
  | 'onEdit'
  | 'runStatus'
  | 'runPeriod'
  | 'finalizedPeriodKeys'
>;

export function usePayrollEmployeeEditor({
  runItem,
  computedItem,
  onEdit,
  runStatus = 'draft',
  runPeriod,
  finalizedPeriodKeys = [],
}: PayrollEmployeeEditorOptions) {
  const rowData = getTableRowData(runItem, computedItem);
  const isReadOnly = runStatus === 'final';

  // State for inline editing
  const [name, setName] = useState(runItem.employeeSnapshot.fullName);
  const [role, setRole] = useState(runItem.employeeSnapshot.role || '');
  const [detailsDrawerOpen, setDetailsDrawerOpen] = useState(false);
  const [computationDrawerOpen, setComputationDrawerOpen] = useState(false);
  const [isEditingGross, setIsEditingGross] = useState(false);
  const [grossInputValue, setGrossInputValue] = useState('');
  const [editedMonthlyGross, setEditedMonthlyGross] = useState<number | null>(
    null,
  );
  const [historyDraft, setHistoryDraft] = useState<HistoryDraft | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyDiscardPromptOpen, setHistoryDiscardPromptOpen] =
    useState(false);
  const [pendingDrawerClose, setPendingDrawerClose] = useState(false);
  const [pendingCompAutoEnd, setPendingCompAutoEnd] =
    useState<PendingCompAutoEnd | null>(null);
  const [recurringDraft, setRecurringDraft] = useState<RecurringDraft | null>(
    null,
  );
  const [recurringErrors, setRecurringErrors] = useState<RecurringDraftErrors>(
    {},
  );
  const [oneOffDraft, setOneOffDraft] = useState<OneOffDraft | null>(null);
  const [oneOffErrors, setOneOffErrors] = useState<OneOffDraftErrors>({});
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [oneOffOpen, setOneOffOpen] = useState(false);
  const didMountRef = useRef(false);
  const employeeUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const historyDraftSnapshotRef = useRef<string | null>(null);
  const runItemRef = useRef(runItem);
  const lastCommittedRef = useRef<{
    name: string;
    role?: string;
    employeeId?: string;
    department?: string;
    email?: string;
    phoneNumber?: string;
    taxId?: string;
    pfa?: PfaKey;
    rsaPin?: string;
    bankName?: string;
    bankAccountNumber?: string;
    bankAccountName?: string;
    joinDate?: string;
    exitDate?: string;
  } | null>(null);
  const grossInputRef = useRef<HTMLInputElement>(null);

  // Derive monthlyGross from runItem data
  const monthlyGross = editedMonthlyGross ?? rowData.monthlyGross;
  const [employeeState, setEmployeeState] = useState<StateValue | undefined>(
    runItem.payProfileSnapshot.state,
  );
  const [employeeIdInput, setEmployeeIdInput] = useState(
    runItem.employeeSnapshot.employeeId ?? '',
  );
  const [departmentInput, setDepartmentInput] = useState(
    runItem.employeeSnapshot.department ?? '',
  );
  const [emailInput, setEmailInput] = useState(
    runItem.employeeSnapshot.email ?? '',
  );
  const [phoneInput, setPhoneInput] = useState(
    runItem.employeeSnapshot.phoneNumber ?? '',
  );
  const [taxIdInput, setTaxIdInput] = useState(
    runItem.employeeSnapshot.taxId ?? '',
  );
  const [pfaInput, setPfaInput] = useState(
    runItem.employeeSnapshot.pfa ?? 'default',
  );
  const [rsaPinInput, setRsaPinInput] = useState(
    runItem.employeeSnapshot.rsaPin ?? '',
  );
  const [bankNameInput, setBankNameInput] = useState(
    runItem.employeeSnapshot.bankName ?? '',
  );
  const [bankAccountNumberInput, setBankAccountNumberInput] = useState(
    runItem.employeeSnapshot.bankAccountNumber ?? '',
  );
  const [bankAccountNameInput, setBankAccountNameInput] = useState(
    runItem.employeeSnapshot.bankAccountName ?? '',
  );
  const [joinDateInput, setJoinDateInput] = useState(
    runItem.employeeSnapshot.joinDate ?? '',
  );
  const [exitDateInput, setExitDateInput] = useState(
    runItem.employeeSnapshot.exitDate ?? '',
  );
  const pensionConfig = runItem.payProfileSnapshot.pension;
  const [pensionEmployeeRateInput, setPensionEmployeeRateInput] = useState(
    pensionConfig?.employeeRate != null
      ? (pensionConfig.employeeRate * 100).toFixed(1)
      : '',
  );
  const [pensionEmployerRateInput, setPensionEmployerRateInput] = useState(
    pensionConfig?.employerRate != null
      ? (pensionConfig.employerRate * 100).toFixed(1)
      : '',
  );
  const nhfConfig = runItem.payProfileSnapshot.nhf;
  const [nhfInput, setNhfInput] = useState(() => {
    if (nhfConfig?.employeeRate != null) {
      return (nhfConfig.employeeRate * 100).toFixed(1) + '%';
    }
    if (nhfConfig?.employeeAmount != null) {
      return nhfConfig.employeeAmount;
    }
    return '';
  });
  const nhisConfig = runItem.payProfileSnapshot.nhis;
  const [nhisEmployeeRateInput, setNhisEmployeeRateInput] = useState(
    nhisConfig?.employeeRate != null
      ? (nhisConfig.employeeRate * 100).toFixed(1)
      : '',
  );
  const [nhisEmployerRateInput, setNhisEmployerRateInput] = useState(
    nhisConfig?.employerRate != null
      ? (nhisConfig.employerRate * 100).toFixed(1)
      : '',
  );
  const [emailError, setEmailError] = useState<string | null>(null);
  const [bankAccountNumberError, setBankAccountNumberError] = useState<
    string | null
  >(null);
  const [joinDateError, setJoinDateError] = useState<string | null>(null);
  const [exitDateError, setExitDateError] = useState<string | null>(null);
  const emailClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const systemDate = new Date();
  const runStartMonth = runPeriod?.month ?? systemDate.getMonth() + 1;
  const runStartYear = runPeriod?.year ?? systemDate.getFullYear();
  const runEndMonth = runPeriod?.endMonth ?? runStartMonth;
  const runEndYear = runPeriod?.endYear ?? runStartYear;
  const currentMonth = String(runEndMonth);
  const currentYear = String(runEndYear);
  const yearOptions = Array.from({ length: 7 }, (_, index) =>
    String(runEndYear - 3 + index),
  );
  const currentMonthKey = buildMonthKey(currentMonth, currentYear);
  const runStartKey = buildMonthKey(
    String(runStartMonth),
    String(runStartYear),
  );
  const stateDisplay = employeeState ?? runItem.payProfileSnapshot.state;
  const stateChipLabel = stateDisplay || 'Company default';
  const recurringDeductions =
    runItem.payProfileSnapshot.recurringDeductions ?? [];
  const oneOffAllowances = runItem.edits?.oneOffAllowances ?? [];
  const oneOffDeductions = runItem.edits?.oneOffDeductions ?? [];
  const oneOffEmployerContributions =
    runItem.edits?.oneOffEmployerContributions ?? [];
  const oneOffItems = [
    ...oneOffAllowances.map((item) => ({
      ...item,
      kind: 'allowance' as const,
    })),
    ...oneOffDeductions.map((item) => ({
      ...item,
      kind: 'deduction' as const,
    })),
    ...oneOffEmployerContributions.map((item) => ({
      ...item,
      kind: 'employer' as const,
    })),
  ];
  const parseMoneyValue = (value?: string) => {
    if (!value) return 0;
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const parseDraftMoneyValue = (value?: string) => {
    const trimmed = (value ?? '').trim();
    if (!trimmed) {
      return { value: null, hasValue: false, isValid: true };
    }
    const result = MoneySchema.safeParse(trimmed);
    if (!result.success) {
      return { value: null, hasValue: true, isValid: false };
    }
    return {
      value: parseFloat(result.data),
      hasValue: true,
      isValid: true,
    };
  };
  const formatMoneyPlaceholder = (value: number) => {
    if (!Number.isFinite(value) || value <= 0) return '';
    return String(Math.round(value));
  };
  const compensationHistory = runItem.payProfileSnapshot.compensationHistory;
  const sortedCompHistory = [...compensationHistory].sort((a, b) =>
    b.fromMonth.localeCompare(a.fromMonth),
  );
  const rentHistory = runItem.payProfileSnapshot.rentHistory ?? [];
  const sortedRentHistory = [...rentHistory].sort((a, b) =>
    b.fromMonth.localeCompare(a.fromMonth),
  );

  console.log('sortedRentHistory', sortedRentHistory);
  const activeCompRecord = getActiveCompRecord(
    compensationHistory,
    currentMonthKey,
  );
  const {
    nextStartKey: nextCompStartKey,
    autoEndKey: compAutoEndKey,
    startLocked: compStartLocked,
  } = getCompStartPolicy({
    activeRecord: activeCompRecord,
    periodKey: currentMonthKey,
  });
  const nextCompStartParts = getMonthKeyParts(nextCompStartKey);
  const nextCompStartMonth = nextCompStartParts.month || currentMonth;
  const nextCompStartYear = nextCompStartParts.year || currentYear;
  const nextCompStartLabel = nextCompStartKey
    ? formatMonthKeyLabel(nextCompStartKey)
    : '';
  const compStartLockedFlag = Boolean(compStartLocked);
  const compStartLockHint =
    compStartLockedFlag && nextCompStartLabel
      ? `Start month locked to ${nextCompStartLabel} to avoid overlaps. End the current record to change it.`
      : undefined;
  const hasFinalizedOverlapForComp = (fromMonth: string, toMonth?: string) =>
    hasFinalizedOverlap(fromMonth, toMonth, finalizedPeriodKeys);
  const hasFinalizedOverlapForRent = (fromMonth: string, toMonth?: string) =>
    hasFinalizedOverlap(fromMonth, toMonth, finalizedPeriodKeys);
  const placeholderMonthlyGrossValue =
    rowData.monthlyGross > 0 ? rowData.monthlyGross : 600_000;
  const placeholderAnnualGrossValue = placeholderMonthlyGrossValue * 12;
  const breakdownRates = (() => {
    const gross = rowData.monthlyGross > 0 ? rowData.monthlyGross : 0;
    if (gross <= 0) {
      return { basic: 1, housing: 0, transport: 0 };
    }
    const total =
      rowData.monthlyBasic + rowData.monthlyHousing + rowData.monthlyTransport;
    if (total <= 0) {
      return { basic: 1, housing: 0, transport: 0 };
    }
    return {
      basic: rowData.monthlyBasic / gross,
      housing: rowData.monthlyHousing / gross,
      transport: rowData.monthlyTransport / gross,
    };
  })();
  const hasExplicitBhtBreakdown = Boolean(
    activeCompRecord?.annualBasic ||
      activeCompRecord?.annualHousing ||
      activeCompRecord?.annualTransport,
  );
  const placeholderAnnualBreakdown = hasExplicitBhtBreakdown
    ? {
        basic: parseMoneyValue(activeCompRecord?.annualBasic),
        housing: parseMoneyValue(activeCompRecord?.annualHousing),
        transport: parseMoneyValue(activeCompRecord?.annualTransport),
      }
    : {
        basic: placeholderAnnualGrossValue * breakdownRates.basic,
        housing: placeholderAnnualGrossValue * breakdownRates.housing,
        transport: placeholderAnnualGrossValue * breakdownRates.transport,
      };
  const placeholderMonthlyBreakdown = {
    basic: placeholderAnnualBreakdown.basic / 12,
    housing: placeholderAnnualBreakdown.housing / 12,
    transport: placeholderAnnualBreakdown.transport / 12,
  };
  const placeholderOtherAnnual = Math.max(
    0,
    placeholderAnnualGrossValue -
      (placeholderAnnualBreakdown.basic +
        placeholderAnnualBreakdown.housing +
        placeholderAnnualBreakdown.transport),
  );
  const placeholderOtherMonthly = Math.max(
    0,
    placeholderMonthlyGrossValue -
      (placeholderMonthlyBreakdown.basic +
        placeholderMonthlyBreakdown.housing +
        placeholderMonthlyBreakdown.transport),
  );
  const bhtPlaceholderValues = {
    grossMonthly: formatMoneyPlaceholder(placeholderMonthlyGrossValue),
    grossAnnual: formatMoneyPlaceholder(placeholderAnnualGrossValue),
    basicMonthly: formatMoneyPlaceholder(placeholderMonthlyBreakdown.basic),
    basicAnnual: formatMoneyPlaceholder(placeholderAnnualBreakdown.basic),
    housingMonthly: formatMoneyPlaceholder(placeholderMonthlyBreakdown.housing),
    housingAnnual: formatMoneyPlaceholder(placeholderAnnualBreakdown.housing),
    transportMonthly: formatMoneyPlaceholder(
      placeholderMonthlyBreakdown.transport,
    ),
    transportAnnual: formatMoneyPlaceholder(
      placeholderAnnualBreakdown.transport,
    ),
    otherMonthly: formatMoneyPlaceholder(placeholderOtherMonthly),
    otherAnnual: formatMoneyPlaceholder(placeholderOtherAnnual),
  };

  const normalizeOptional = (value: string) => {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  };

  const serializeHistoryDraft = (draft: HistoryDraft | null) => {
    if (!draft) return null;
    return JSON.stringify({
      kind: draft.kind,
      mode: draft.mode,
      id: draft.id ?? null,
      fromMonth: draft.fromMonth,
      fromYear: draft.fromYear,
      toMonth: draft.toMonth ?? null,
      toYear: draft.toYear ?? null,
      isOngoing: Boolean(draft.isOngoing),
      entryMode: draft.entryMode ?? 'monthly',
      includeBreakdown: Boolean(draft.includeBreakdown),
      annualGross: draft.annualGross ?? '',
      monthlyGross: draft.monthlyGross ?? '',
      note: draft.note ?? '',
      basic: draft.basic ?? '',
      housing: draft.housing ?? '',
      transport: draft.transport ?? '',
      periodRent: draft.periodRent ?? '',
      monthlyRent: draft.monthlyRent ?? '',
      address: draft.address ?? '',
    });
  };

  const validateIsoDateInput = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return { valid: true, value: undefined };
    const result = IsoDateSchema.safeParse(trimmed);
    return {
      valid: result.success,
      value: result.success ? result.data : undefined,
    };
  };

  const isValidPfaKey = (value: string): value is PfaKey =>
    PFAS.some((pfa) => pfa.key === value);

  const isValidRecurringTaxTreatment = (
    value: string,
  ): value is RecurringTaxTreatment =>
    RECURRING_TAX_TREATMENTS.includes(value as RecurringTaxTreatment);

  const isValidAllowanceTaxTreatment = (
    value?: string,
  ): value is OneOffAllowanceTaxTreatment =>
    ONE_OFF_ALLOWANCE_TAX_TREATMENTS.includes(
      value as OneOffAllowanceTaxTreatment,
    );

  const isValidDeductionTaxTreatment = (
    value?: string,
  ): value is OneOffDeductionTaxTreatment =>
    ONE_OFF_DEDUCTION_TAX_TREATMENTS.includes(
      value as OneOffDeductionTaxTreatment,
    );

  const getDefaultOneOffTaxTreatment = (
    kind: OneOffKind,
  ): OneOffTaxTreatment | undefined => {
    if (kind === 'allowance') return 'taxable';
    if (kind === 'deduction') return 'non_taxable';
    return undefined;
  };

  const validateBankAccountNumberInput = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return { valid: true, value: undefined };
    const isValid = /^\d{10,20}$/.test(trimmed);
    return { valid: isValid, value: isValid ? trimmed : undefined };
  };

  const optionalEmailSchema = z.preprocess((value) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }, z.string().email().optional());

  const validateEmailInput = (value: string) => {
    const result = optionalEmailSchema.safeParse(value);
    return {
      valid: result.success,
      value: result.success ? result.data : undefined,
    };
  };

  const getValidatedEmail = () => {
    const result = validateEmailInput(emailInput);
    if (result.valid) {
      return result.value;
    }
    return runItem.employeeSnapshot.email;
  };

  const getValidatedPfa = () => {
    if (!pfaInput || pfaInput === 'default') return undefined;
    return isValidPfaKey(pfaInput) ? pfaInput : runItem.employeeSnapshot.pfa;
  };

  const getValidatedBankAccountNumber = () => {
    const result = validateBankAccountNumberInput(bankAccountNumberInput);
    if (result.valid) {
      return result.value;
    }
    return runItem.employeeSnapshot.bankAccountNumber;
  };

  const getValidatedEmploymentDates = () => {
    const joinResult = validateIsoDateInput(joinDateInput);
    const exitResult = validateIsoDateInput(exitDateInput);

    const joinValue = joinResult.valid
      ? joinResult.value
      : runItem.employeeSnapshot.joinDate;
    const exitValue = exitResult.valid
      ? exitResult.value
      : runItem.employeeSnapshot.exitDate;

    if (
      joinResult.valid &&
      exitResult.valid &&
      joinResult.value &&
      exitResult.value &&
      exitResult.value < joinResult.value
    ) {
      return {
        joinDate: runItem.employeeSnapshot.joinDate,
        exitDate: runItem.employeeSnapshot.exitDate,
      };
    }

    return { joinDate: joinValue, exitDate: exitValue };
  };

  const getEmployeeSnapshotEdits = (overrides?: { state?: StateValue }) => ({
    ...runItemRef.current.employeeSnapshot,
    fullName: name,
    role: normalizeOptional(role),
    employeeId: normalizeOptional(employeeIdInput),
    department: normalizeOptional(departmentInput),
    email: getValidatedEmail(),
    phoneNumber: normalizeOptional(phoneInput),
    taxId: normalizeOptional(taxIdInput),
    pfa: getValidatedPfa(),
    rsaPin: normalizeOptional(rsaPinInput),
    bankName: normalizeOptional(bankNameInput),
    bankAccountNumber: getValidatedBankAccountNumber(),
    bankAccountName: normalizeOptional(bankAccountNameInput),
    ...getValidatedEmploymentDates(),
    state:
      overrides?.state !== undefined
        ? overrides.state
        : (employeeState ?? runItemRef.current.employeeSnapshot.state),
  });

  const getEmployeeSnapshotComparable = () => ({
    name,
    role: normalizeOptional(role),
    employeeId: normalizeOptional(employeeIdInput),
    department: normalizeOptional(departmentInput),
    email: getValidatedEmail(),
    phoneNumber: normalizeOptional(phoneInput),
    taxId: normalizeOptional(taxIdInput),
    pfa: getValidatedPfa(),
    rsaPin: normalizeOptional(rsaPinInput),
    bankName: normalizeOptional(bankNameInput),
    bankAccountNumber: getValidatedBankAccountNumber(),
    bankAccountName: normalizeOptional(bankAccountNameInput),
    ...getValidatedEmploymentDates(),
  });

  const commitEmployeeEdits = () => {
    if (employeeUpdateTimeoutRef.current) {
      clearTimeout(employeeUpdateTimeoutRef.current);
      employeeUpdateTimeoutRef.current = null;
    }

    if (isReadOnly) return;
    const baseRunItem = runItemRef.current;
    const comparable = getEmployeeSnapshotComparable();
    if (
      comparable.name === baseRunItem.employeeSnapshot.fullName &&
      comparable.role === baseRunItem.employeeSnapshot.role &&
      comparable.employeeId === baseRunItem.employeeSnapshot.employeeId &&
      comparable.department === baseRunItem.employeeSnapshot.department &&
      comparable.email === baseRunItem.employeeSnapshot.email &&
      comparable.phoneNumber === baseRunItem.employeeSnapshot.phoneNumber &&
      comparable.taxId === baseRunItem.employeeSnapshot.taxId &&
      comparable.pfa === baseRunItem.employeeSnapshot.pfa &&
      comparable.rsaPin === baseRunItem.employeeSnapshot.rsaPin &&
      comparable.bankName === baseRunItem.employeeSnapshot.bankName &&
      comparable.bankAccountNumber ===
        baseRunItem.employeeSnapshot.bankAccountNumber &&
      comparable.bankAccountName ===
        baseRunItem.employeeSnapshot.bankAccountName &&
      comparable.joinDate === baseRunItem.employeeSnapshot.joinDate &&
      comparable.exitDate === baseRunItem.employeeSnapshot.exitDate
    ) {
      return;
    }

    lastCommittedRef.current = { ...comparable };
    onEdit({
      ...baseRunItem,
      employeeSnapshot: getEmployeeSnapshotEdits(),
    });
  };

  const commitPensionEdits = () => {
    if (isReadOnly) return;
    const baseRunItem = runItemRef.current;
    const currentPension = baseRunItem.payProfileSnapshot.pension;

    // Parse the input values
    const employeeRateValue = pensionEmployeeRateInput.trim();
    const employerRateValue = pensionEmployerRateInput.trim();

    const employeeRateParsed =
      employeeRateValue.length > 0 ? parseFloat(employeeRateValue) : NaN;
    const employerRateParsed =
      employerRateValue.length > 0 ? parseFloat(employerRateValue) : NaN;

    const employeeRate = !isNaN(employeeRateParsed)
      ? employeeRateParsed / 100
      : undefined;
    const employerRate = !isNaN(employerRateParsed)
      ? employerRateParsed / 100
      : undefined;

    // Check if values have changed
    const currentEmployeeRate = currentPension?.employeeRate;
    const currentEmployerRate = currentPension?.employerRate;

    // Compare with tolerance for floating point
    const employeeRateChanged =
      (employeeRate ?? null) !== (currentEmployeeRate ?? null) &&
      (employeeRate == null ||
        currentEmployeeRate == null ||
        Math.abs(employeeRate - currentEmployeeRate) > 0.0001);
    const employerRateChanged =
      (employerRate ?? null) !== (currentEmployerRate ?? null) &&
      (employerRate == null ||
        currentEmployerRate == null ||
        Math.abs(employerRate - currentEmployerRate) > 0.0001);

    if (!employeeRateChanged && !employerRateChanged) {
      return;
    }

    // Build the new pension config
    // If both rates are cleared, remove the pension override entirely
    const newPensionConfig =
      employeeRate == null && employerRate == null
        ? undefined
        : {
            enabled: currentPension?.enabled ?? true,
            employeeRate: employeeRate ?? undefined,
            employerRate: employerRate ?? undefined,
            // Clear amounts if rates are set (they're mutually exclusive)
            employeeAmount:
              employeeRate != null ? undefined : currentPension?.employeeAmount,
            employerAmount:
              employerRate != null ? undefined : currentPension?.employerAmount,
          };

    onEdit({
      ...baseRunItem,
      payProfileSnapshot: {
        ...baseRunItem.payProfileSnapshot,
        pension: newPensionConfig,
      },
    });
  };

  const commitNhfEdits = () => {
    if (isReadOnly) return;
    const baseRunItem = runItemRef.current;
    const currentNhf = baseRunItem.payProfileSnapshot.nhf;

    const nhfValue = nhfInput.trim();
    if (nhfValue.length === 0) {
      // If cleared, remove override
      if (currentNhf == null) return;
      onEdit({
        ...baseRunItem,
        payProfileSnapshot: {
          ...baseRunItem.payProfileSnapshot,
          nhf: undefined,
        },
      });
      return;
    }

    // Check if it's a percentage (ends with %) or an amount
    const isPercentage = nhfValue.endsWith('%');
    const numericValue = isPercentage
      ? parseFloat(nhfValue.slice(0, -1))
      : parseFloat(nhfValue);

    if (isNaN(numericValue)) return;

    const newNhfConfig = isPercentage
      ? {
          enabled: currentNhf?.enabled ?? true,
          employeeRate: numericValue / 100,
          employeeAmount: undefined,
        }
      : {
          enabled: currentNhf?.enabled ?? true,
          employeeRate: undefined,
          employeeAmount: numericValue.toString(),
        };

    // Check if changed
    const currentRate = currentNhf?.employeeRate;
    const currentAmount = currentNhf?.employeeAmount;
    const newRate = newNhfConfig.employeeRate;
    const newAmount = newNhfConfig.employeeAmount;

    const rateChanged =
      (newRate ?? null) !== (currentRate ?? null) &&
      (newRate == null ||
        currentRate == null ||
        Math.abs(newRate - currentRate) > 0.0001);
    const amountChanged = (newAmount ?? null) !== (currentAmount ?? null);

    if (!rateChanged && !amountChanged) return;

    onEdit({
      ...baseRunItem,
      payProfileSnapshot: {
        ...baseRunItem.payProfileSnapshot,
        nhf: newNhfConfig,
      },
    });
  };

  const commitNhisEdits = () => {
    if (isReadOnly) return;
    const baseRunItem = runItemRef.current;
    const currentNhis = baseRunItem.payProfileSnapshot.nhis;

    const employeeRateValue = nhisEmployeeRateInput.trim();
    const employerRateValue = nhisEmployerRateInput.trim();

    const employeeRateParsed =
      employeeRateValue.length > 0 ? parseFloat(employeeRateValue) : NaN;
    const employerRateParsed =
      employerRateValue.length > 0 ? parseFloat(employerRateValue) : NaN;

    const employeeRate = !isNaN(employeeRateParsed)
      ? employeeRateParsed / 100
      : undefined;
    const employerRate = !isNaN(employerRateParsed)
      ? employerRateParsed / 100
      : undefined;

    // Check if values have changed
    const currentEmployeeRate = currentNhis?.employeeRate;
    const currentEmployerRate = currentNhis?.employerRate;

    const employeeRateChanged =
      (employeeRate ?? null) !== (currentEmployeeRate ?? null) &&
      (employeeRate == null ||
        currentEmployeeRate == null ||
        Math.abs(employeeRate - currentEmployeeRate) > 0.0001);
    const employerRateChanged =
      (employerRate ?? null) !== (currentEmployerRate ?? null) &&
      (employerRate == null ||
        currentEmployerRate == null ||
        Math.abs(employerRate - currentEmployerRate) > 0.0001);

    if (!employeeRateChanged && !employerRateChanged) {
      return;
    }

    // Build the new NHIS config
    const newNhisConfig =
      employeeRate == null && employerRate == null
        ? undefined
        : {
            enabled: currentNhis?.enabled ?? true,
            employeeRate: employeeRate ?? undefined,
            employerRate: employerRate ?? undefined,
            // Clear amounts if rates are set (they're mutually exclusive)
            employeeAmount:
              employeeRate != null ? undefined : currentNhis?.employeeAmount,
            employerAmount:
              employerRate != null ? undefined : currentNhis?.employerAmount,
          };

    onEdit({
      ...baseRunItem,
      payProfileSnapshot: {
        ...baseRunItem.payProfileSnapshot,
        nhis: newNhisConfig,
      },
    });
  };

  const clearEmailValidationTimeout = () => {
    if (emailClearTimeoutRef.current) {
      clearTimeout(emailClearTimeoutRef.current);
      emailClearTimeoutRef.current = null;
    }
  };

  const handleEmailChange = (value: string) => {
    setEmailInput(value);
    clearEmailValidationTimeout();
    const validation = validateEmailInput(value);
    if (validation.valid) {
      setEmailError(null);
      return;
    }
    if (value.trim().length > 0) {
      setEmailError('Enter a valid email or leave blank.');
    }
  };

  const handleEmailBlur = () => {
    const validation = validateEmailInput(emailInput);
    if (validation.valid) {
      setEmailError(null);
      return;
    }

    setEmailError('Enter a valid email or leave blank.');
    clearEmailValidationTimeout();
    emailClearTimeoutRef.current = setTimeout(() => {
      const currentValue = emailInput.trim();
      if (currentValue && !validateEmailInput(currentValue).valid) {
        setEmailInput(runItem.employeeSnapshot.email ?? '');
        setEmailError(null);
      }
    }, 6000);
  };

  const handleBankAccountNumberChange = (value: string) => {
    setBankAccountNumberInput(value);
    const validation = validateBankAccountNumberInput(value);
    if (validation.valid) {
      setBankAccountNumberError(null);
      return;
    }
    if (value.trim().length > 0) {
      setBankAccountNumberError('Enter 10–20 digits only.');
    }
  };

  const handleBankAccountNumberBlur = () => {
    const validation = validateBankAccountNumberInput(bankAccountNumberInput);
    if (validation.valid) {
      setBankAccountNumberError(null);
      return;
    }

    setBankAccountNumberError('Enter 10–20 digits only.');
  };

  const handleGrossBlur = () => {
    const parsedValue = parseFloat(grossInputValue) || 0;
    const roundedValue = Math.round(parsedValue * 100) / 100;
    setEditedMonthlyGross(null);

    const annualGross = roundedValue * 12;
    const baseRunItem = runItemRef.current;
    const currentComp = baseRunItem.payProfileSnapshot.compensationHistory[0];
    const currentAnnualGross = parseFloat(currentComp.annualGross);
    const newAnnualGrossRounded = Math.round(annualGross * 100) / 100;

    if (newAnnualGrossRounded !== currentAnnualGross) {
      const nextComp = {
        ...currentComp,
        id: currentComp.id ?? crypto.randomUUID(),
        annualGross: newAnnualGrossRounded.toFixed(2),
        annualBasic: undefined,
        annualHousing: undefined,
        annualTransport: undefined,
      };
      onEdit({
        ...baseRunItem,
        payProfileSnapshot: {
          ...baseRunItem.payProfileSnapshot,
          compensationHistory: [nextComp],
        },
      });
    }
    setIsEditingGross(false);
    setGrossInputValue('');
  };

  const handleGrossFocus = () => {
    setEditedMonthlyGross(monthlyGross);
    const formattedValue = monthlyGross === 0 ? '' : monthlyGross.toFixed(2);
    setGrossInputValue(formattedValue);
    setIsEditingGross(true);
    setTimeout(() => {
      grossInputRef.current?.select();
    }, 0);
  };

  useEffect(() => {
    runItemRef.current = runItem;
    // Sync pension inputs when runItem changes
    const pensionConfig = runItem.payProfileSnapshot.pension;
    setPensionEmployeeRateInput(
      pensionConfig?.employeeRate != null
        ? (pensionConfig.employeeRate * 100).toFixed(1)
        : '',
    );
    setPensionEmployerRateInput(
      pensionConfig?.employerRate != null
        ? (pensionConfig.employerRate * 100).toFixed(1)
        : '',
    );
    // Sync NHF input when runItem changes
    const nhfConfig = runItem.payProfileSnapshot.nhf;
    if (nhfConfig?.employeeRate != null) {
      setNhfInput((nhfConfig.employeeRate * 100).toFixed(1) + '%');
    } else if (nhfConfig?.employeeAmount != null) {
      setNhfInput(nhfConfig.employeeAmount);
    } else {
      setNhfInput('');
    }
    // Sync NHIS inputs when runItem changes
    const nhisConfig = runItem.payProfileSnapshot.nhis;
    setNhisEmployeeRateInput(
      nhisConfig?.employeeRate != null
        ? (nhisConfig.employeeRate * 100).toFixed(1)
        : '',
    );
    setNhisEmployerRateInput(
      nhisConfig?.employerRate != null
        ? (nhisConfig.employerRate * 100).toFixed(1)
        : '',
    );
  }, [runItem]);

  useEffect(() => {
    if (employeeUpdateTimeoutRef.current) {
      clearTimeout(employeeUpdateTimeoutRef.current);
      employeeUpdateTimeoutRef.current = null;
    }

    if (isReadOnly) return;
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }

    const comparable = getEmployeeSnapshotComparable();
    if (
      comparable.name === runItemRef.current.employeeSnapshot.fullName &&
      comparable.role === runItemRef.current.employeeSnapshot.role &&
      comparable.employeeId ===
        runItemRef.current.employeeSnapshot.employeeId &&
      comparable.department ===
        runItemRef.current.employeeSnapshot.department &&
      comparable.email === runItemRef.current.employeeSnapshot.email &&
      comparable.phoneNumber ===
        runItemRef.current.employeeSnapshot.phoneNumber &&
      comparable.taxId === runItemRef.current.employeeSnapshot.taxId &&
      comparable.pfa === runItemRef.current.employeeSnapshot.pfa &&
      comparable.rsaPin === runItemRef.current.employeeSnapshot.rsaPin &&
      comparable.bankName === runItemRef.current.employeeSnapshot.bankName &&
      comparable.bankAccountNumber ===
        runItemRef.current.employeeSnapshot.bankAccountNumber &&
      comparable.bankAccountName ===
        runItemRef.current.employeeSnapshot.bankAccountName &&
      comparable.joinDate === runItemRef.current.employeeSnapshot.joinDate &&
      comparable.exitDate === runItemRef.current.employeeSnapshot.exitDate
    ) {
      return;
    }
    if (
      lastCommittedRef.current &&
      lastCommittedRef.current.name === comparable.name &&
      lastCommittedRef.current.role === comparable.role &&
      lastCommittedRef.current.employeeId === comparable.employeeId &&
      lastCommittedRef.current.department === comparable.department &&
      lastCommittedRef.current.email === comparable.email &&
      lastCommittedRef.current.phoneNumber === comparable.phoneNumber &&
      lastCommittedRef.current.taxId === comparable.taxId &&
      lastCommittedRef.current.pfa === comparable.pfa &&
      lastCommittedRef.current.rsaPin === comparable.rsaPin &&
      lastCommittedRef.current.bankName === comparable.bankName &&
      lastCommittedRef.current.bankAccountNumber ===
        comparable.bankAccountNumber &&
      lastCommittedRef.current.bankAccountName === comparable.bankAccountName &&
      lastCommittedRef.current.joinDate === comparable.joinDate &&
      lastCommittedRef.current.exitDate === comparable.exitDate
    ) {
      return;
    }

    employeeUpdateTimeoutRef.current = setTimeout(() => {
      lastCommittedRef.current = { ...comparable };
      onEdit({
        ...runItemRef.current,
        employeeSnapshot: getEmployeeSnapshotEdits(),
      });
    }, 300);

    return () => {
      if (employeeUpdateTimeoutRef.current) {
        clearTimeout(employeeUpdateTimeoutRef.current);
        employeeUpdateTimeoutRef.current = null;
      }
    };
  }, [
    name,
    role,
    employeeIdInput,
    departmentInput,
    emailInput,
    phoneInput,
    taxIdInput,
    pfaInput,
    rsaPinInput,
    bankNameInput,
    bankAccountNumberInput,
    bankAccountNameInput,
    joinDateInput,
    exitDateInput,
    runItem,
    isReadOnly,
    onEdit,
  ]);

  useEffect(() => {
    return () => {
      clearEmailValidationTimeout();
    };
  }, []);

  useEffect(() => {
    const joinResult = validateIsoDateInput(joinDateInput);
    const exitResult = validateIsoDateInput(exitDateInput);
    const hasJoinValue = joinDateInput.trim().length > 0;
    const hasExitValue = exitDateInput.trim().length > 0;

    setJoinDateError(
      !joinResult.valid && hasJoinValue ? 'Enter a valid date.' : null,
    );

    if (!exitResult.valid && hasExitValue) {
      setExitDateError('Enter a valid date.');
      return;
    }

    if (
      joinResult.valid &&
      exitResult.valid &&
      joinResult.value &&
      exitResult.value &&
      exitResult.value < joinResult.value
    ) {
      setExitDateError('Exit date must be on or after join date.');
      return;
    }

    setExitDateError(null);
  }, [joinDateInput, exitDateInput]);

  const openHistoryEditor = (draft: HistoryDraft) => {
    setPendingCompAutoEnd(null);
    setHistoryError(null);
    setHistoryDiscardPromptOpen(false);
    setPendingDrawerClose(false);
    historyDraftSnapshotRef.current = serializeHistoryDraft(draft);
    setHistoryDraft(draft);
  };

  const updateHistoryDraft = (updates: Partial<HistoryDraft>) => {
    setHistoryDraft((prev) => (prev ? { ...prev, ...updates } : prev));
  };

  const closeHistoryEditor = () => {
    setHistoryDraft(null);
    setPendingCompAutoEnd(null);
    setHistoryError(null);
    setHistoryDiscardPromptOpen(false);
    setPendingDrawerClose(false);
    historyDraftSnapshotRef.current = null;
  };

  const buildCompHistoryDraft = ({
    startMonth,
    startYear,
    startLocked,
    startLockHint,
    autoEndNotice,
  }: {
    startMonth: string;
    startYear: string;
    startLocked?: boolean;
    startLockHint?: string;
    autoEndNotice?: string;
  }): HistoryDraft => ({
    kind: 'comp',
    mode: 'add',
    fromMonth: startMonth,
    fromYear: startYear,
    toMonth: startMonth,
    toYear: startYear,
    isOngoing: false,
    entryMode: 'monthly',
    includeBreakdown: false,
    annualGross: '',
    monthlyGross: '',
    note: '',
    basic: '',
    housing: '',
    transport: '',
    startLocked,
    startLockHint,
    autoEndNotice,
    futureStartConfirmed: false,
  });

  const handleAddCompRecord = () => {
    if (
      activeCompRecord &&
      !activeCompRecord.toMonth &&
      compAutoEndKey &&
      nextCompStartKey
    ) {
      setPendingCompAutoEnd({
        startKey: nextCompStartKey,
        endKey: compAutoEndKey,
      });
      return;
    }

    openHistoryEditor(
      buildCompHistoryDraft({
        startMonth: nextCompStartMonth,
        startYear: nextCompStartYear,
        startLocked: compStartLockedFlag,
        startLockHint: compStartLockHint,
      }),
    );
  };

  const handleSaveHistoryDraft = () => {
    if (!historyDraft || isReadOnly) return;
    const baseRunItem = runItemRef.current;
    if (historyDraft.kind === 'rent') {
      setHistoryError(null);

      const fromKey = buildMonthKey(
        historyDraft.fromMonth,
        historyDraft.fromYear,
      );
      if (!fromKey) {
        setHistoryError('Select a valid start month.');
        return;
      }

      const toKey = buildMonthKey(historyDraft.toMonth, historyDraft.toYear);
      if (!toKey) {
        setHistoryError('Select a valid end month.');
        return;
      }

      if (toKey < fromKey) {
        setHistoryError('End month must be on or after start month.');
        return;
      }

      const rentResult = MoneySchema.safeParse(
        (historyDraft.periodRent ?? '').trim(),
      );
      if (!rentResult.success) {
        setHistoryError('Enter a valid rent amount for the period.');
        return;
      }

      const overlappingRent = rentHistory.find((entry) => {
        if (historyDraft.mode === 'edit' && entry.id === historyDraft.id) {
          return false;
        }
        const entryEndKey = entry.toMonth ?? '9999-12';
        return fromKey <= entryEndKey && entry.fromMonth <= toKey;
      });

      if (overlappingRent) {
        setHistoryError(
          `Overlaps with ${formatPeriodLabel(
            overlappingRent.fromMonth,
            overlappingRent.toMonth,
          )}.`,
        );
        return;
      }

      const existingRecord =
        historyDraft.mode === 'edit' && historyDraft.id
          ? rentHistory.find((entry) => entry.id === historyDraft.id)
          : undefined;
      const nextRecord = {
        ...existingRecord,
        id: existingRecord?.id ?? crypto.randomUUID(),
        fromMonth: fromKey,
        toMonth: toKey,
        rent: rentResult.data,
        address: normalizeOptional(historyDraft.address ?? ''),
      };

      const nextHistory =
        historyDraft.mode === 'add'
          ? [...rentHistory, nextRecord]
          : rentHistory.map((entry) =>
              entry.id === nextRecord.id ? nextRecord : entry,
            );

      const sortedHistory = [...nextHistory].sort((a, b) =>
        b.fromMonth.localeCompare(a.fromMonth),
      );

      onEdit({
        ...baseRunItem,
        payProfileSnapshot: {
          ...baseRunItem.payProfileSnapshot,
          rentHistory: sortedHistory,
        },
      });

      closeHistoryEditor();
      return;
    }

    setHistoryError(null);

    const fromKey = buildMonthKey(
      historyDraft.fromMonth,
      historyDraft.fromYear,
    );
    if (!fromKey) {
      setHistoryError('Select a valid start month.');
      return;
    }

    let toKey: string | undefined;
    if (!historyDraft.isOngoing) {
      toKey = buildMonthKey(historyDraft.toMonth, historyDraft.toYear);
      if (!toKey) {
        setHistoryError('Select a valid end month or mark as ongoing.');
        return;
      }
    }

    if (toKey && toKey < fromKey) {
      setHistoryError('End month must be on or after start month.');
      return;
    }

    const entryMode = historyDraft.entryMode ?? 'monthly';
    const grossInput =
      entryMode === 'monthly'
        ? historyDraft.monthlyGross
        : historyDraft.annualGross;
    const grossResult = MoneySchema.safeParse((grossInput ?? '').trim());
    if (!grossResult.success) {
      setHistoryError(
        `Enter a valid ${entryMode === 'monthly' ? 'monthly' : 'annual'} gross amount.`,
      );
      return;
    }

    const grossValue = parseFloat(grossResult.data);
    const annualGrossValue =
      entryMode === 'monthly' ? grossValue * 12 : grossValue;

    let annualBasic: string | undefined;
    let annualHousing: string | undefined;
    let annualTransport: string | undefined;

    if (historyDraft.includeBreakdown) {
      const basicResult = MoneySchema.safeParse(
        (historyDraft.basic ?? '').trim(),
      );
      const housingResult = MoneySchema.safeParse(
        (historyDraft.housing ?? '').trim(),
      );
      const transportResult = MoneySchema.safeParse(
        (historyDraft.transport ?? '').trim(),
      );

      if (
        !basicResult.success ||
        !housingResult.success ||
        !transportResult.success
      ) {
        setHistoryError(
          'Enter valid Basic, Housing, and Transport amounts or disable BHT breakdown.',
        );
        return;
      }

      const multiplier = entryMode === 'monthly' ? 12 : 1;
      annualBasic = (parseFloat(basicResult.data) * multiplier).toFixed(2);
      annualHousing = (parseFloat(housingResult.data) * multiplier).toFixed(2);
      annualTransport = (parseFloat(transportResult.data) * multiplier).toFixed(
        2,
      );
    }

    const draftEndKey = toKey ?? '9999-12';
    const autoEndKey = activeCompRecord?.toMonth
      ? undefined
      : getPreviousMonthKey(fromKey);

    const overlappingRecord = compensationHistory.find((entry) => {
      if (historyDraft.mode === 'edit' && entry.id === historyDraft.id) {
        return false;
      }
      const entryEndKey =
        entry.id === activeCompRecord?.id && historyDraft.mode === 'add'
          ? (autoEndKey ?? entry.toMonth ?? '9999-12')
          : (entry.toMonth ?? '9999-12');
      return fromKey <= entryEndKey && entry.fromMonth <= draftEndKey;
    });

    if (overlappingRecord) {
      setHistoryError(
        `Overlaps with ${formatPeriodLabel(
          overlappingRecord.fromMonth,
          overlappingRecord.toMonth,
        )}.`,
      );
      return;
    }

    const existingRecord =
      historyDraft.mode === 'edit' && historyDraft.id
        ? compensationHistory.find((entry) => entry.id === historyDraft.id)
        : undefined;
    const nextRecord = {
      ...existingRecord,
      id: existingRecord?.id ?? crypto.randomUUID(),
      fromMonth: fromKey,
      toMonth: historyDraft.isOngoing ? undefined : toKey,
      annualGross: annualGrossValue.toFixed(2),
      annualBasic,
      annualHousing,
      annualTransport,
      note: normalizeOptional(historyDraft.note ?? ''),
    };

    let nextHistory =
      historyDraft.mode === 'add'
        ? [...compensationHistory, nextRecord]
        : compensationHistory.map((entry) =>
            entry.id === nextRecord.id ? nextRecord : entry,
          );

    if (
      historyDraft.mode === 'add' &&
      activeCompRecord &&
      !activeCompRecord.toMonth &&
      autoEndKey &&
      autoEndKey >= activeCompRecord.fromMonth
    ) {
      nextHistory = nextHistory.map((entry) =>
        entry.id === activeCompRecord.id
          ? { ...entry, toMonth: autoEndKey }
          : entry,
      );
    }

    nextHistory = [...nextHistory].sort((a, b) =>
      b.fromMonth.localeCompare(a.fromMonth),
    );

    onEdit({
      ...baseRunItem,
      payProfileSnapshot: {
        ...baseRunItem.payProfileSnapshot,
        compensationHistory: nextHistory,
      },
    });

    closeHistoryEditor();
  };

  const isHistoryDraftDirty = Boolean(
    historyDraft &&
      historyDraftSnapshotRef.current &&
      serializeHistoryDraft(historyDraft) !== historyDraftSnapshotRef.current,
  );

  const requestCloseHistoryEditor = () => {
    if (isHistoryDraftDirty) {
      setHistoryDiscardPromptOpen(true);
      setPendingDrawerClose(false);
      return;
    }
    closeHistoryEditor();
  };

  const handleDetailsDrawerOpenChange = (open: boolean) => {
    if (open) {
      setDetailsDrawerOpen(true);
      return;
    }
    if (historyDraft && isHistoryDraftDirty) {
      setHistoryDiscardPromptOpen(true);
      setPendingDrawerClose(true);
      return;
    }
    setDetailsDrawerOpen(false);
  };

  const handleDiscardHistoryChanges = () => {
    closeHistoryEditor();
    if (pendingDrawerClose) {
      setDetailsDrawerOpen(false);
    }
  };

  const openRecurringEditor = (draft: RecurringDraft) => {
    setRecurringDraft(draft);
    setRecurringErrors({});
  };

  const updateRecurringDraft = (updates: Partial<RecurringDraft>) => {
    setRecurringDraft((prev) => (prev ? { ...prev, ...updates } : prev));
  };

  const closeRecurringEditor = () => {
    setRecurringDraft(null);
    setRecurringErrors({});
  };

  const getRecurringOverlapWarning = (draft: RecurringDraft) => {
    const name = draft.name.trim().toLowerCase();
    if (!name) return null;
    const fromKey = buildMonthKey(draft.fromMonth, draft.fromYear);
    if (!fromKey) return null;
    const toKey = draft.isOngoing
      ? undefined
      : buildMonthKey(draft.toMonth, draft.toYear);
    if (!draft.isOngoing && !toKey) return null;

    const draftEnd = toKey ?? '9999-12';

    for (const item of recurringDeductions) {
      if (draft.id && item.id === draft.id) continue;
      if (item.name.trim().toLowerCase() !== name) continue;
      const itemEnd = item.toMonth ?? '9999-12';
      if (fromKey <= itemEnd && item.fromMonth <= draftEnd) {
        return `Overlaps with ${item.name} (${formatPeriodLabel(
          item.fromMonth,
          item.toMonth,
        )}). Overlaps are allowed but will double-charge in overlapping months.`;
      }
    }

    return null;
  };

  const handleSaveRecurringDraft = () => {
    if (!recurringDraft || isReadOnly) return;
    const baseRunItem = runItemRef.current;

    const errors: RecurringDraftErrors = {};
    const nameValue = recurringDraft.name.trim();
    if (!nameValue) {
      errors.name = 'Enter a description for the deduction.';
    }

    const amountValue = recurringDraft.amount.trim();
    const amountResult = MoneySchema.safeParse(amountValue);
    const amountParsed = amountResult.success ? amountResult.data : undefined;
    if (!amountResult.success) {
      errors.amount = 'Use digits only (e.g., 25000 or 25000.50).';
    }

    const fromKey = buildMonthKey(
      recurringDraft.fromMonth,
      recurringDraft.fromYear,
    );
    if (!fromKey) {
      errors.from = 'Select a start month.';
    }

    let toKey: string | undefined;
    if (recurringDraft.isOngoing) {
      toKey = undefined;
    } else {
      toKey = buildMonthKey(recurringDraft.toMonth, recurringDraft.toYear);
      if (!toKey) {
        errors.to = 'Select an end month or mark as ongoing.';
      } else if (fromKey && toKey < fromKey) {
        errors.to = 'End month must be on or after start.';
      }
    }

    if (!isValidRecurringTaxTreatment(recurringDraft.taxTreatment)) {
      errors.taxTreatment = 'Select a tax treatment.';
    }

    if (Object.keys(errors).length > 0) {
      setRecurringErrors(errors);
      return;
    }

    const nextItem: RecurringDeduction = {
      id: recurringDraft.id ?? crypto.randomUUID(),
      name: nameValue,
      amount: amountParsed!,
      taxTreatment: recurringDraft.taxTreatment,
      fromMonth: fromKey!,
      toMonth: toKey,
    };

    const nextRecurring =
      recurringDraft.mode === 'add'
        ? [...recurringDeductions, nextItem]
        : recurringDeductions.map((item) =>
            item.id === recurringDraft.id ? nextItem : item,
          );

    onEdit({
      ...baseRunItem,
      payProfileSnapshot: {
        ...baseRunItem.payProfileSnapshot,
        recurringDeductions: nextRecurring,
      },
    });

    closeRecurringEditor();
  };

  const handleRemoveRecurringDeduction = (id: string) => {
    if (isReadOnly) return;
    const baseRunItem = runItemRef.current;
    const nextRecurring = recurringDeductions.filter((item) => item.id !== id);
    onEdit({
      ...baseRunItem,
      payProfileSnapshot: {
        ...baseRunItem.payProfileSnapshot,
        recurringDeductions:
          nextRecurring.length > 0 ? nextRecurring : undefined,
      },
    });
  };

  const buildNextOneOffEdits = (
    overrides: Partial<NonNullable<PayrollRunItem['edits']>>,
  ) => {
    const nextEdits = {
      ...(runItemRef.current.edits ?? {}),
      ...overrides,
    };

    const normalized = {
      oneOffAllowances:
        nextEdits.oneOffAllowances && nextEdits.oneOffAllowances.length > 0
          ? nextEdits.oneOffAllowances
          : undefined,
      oneOffDeductions:
        nextEdits.oneOffDeductions && nextEdits.oneOffDeductions.length > 0
          ? nextEdits.oneOffDeductions
          : undefined,
      oneOffEmployerContributions:
        nextEdits.oneOffEmployerContributions &&
        nextEdits.oneOffEmployerContributions.length > 0
          ? nextEdits.oneOffEmployerContributions
          : undefined,
    };

    if (
      !normalized.oneOffAllowances &&
      !normalized.oneOffDeductions &&
      !normalized.oneOffEmployerContributions
    ) {
      return undefined;
    }

    return normalized;
  };

  const openOneOffEditor = (draft: OneOffDraft) => {
    setOneOffDraft(draft);
    setOneOffErrors({});
  };

  const updateOneOffDraft = (updates: Partial<OneOffDraft>) => {
    setOneOffDraft((prev) => (prev ? { ...prev, ...updates } : prev));
  };

  const closeOneOffEditor = () => {
    setOneOffDraft(null);
    setOneOffErrors({});
  };

  const handleSaveOneOffDraft = () => {
    if (!oneOffDraft || isReadOnly) return;
    const baseRunItem = runItemRef.current;

    const errors: OneOffDraftErrors = {};
    const nameValue = oneOffDraft.name.trim();
    if (!nameValue) {
      errors.name = 'Enter a name.';
    }

    const amountValue = oneOffDraft.amount.trim();
    const amountResult = MoneySchema.safeParse(amountValue);
    const amountParsed = amountResult.success ? amountResult.data : undefined;
    if (!amountResult.success) {
      errors.amount = 'Use digits only (e.g., 25000 or 25000.50).';
    }

    if (oneOffDraft.kind === 'allowance') {
      if (!isValidAllowanceTaxTreatment(oneOffDraft.taxTreatment)) {
        errors.taxTreatment = 'Select a tax treatment.';
      }
    }

    if (oneOffDraft.kind === 'deduction') {
      if (!isValidDeductionTaxTreatment(oneOffDraft.taxTreatment)) {
        errors.taxTreatment = 'Select a tax treatment.';
      }
    }

    if (oneOffDraft.kind === 'employer') {
      if (!oneOffDraft.employerType) {
        errors.employerType = 'Select a contribution type.';
      }
    }

    if (Object.keys(errors).length > 0) {
      setOneOffErrors(errors);
      return;
    }

    if (oneOffDraft.kind === 'allowance') {
      const nextItem: OneOffAllowance = {
        id: oneOffDraft.id ?? crypto.randomUUID(),
        name: nameValue,
        amount: amountParsed!,
        taxTreatment: oneOffDraft.taxTreatment,
      };

      const nextAllowances =
        oneOffDraft.mode === 'add'
          ? [...oneOffAllowances, nextItem]
          : oneOffAllowances.map((item) =>
              item.id === oneOffDraft.id ? nextItem : item,
            );

      onEdit({
        ...baseRunItem,
        edits: buildNextOneOffEdits({ oneOffAllowances: nextAllowances }),
      });
    }

    if (oneOffDraft.kind === 'deduction') {
      const nextItem: OneOffDeduction = {
        id: oneOffDraft.id ?? crypto.randomUUID(),
        name: nameValue,
        amount: amountParsed!,
        taxTreatment: oneOffDraft.taxTreatment,
      };

      const nextDeductions =
        oneOffDraft.mode === 'add'
          ? [...oneOffDeductions, nextItem]
          : oneOffDeductions.map((item) =>
              item.id === oneOffDraft.id ? nextItem : item,
            );

      onEdit({
        ...baseRunItem,
        edits: buildNextOneOffEdits({ oneOffDeductions: nextDeductions }),
      });
    }

    if (oneOffDraft.kind === 'employer') {
      const nextItem: OneOffEmployerContribution = {
        id: oneOffDraft.id ?? crypto.randomUUID(),
        name: nameValue,
        amount: amountParsed!,
        type: oneOffDraft.employerType ?? 'other',
      };

      const nextEmployer =
        oneOffDraft.mode === 'add'
          ? [...oneOffEmployerContributions, nextItem]
          : oneOffEmployerContributions.map((item) =>
              item.id === oneOffDraft.id ? nextItem : item,
            );

      onEdit({
        ...baseRunItem,
        edits: buildNextOneOffEdits({
          oneOffEmployerContributions: nextEmployer,
        }),
      });
    }

    closeOneOffEditor();
  };

  const handleRemoveOneOff = (kind: OneOffKind, id: string) => {
    if (isReadOnly) return;
    const baseRunItem = runItemRef.current;
    if (kind === 'allowance') {
      const nextAllowances = oneOffAllowances.filter((item) => item.id !== id);
      onEdit({
        ...baseRunItem,
        edits: buildNextOneOffEdits({ oneOffAllowances: nextAllowances }),
      });
      return;
    }
    if (kind === 'deduction') {
      const nextDeductions = oneOffDeductions.filter((item) => item.id !== id);
      onEdit({
        ...baseRunItem,
        edits: buildNextOneOffEdits({ oneOffDeductions: nextDeductions }),
      });
      return;
    }

    const nextEmployer = oneOffEmployerContributions.filter(
      (item) => item.id !== id,
    );
    onEdit({
      ...baseRunItem,
      edits: buildNextOneOffEdits({
        oneOffEmployerContributions: nextEmployer,
      }),
    });
  };

  const handleStateChange = (value: string) => {
    const nextState =
      value === 'default'
        ? undefined
        : NIGERIAN_STATES.includes(value as StateValue)
          ? (value as StateValue)
          : undefined;
    setEmployeeState(nextState);
    if (isReadOnly) return;

    onEdit({
      ...runItemRef.current,
      employeeSnapshot: getEmployeeSnapshotEdits({ state: nextState }),
      payProfileSnapshot: {
        ...runItemRef.current.payProfileSnapshot,
        state: nextState,
      },
    });
  };

  const editorTitle = historyDraft
    ? `${historyDraft.mode === 'add' ? 'Add' : 'Edit'} ${
        historyDraft.kind === 'comp' ? 'compensation' : 'rent'
      } record`
    : 'Edit record';

  const renderRecurringEditor = () => {
    if (!recurringDraft) return null;
    const overlapWarning = getRecurringOverlapWarning(recurringDraft);

    return (
      <div className="bg-muted/50 space-y-4 rounded-lg border p-3">
        <div>
          <p className="text-sm font-semibold">
            {recurringDraft.mode === 'add'
              ? 'Add recurring deduction'
              : 'Edit recurring deduction'}
          </p>
          <p className="text-muted-foreground text-xs">
            Saved items apply to payroll runs within the selected period.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label className="text-muted-foreground text-xs">
              Deduction name
            </label>
            <Input
              value={recurringDraft.name}
              onChange={(event) =>
                updateRecurringDraft({ name: event.target.value })
              }
              placeholder="Staff loan repayment"
              className="h-7.5"
            />
            {recurringErrors.name && (
              <p className="text-destructive mt-1 text-[11px]">
                {recurringErrors.name}
              </p>
            )}
          </div>
          <div>
            <label className="text-muted-foreground text-xs">
              Monthly amount
            </label>
            <Input
              value={recurringDraft.amount}
              onChange={(event) =>
                updateRecurringDraft({ amount: event.target.value })
              }
              placeholder="25000"
              inputMode="decimal"
              className="h-7.5"
            />
            {recurringErrors.amount && (
              <p className="text-destructive mt-1 text-[11px]">
                {recurringErrors.amount}
              </p>
            )}
          </div>
          <div className="min-w-0 sm:col-span-2">
            <label className="text-muted-foreground text-xs">
              Tax treatment
            </label>
            <SimpleSelect
              value={recurringDraft.taxTreatment}
              onChange={(value) =>
                updateRecurringDraft({
                  taxTreatment: value as RecurringTaxTreatment,
                })
              }
              options={RECURRING_TAX_OPTIONS}
              placeholder="Standard (net pay only)"
              contentClassName="w-[var(--radix-select-trigger-width)]"
              className="mt-1 h-7.5! w-full"
            />
            <p className="text-muted-foreground mt-1 text-[11px]">
              Standard deductions reduce net pay only.
              <br /> Allowable types reduce PAYE taxable income.
            </p>
            {recurringErrors.taxTreatment && (
              <p className="text-destructive mt-1 text-[11px]">
                {recurringErrors.taxTreatment}
              </p>
            )}
          </div>
          <div className="min-w-0 space-y-2">
            <label className="text-muted-foreground text-xs">Start</label>
            <div className="grid grid-cols-[1fr_90px] gap-2">
              <SimpleSelect
                value={recurringDraft.fromMonth}
                onChange={(value) =>
                  updateRecurringDraft({
                    fromMonth: value,
                    toMonth: recurringDraft.isOngoing
                      ? recurringDraft.toMonth
                      : recurringDraft.toMonth || value,
                  })
                }
                options={MONTH_OPTIONS}
                placeholder="Month"
                className="h-7.5! w-full text-xs"
              />
              <SimpleSelect
                value={recurringDraft.fromYear}
                onChange={(value) =>
                  updateRecurringDraft({
                    fromYear: value,
                    toYear: recurringDraft.isOngoing
                      ? recurringDraft.toYear
                      : recurringDraft.toYear || value,
                  })
                }
                options={yearOptions}
                placeholder="Year"
                className="h-7.5! text-xs"
              />
            </div>
            {recurringErrors.from && (
              <p className="text-destructive text-[11px]">
                {recurringErrors.from}
              </p>
            )}
          </div>
          <div className="min-w-0 space-y-2">
            <label className="text-muted-foreground text-xs">End</label>
            <div className="grid grid-cols-[1fr_90px] gap-2">
              <SimpleSelect
                value={recurringDraft.toMonth ?? ''}
                onChange={(value) =>
                  updateRecurringDraft({ toMonth: value, isOngoing: false })
                }
                options={MONTH_OPTIONS}
                placeholder="Month"
                className="h-7.5! w-full text-xs"
                disabled={recurringDraft.isOngoing ?? false}
              />
              <SimpleSelect
                value={recurringDraft.toYear ?? ''}
                onChange={(value) =>
                  updateRecurringDraft({ toYear: value, isOngoing: false })
                }
                options={yearOptions}
                placeholder="Year"
                className="h-7.5! text-xs"
                disabled={recurringDraft.isOngoing ?? false}
              />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Checkbox
                checked={recurringDraft.isOngoing ?? false}
                onCheckedChange={(checked) => {
                  const isOngoing = Boolean(checked);
                  updateRecurringDraft({
                    isOngoing,
                    toMonth: isOngoing
                      ? recurringDraft.toMonth
                      : recurringDraft.toMonth || recurringDraft.fromMonth,
                    toYear: isOngoing
                      ? recurringDraft.toYear
                      : recurringDraft.toYear || recurringDraft.fromYear,
                  });
                }}
              />
              <span className="text-muted-foreground text-xs">
                Ongoing (no end date)
              </span>
            </div>
            {recurringErrors.to && (
              <p className="text-destructive text-[11px]">
                {recurringErrors.to}
              </p>
            )}
          </div>
        </div>

        {overlapWarning && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-300">
            {overlapWarning}
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            size="sm"
            variant="outline"
            type="button"
            onClick={closeRecurringEditor}
          >
            Cancel
          </Button>
          <Button size="sm" type="button" onClick={handleSaveRecurringDraft}>
            Save item
          </Button>
        </div>
      </div>
    );
  };

  const renderOneOffEditor = () => {
    if (!oneOffDraft) return null;
    const kind = oneOffDraft.kind;

    return (
      <div className="bg-muted/30 space-y-4 rounded-lg border p-3">
        <div>
          <p className="text-sm font-semibold">
            {oneOffDraft.mode === 'add' ? 'Add one-off' : 'Edit one-off'}
          </p>
          <p className="text-muted-foreground text-xs">
            Applies to this payroll run only.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="min-w-0">
            <label className="text-muted-foreground text-xs">Type</label>
            <SimpleSelect
              value={kind}
              onChange={(value) => {
                const nextKind = value as OneOffKind;
                updateOneOffDraft({
                  kind: nextKind,
                  taxTreatment: getDefaultOneOffTaxTreatment(nextKind),
                  employerType:
                    nextKind === 'employer'
                      ? (oneOffDraft.employerType ?? 'pension')
                      : undefined,
                });
              }}
              options={ONE_OFF_KIND_OPTIONS}
              placeholder="Select type"
              className="h-7.5! w-full"
            />
          </div>
          <div>
            <label className="text-muted-foreground text-xs">Amount</label>
            <Input
              value={oneOffDraft.amount}
              onChange={(event) =>
                updateOneOffDraft({ amount: event.target.value })
              }
              placeholder="25000"
              inputMode="decimal"
              className="h-7.5!"
            />
            {oneOffErrors.amount && (
              <p className="text-destructive mt-1 text-[11px]">
                {oneOffErrors.amount}
              </p>
            )}
          </div>
          <div className="sm:col-span-2">
            <label className="text-muted-foreground text-xs">Name</label>
            <Input
              value={oneOffDraft.name}
              onChange={(event) =>
                updateOneOffDraft({ name: event.target.value })
              }
              placeholder="Performance bonus"
              className="h-7.5!"
            />
            {oneOffErrors.name && (
              <p className="text-destructive mt-1 text-[11px]">
                {oneOffErrors.name}
              </p>
            )}
          </div>

          {kind !== 'employer' && (
            <div className="min-w-0 sm:col-span-2">
              <label className="text-muted-foreground text-xs">
                Tax treatment
              </label>
              <SimpleSelect
                value={oneOffDraft.taxTreatment ?? ''}
                onChange={(value) =>
                  updateOneOffDraft({
                    taxTreatment: value as OneOffTaxTreatment,
                  })
                }
                options={
                  kind === 'allowance'
                    ? ONE_OFF_ALLOWANCE_TAX_OPTIONS
                    : RECURRING_TAX_OPTIONS
                }
                placeholder="Select treatment"
                contentClassName="w-[var(--radix-select-trigger-width)]"
                className="h-7.5! w-full"
              />
              <p className="text-muted-foreground mt-1 text-[11px]">
                {kind === 'allowance'
                  ? 'Exempt types reduce taxable income; taxable adds to PAYE.'
                  : 'Allowable types reduce PAYE; standard affects net pay only.'}
              </p>
              {oneOffErrors.taxTreatment && (
                <p className="text-destructive mt-1 text-[11px]">
                  {oneOffErrors.taxTreatment}
                </p>
              )}
            </div>
          )}

          {kind === 'employer' && (
            <div className="min-w-0 sm:col-span-2">
              <label className="text-muted-foreground text-xs">
                Contribution type
              </label>
              <SimpleSelect
                value={oneOffDraft.employerType ?? ''}
                onChange={(value) =>
                  updateOneOffDraft({
                    employerType: value as EmployerContributionType,
                  })
                }
                options={EMPLOYER_CONTRIBUTION_OPTIONS}
                placeholder="Select type"
                className="h-7.5! w-full"
              />
              {oneOffErrors.employerType && (
                <p className="text-destructive mt-1 text-[11px]">
                  {oneOffErrors.employerType}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={closeOneOffEditor}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleSaveOneOffDraft} size="sm">
            Save one-off
          </Button>
        </div>
      </div>
    );
  };

  const renderHistoryEditor = (kind: HistoryKind) => {
    if (!historyDraft || historyDraft.kind !== kind) return null;
    const entryMode = historyDraft.entryMode ?? 'monthly';
    const isComp = kind === 'comp';
    const draftStartKey = buildMonthKey(
      historyDraft.fromMonth,
      historyDraft.fromYear,
    );
    const runPeriodKey = currentMonthKey ?? runStartKey;
    const runPeriodLabel = runPeriodKey
      ? formatMonthKeyLabel(runPeriodKey)
      : 'current run';
    const needsFutureStartConfirmFlag = needsFutureStartConfirm(
      draftStartKey,
      runPeriodKey,
      historyDraft.futureStartConfirmed,
    );
    const startLocked = Boolean(
      historyDraft.startLocked ||
        (historyDraft.mode === 'edit' &&
          currentMonthKey &&
          draftStartKey &&
          draftStartKey < currentMonthKey),
    );
    const startLockHint =
      historyDraft.startLockHint ??
      (startLocked
        ? 'Start month is locked for records already used in prior runs.'
        : undefined);
    const isOngoing = isComp ? Boolean(historyDraft.isOngoing) : false;
    const otherAllowanceAmount = (() => {
      const grossInput =
        entryMode === 'monthly'
          ? historyDraft.monthlyGross
          : historyDraft.annualGross;
      const grossValue = parseDraftMoneyValue(grossInput);
      if (!grossValue.isValid || grossValue.value == null) return null;
      const basicValue = parseDraftMoneyValue(historyDraft.basic);
      const housingValue = parseDraftMoneyValue(historyDraft.housing);
      const transportValue = parseDraftMoneyValue(historyDraft.transport);
      if (
        !basicValue.isValid ||
        !housingValue.isValid ||
        !transportValue.isValid
      ) {
        return null;
      }
      const used =
        (basicValue.value ?? 0) +
        (housingValue.value ?? 0) +
        (transportValue.value ?? 0);
      return grossValue.value - used;
    })();
    const otherAllowancePlaceholder =
      entryMode === 'monthly'
        ? bhtPlaceholderValues.otherMonthly
        : bhtPlaceholderValues.otherAnnual;
    const otherAllowanceDisplay =
      otherAllowanceAmount == null
        ? ''
        : ngnMoneyFormatter(
            otherAllowanceAmount,
            Math.abs(otherAllowanceAmount % 1) > 0 ? 2 : 0,
          );
    const rentEndKey = buildMonthKey(historyDraft.toMonth, historyDraft.toYear);
    const rentMonthlyEstimate = (() => {
      if (isComp) return null;
      const rentResult = parseDraftMoneyValue(historyDraft.periodRent);
      if (!rentResult.isValid || rentResult.value == null) return null;
      const monthsInPeriod = getMonthsInPeriod(draftStartKey, rentEndKey);
      if (!monthsInPeriod) return null;
      return rentResult.value / monthsInPeriod;
    })();
    const rentMonthlyEstimateLabel =
      rentMonthlyEstimate == null
        ? ''
        : ngnMoneyFormatter(
            rentMonthlyEstimate,
            Math.abs(rentMonthlyEstimate % 1) > 0 ? 2 : 0,
          );

    return (
      <div className="bg-muted/30 space-y-4 rounded-lg border p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">{editorTitle}</p>
            <p className="text-muted-foreground text-xs">
              Changes update this employee's {isComp ? 'compensation' : 'rent'}{' '}
              history.
            </p>
          </div>
          {isComp && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground text-xs">Entry mode</span>
              <div className="flex items-center gap-1 overflow-hidden rounded-md border p-0.5">
                <div
                  className={cn(
                    'rounded px-2 text-[11px]',
                    entryMode === 'monthly' &&
                      'bg-primary text-primary-foreground hover:bg-primary/90',
                  )}
                  onClick={() => updateHistoryDraft({ entryMode: 'monthly' })}
                >
                  Monthly
                </div>
                <div
                  className={cn(
                    'rounded px-2 text-[11px]',
                    entryMode === 'annual' &&
                      'bg-primary text-primary-foreground hover:bg-primary/90',
                  )}
                  onClick={() => updateHistoryDraft({ entryMode: 'annual' })}
                >
                  Annual
                </div>
              </div>
            </div>
          )}
        </div>
        {historyDraft.autoEndNotice && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
            {historyDraft.autoEndNotice}
          </div>
        )}
        {historyError && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-200">
            {historyError}
          </div>
        )}
        {needsFutureStartConfirmFlag && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
            <div className="space-y-1">
              <p className="text-xs font-semibold">
                Start month is after {runPeriodLabel}.
              </p>
              <p>
                This record will not apply to the current run. Do you want to
                continue?
              </p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() =>
                  updateHistoryDraft({
                    fromMonth: currentMonth,
                    fromYear: currentYear,
                    toMonth: isOngoing ? historyDraft.toMonth : currentMonth,
                    toYear: isOngoing ? historyDraft.toYear : currentYear,
                    futureStartConfirmed: false,
                  })
                }
              >
                Use {runPeriodLabel}
              </Button>
              <Button
                size="sm"
                type="button"
                onClick={() =>
                  updateHistoryDraft({ futureStartConfirmed: true })
                }
              >
                Yes, continue
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="min-w-0 space-y-2" title={startLockHint}>
              <label className="text-muted-foreground text-xs">Start</label>

              <div className="grid grid-cols-[1fr_90px] gap-2">
                <SimpleSelect
                  value={historyDraft.fromMonth}
                  onChange={(value) =>
                    updateHistoryDraft({
                      fromMonth: value,
                      toMonth: isOngoing
                        ? historyDraft.toMonth
                        : historyDraft.toMonth || value,
                      futureStartConfirmed: false,
                    })
                  }
                  options={MONTH_OPTIONS}
                  placeholder="Month"
                  className="h-7.5! w-full text-xs"
                  disabled={startLocked}
                />
                <SimpleSelect
                  value={historyDraft.fromYear}
                  onChange={(value) =>
                    updateHistoryDraft({
                      fromYear: value,
                      toYear: isOngoing
                        ? historyDraft.toYear
                        : historyDraft.toYear || value,
                      futureStartConfirmed: false,
                    })
                  }
                  options={yearOptions}
                  placeholder="Year"
                  className="h-7.5! w-full text-xs"
                  disabled={startLocked}
                />
              </div>
              {startLockHint && (
                <p className="text-muted-foreground text-[11px]">
                  {startLockHint}
                </p>
              )}
            </div>
            <div className="min-w-0 space-y-2">
              <label className="text-muted-foreground text-xs">End</label>

              <div className="grid grid-cols-[1fr_90px] gap-2">
                <SimpleSelect
                  value={historyDraft.toMonth ?? ''}
                  onChange={(value) =>
                    updateHistoryDraft({ toMonth: value, isOngoing: false })
                  }
                  options={MONTH_OPTIONS}
                  placeholder="Month"
                  className="h-7.5! w-full text-xs"
                  disabled={isOngoing}
                />
                <SimpleSelect
                  value={historyDraft.toYear ?? ''}
                  onChange={(value) =>
                    updateHistoryDraft({ toYear: value, isOngoing: false })
                  }
                  options={yearOptions}
                  placeholder="Year"
                  className="h-7.5! w-full text-xs"
                  disabled={isOngoing}
                />
              </div>
              {isComp && (
                <div className="mt-2 flex items-center gap-2">
                  <Checkbox
                    checked={historyDraft.isOngoing ?? false}
                    onCheckedChange={(checked) => {
                      const isOngoingChecked = Boolean(checked);
                      updateHistoryDraft({
                        isOngoing: isOngoingChecked,
                        toMonth: isOngoingChecked
                          ? historyDraft.toMonth
                          : historyDraft.toMonth || historyDraft.fromMonth,
                        toYear: isOngoingChecked
                          ? historyDraft.toYear
                          : historyDraft.toYear || historyDraft.fromYear,
                      });
                    }}
                  />
                  <span className="text-muted-foreground text-xs">
                    Ongoing (no end date)
                  </span>
                </div>
              )}
            </div>
          </div>

          {isComp ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-muted-foreground text-xs">
                    Monthly gross
                  </label>
                  <MoneyInput
                    value={historyDraft.monthlyGross ?? ''}
                    onValueChange={(value) =>
                      updateHistoryDraft({ monthlyGross: value })
                    }
                    placeholder={bhtPlaceholderValues.grossMonthly}
                    className="h-7.5!"
                    disabled={entryMode !== 'monthly'}
                  />
                </div>
                <div>
                  <label className="text-muted-foreground text-xs">
                    Annual gross
                  </label>
                  <MoneyInput
                    value={historyDraft.annualGross ?? ''}
                    onValueChange={(value) =>
                      updateHistoryDraft({ annualGross: value })
                    }
                    placeholder={bhtPlaceholderValues.grossAnnual}
                    className="h-7.5!"
                    disabled={entryMode !== 'annual'}
                  />
                </div>
              </div>
              <div>
                <label className="text-muted-foreground text-xs">Note</label>
                <Input
                  value={historyDraft.note ?? ''}
                  onChange={(e) => updateHistoryDraft({ note: e.target.value })}
                  placeholder="Promotion to Senior Analyst"
                  className="h-7.5!"
                />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={historyDraft.includeBreakdown ?? false}
                  onCheckedChange={(checked) =>
                    updateHistoryDraft({ includeBreakdown: Boolean(checked) })
                  }
                />
                <span className="text-muted-foreground text-xs">
                  Add BHT breakdown (optional)
                </span>
              </div>
              {historyDraft.includeBreakdown && (
                <div className="space-y-2">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className="text-muted-foreground text-xs">
                        {entryMode === 'monthly' ? 'Monthly' : 'Annual'} basic
                      </label>
                      <MoneyInput
                        value={historyDraft.basic ?? ''}
                        onValueChange={(value) =>
                          updateHistoryDraft({ basic: value })
                        }
                        placeholder={
                          entryMode === 'monthly'
                            ? bhtPlaceholderValues.basicMonthly
                            : bhtPlaceholderValues.basicAnnual
                        }
                        className="h-7.5!"
                      />
                    </div>
                    <div>
                      <label className="text-muted-foreground text-xs">
                        {entryMode === 'monthly' ? 'Monthly' : 'Annual'} housing
                      </label>
                      <MoneyInput
                        value={historyDraft.housing ?? ''}
                        onValueChange={(value) =>
                          updateHistoryDraft({ housing: value })
                        }
                        placeholder={
                          entryMode === 'monthly'
                            ? bhtPlaceholderValues.housingMonthly
                            : bhtPlaceholderValues.housingAnnual
                        }
                        className="h-7.5!"
                      />
                    </div>
                    <div>
                      <label className="text-muted-foreground text-xs">
                        {entryMode === 'monthly' ? 'Monthly' : 'Annual'}{' '}
                        transport
                      </label>
                      <MoneyInput
                        value={historyDraft.transport ?? ''}
                        onValueChange={(value) =>
                          updateHistoryDraft({ transport: value })
                        }
                        placeholder={
                          entryMode === 'monthly'
                            ? bhtPlaceholderValues.transportMonthly
                            : bhtPlaceholderValues.transportAnnual
                        }
                        className="h-7.5!"
                      />
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-muted-foreground text-xs">
                        {entryMode === 'monthly' ? 'Monthly' : 'Annual'} other
                        allowances
                      </label>
                      <Input
                        value={otherAllowanceDisplay}
                        placeholder={otherAllowancePlaceholder}
                        className="h-7.5!"
                        disabled
                      />
                    </div>
                  </div>
                  <p className="text-muted-foreground text-[11px]">
                    Other allowances are calculated from gross minus the BHT
                    amounts.
                  </p>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-muted-foreground text-xs">
                    Rent for period
                  </label>
                  <MoneyInput
                    value={historyDraft.periodRent ?? ''}
                    onValueChange={(value) =>
                      updateHistoryDraft({ periodRent: value })
                    }
                    placeholder="1200000"
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-muted-foreground text-xs">
                    Monthly estimate
                  </label>
                  <Input
                    value={rentMonthlyEstimateLabel}
                    placeholder="Auto-calculated"
                    className="mt-1"
                    disabled
                  />
                </div>
              </div>
              <p className="text-muted-foreground text-[11px]">
                Monthly estimate is rent divided by the number of months in the
                period.
              </p>
              <div>
                <label className="text-muted-foreground text-xs">Address</label>
                <Input
                  value={historyDraft.address ?? ''}
                  onChange={(e) =>
                    updateHistoryDraft({ address: e.target.value })
                  }
                  placeholder="Yaba, Lagos"
                  className="mt-1"
                />
              </div>
            </>
          )}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            type="button"
            onClick={requestCloseHistoryEditor}
            size="sm"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSaveHistoryDraft}
            disabled={needsFutureStartConfirmFlag}
            size="sm"
          >
            Save changes
          </Button>
        </div>
      </div>
    );
  };

  const renderDetailsPanel = (variant: 'drawer' | 'sheet') => {
    const PanelHeader = variant === 'sheet' ? SheetHeader : DrawerHeader;
    const PanelTitle = variant === 'sheet' ? SheetTitle : DrawerTitle;
    const PanelDescription =
      variant === 'sheet' ? SheetDescription : DrawerDescription;
    const PanelFooter = variant === 'sheet' ? SheetFooter : DrawerFooter;

    return (
      <>
        <PanelHeader>
          <PanelTitle>Edit Employee</PanelTitle>
          <PanelDescription>
            Update employee information and compensation details
          </PanelDescription>
        </PanelHeader>
        <div className="scrollbar-thin-2px flex flex-col overflow-y-auto">
          {historyDiscardPromptOpen && (
            <div className="sticky top-0 z-10 border-b border-amber-200 bg-amber-50/95 px-4 pt-3 pb-3 text-[11px] text-amber-900 backdrop-blur-sm dark:border-amber-900/40 dark:bg-amber-950/60 dark:text-amber-200">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-xs font-semibold">Unsaved changes.</p>
                  <p>Discard the pending compensation/rent edits?</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    onClick={() => {
                      setHistoryDiscardPromptOpen(false);
                      setPendingDrawerClose(false);
                    }}
                  >
                    Keep editing
                  </Button>
                  <Button
                    size="sm"
                    type="button"
                    onClick={handleDiscardHistoryChanges}
                  >
                    Discard
                  </Button>
                </div>
              </div>
            </div>
          )}
          <div className="space-y-4 px-4 pt-4 pb-4">
            <div className="relative">
              <label className="text-muted-foreground absolute -top-1/4 right-2 text-sm backdrop-blur-sm">
                Full Name
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={commitEmployeeEdits}
                placeholder="Employee name"
                className="rounded text-[16px]"
              />
            </div>
            <div className="relative">
              <label className="text-muted-foreground absolute -top-1/4 right-2 text-sm backdrop-blur-sm">
                Role/Position
              </label>
              <Input
                value={role}
                onChange={(e) => setRole(e.target.value)}
                onBlur={commitEmployeeEdits}
                placeholder="Job title"
                className="rounded text-[16px]"
              />
            </div>

            {/* Not sure if to show this here since they'll be seeing / editing comp history
          <div>
            <label className="text-muted-foreground text-sm">
              Monthly Gross Salary
            </label>
            <Input
              type="number"
              value={monthlyGross}
              onChange={(e) => {
                if (isReadOnly) return;
                const monthly = parseFloat(e.target.value) || 0;
                setEditedMonthlyGross(monthly);
                const annualGross = monthly * 12;
                const currentComp =
                  runItem.payProfileSnapshot.compensationHistory[0];
                const nextComp = {
                  ...currentComp,
                  id: currentComp.id ?? crypto.randomUUID(),
                  annualGross: annualGross.toFixed(2),
                  annualBasic: undefined,
                  annualHousing: undefined,
                  annualTransport: undefined,
                };
                onEdit({
                  ...runItem,
                  payProfileSnapshot: {
                    ...runItem.payProfileSnapshot,
                    compensationHistory: [nextComp],
                  },
                });
              }}
              disabled={isReadOnly}
              placeholder="0.00"
              className="mt-1.5 rounded text-base disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div> */}
          </div>
          <div className="border-t" />
          <div className="space-y-4 px-4 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">
                  Employee profile sections
                </h3>
                <p className="text-muted-foreground text-xs">
                  Expand a section to edit additional employee data.
                </p>
              </div>
              <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
                Import ready
              </span>
            </div>

            <div className="space-y-3">
              <Collapsible className="bg-card rounded border p-3">
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="group flex w-full items-start justify-between gap-3 text-left"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold">
                          Identity & Contact
                        </span>
                        <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[9px] font-semibold tracking-wide uppercase">
                          Profile
                        </span>
                      </div>
                      <p className="text-muted-foreground text-xs">
                        Employee ID, department, email, phone.
                      </p>
                    </div>
                    <ChevronDown className="text-muted-foreground size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 pt-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-muted-foreground text-xs">
                        Employee ID
                      </label>
                      <Input
                        value={employeeIdInput}
                        onChange={(e) => setEmployeeIdInput(e.target.value)}
                        onBlur={commitEmployeeEdits}
                        placeholder="EMP-001"
                      />
                    </div>
                    <div>
                      <label className="text-muted-foreground text-xs">
                        Department
                      </label>
                      <Input
                        value={departmentInput}
                        onChange={(e) => setDepartmentInput(e.target.value)}
                        onBlur={commitEmployeeEdits}
                        placeholder="Finance"
                      />
                    </div>
                    <div>
                      <label className="text-muted-foreground text-xs">
                        Email
                      </label>
                      <Input
                        value={emailInput}
                        onChange={(e) => handleEmailChange(e.target.value)}
                        onBlur={() => {
                          handleEmailBlur();
                          commitEmployeeEdits();
                        }}
                        placeholder="employee@company.com"
                        className={cn(
                          'mt-1',
                          emailError &&
                            'border-destructive focus-visible:ring-destructive/20',
                        )}
                      />
                      {emailError && (
                        <p className="text-destructive mt-1 text-[11px]">
                          {emailError}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="text-muted-foreground text-xs">
                        Phone number
                      </label>
                      <Input
                        value={phoneInput}
                        onChange={(e) => setPhoneInput(e.target.value)}
                        onBlur={commitEmployeeEdits}
                        placeholder="+234 801 234 5678"
                      />
                    </div>
                  </div>
                  <p className="text-muted-foreground text-[11px]">
                    Spreadsheet columns: employee_id, department, email, phone.
                  </p>
                </CollapsibleContent>
              </Collapsible>

              <Collapsible className="bg-card rounded border p-3">
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="group flex w-full items-start justify-between gap-3 text-left"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold">
                          Employment & Tax
                        </span>
                        <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[9px] font-semibold tracking-wide uppercase">
                          Compliance
                        </span>
                      </div>
                      <p className="text-muted-foreground text-xs">
                        Join/exit dates, tax IDs, pension identifiers.
                      </p>
                    </div>
                    <ChevronDown className="text-muted-foreground size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 pt-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="min-w-0 sm:col-span-2">
                      <label className="text-muted-foreground text-xs">
                        PAYE state
                      </label>
                      <SimpleSelect
                        value={employeeState ?? 'default'}
                        onChange={handleStateChange}
                        options={STATE_OPTIONS}
                        placeholder="Company default"
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="text-muted-foreground text-xs">
                        Join date
                      </label>
                      <DatePicker
                        id={`join-date-${runItem.id}`}
                        value={joinDateInput}
                        onChange={(value) => setJoinDateInput(value ?? '')}
                        onBlur={commitEmployeeEdits}
                        invalid={Boolean(joinDateError)}
                        disabled={isReadOnly}
                        className="mt-1"
                      />
                      {joinDateError && (
                        <p className="text-destructive mt-1 text-[11px]">
                          {joinDateError}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="text-muted-foreground text-xs">
                        Exit date
                      </label>
                      <DatePicker
                        id={`exit-date-${runItem.id}`}
                        value={exitDateInput}
                        onChange={(value) => setExitDateInput(value ?? '')}
                        onBlur={commitEmployeeEdits}
                        invalid={Boolean(exitDateError)}
                        disabled={isReadOnly}
                        className="mt-1"
                      />
                      {exitDateError && (
                        <p className="text-destructive mt-1 text-[11px]">
                          {exitDateError}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="text-muted-foreground text-xs">
                        Tax ID
                      </label>
                      <Input
                        value={taxIdInput}
                        onChange={(e) => setTaxIdInput(e.target.value)}
                        onBlur={commitEmployeeEdits}
                        disabled={isReadOnly}
                        placeholder="123456789 / N-888888"
                        className="mt-1"
                      />
                    </div>
                    <div className="min-w-0">
                      <label className="text-muted-foreground text-xs">
                        PFA
                      </label>
                      <SimpleSelect
                        value={pfaInput}
                        onChange={setPfaInput}
                        options={PFA_OPTIONS}
                        placeholder="Select PFA"
                        disabled={isReadOnly}
                        className="mt-1 w-full"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-muted-foreground text-xs">
                        RSA PIN
                      </label>
                      <Input
                        value={rsaPinInput}
                        onChange={(e) => setRsaPinInput(e.target.value)}
                        onBlur={commitEmployeeEdits}
                        disabled={isReadOnly}
                        placeholder="PEN123456789..."
                        className="mt-1"
                      />
                    </div>
                  </div>

                  <div className="bg-muted/20 border-t py-2">
                    <div className="text-muted-foreground">
                      <p className="text-[11px] font-semibold tracking-wide uppercase">
                        Statutory overrides (optional)
                      </p>
                      <p className="text-[10px] text-red-500">
                        Use only if special pension or statutory arrangements
                        exists for employee (e.g. employer pays 12%)
                      </p>
                    </div>
                    <div className="mt-2 grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="text-muted-foreground text-xs">
                          Pension employee %
                        </label>
                        <div className="relative">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            step="0.1"
                            value={pensionEmployeeRateInput}
                            onChange={(e) =>
                              setPensionEmployeeRateInput(e.target.value)
                            }
                            onBlur={commitPensionEdits}
                            disabled={isReadOnly}
                            placeholder="8%"
                            className="mt-1 h-8 pr-8 text-sm"
                          />
                          <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs">
                            %
                          </span>
                        </div>
                      </div>
                      <div>
                        <label className="text-muted-foreground text-xs">
                          Pension employer %
                        </label>
                        <div className="relative">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            step="0.1"
                            value={pensionEmployerRateInput}
                            onChange={(e) =>
                              setPensionEmployerRateInput(e.target.value)
                            }
                            onBlur={commitPensionEdits}
                            disabled={isReadOnly}
                            placeholder="10%"
                            className="mt-1 h-8 pr-8 text-sm"
                          />
                          <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs">
                            %
                          </span>
                        </div>
                      </div>
                      <div>
                        <label className="text-muted-foreground text-xs">
                          NHF rate or amount
                        </label>
                        <Input
                          value={nhfInput}
                          onChange={(e) => setNhfInput(e.target.value)}
                          onBlur={commitNhfEdits}
                          disabled={isReadOnly}
                          placeholder="2.5% or 5000"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-muted-foreground text-xs">
                          NHIS employee %
                        </label>
                        <div className="relative">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            step="0.1"
                            value={nhisEmployeeRateInput}
                            onChange={(e) =>
                              setNhisEmployeeRateInput(e.target.value)
                            }
                            onBlur={commitNhisEdits}
                            disabled={isReadOnly}
                            placeholder="2.5%"
                            className="mt-1 h-8 pr-8 text-sm"
                          />
                          <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs">
                            %
                          </span>
                        </div>
                      </div>
                      <div>
                        <label className="text-muted-foreground text-xs">
                          NHIS employer %
                        </label>
                        <div className="relative">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            step="0.1"
                            value={nhisEmployerRateInput}
                            onChange={(e) =>
                              setNhisEmployerRateInput(e.target.value)
                            }
                            onBlur={commitNhisEdits}
                            disabled={isReadOnly}
                            placeholder="5%"
                            className="mt-1 h-8 pr-8 text-sm"
                          />
                          <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs">
                            %
                          </span>
                        </div>
                      </div>
                    </div>
                    <p className="text-muted-foreground mt-2 text-[11px]">
                      Overrides company defaults when provided.
                    </p>
                  </div>
                  <p className="text-muted-foreground text-[11px]">
                    Spreadsheet columns: state, join_date, exit_date, tax_id,
                    pfa, rsa_pin.
                  </p>
                </CollapsibleContent>
              </Collapsible>

              <Collapsible className="bg-card rounded border p-3">
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="group flex w-full items-start justify-between gap-3 text-left"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold">
                          Bank & Payment
                        </span>
                        <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[9px] font-semibold tracking-wide uppercase">
                          Payouts
                        </span>
                      </div>
                      <p className="text-muted-foreground text-xs">
                        Bank name, account number, account name.
                      </p>
                    </div>
                    <ChevronDown className="text-muted-foreground size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 pt-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-muted-foreground text-xs">
                        Bank name
                      </label>
                      <Input
                        value={bankNameInput}
                        onChange={(e) => setBankNameInput(e.target.value)}
                        onBlur={commitEmployeeEdits}
                        disabled={isReadOnly}
                        placeholder="GTBank"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-muted-foreground text-xs">
                        Account number
                      </label>
                      <Input
                        value={bankAccountNumberInput}
                        onChange={(e) =>
                          handleBankAccountNumberChange(e.target.value)
                        }
                        onBlur={() => {
                          handleBankAccountNumberBlur();
                          commitEmployeeEdits();
                        }}
                        disabled={isReadOnly}
                        placeholder="0123456789"
                        inputMode="numeric"
                        className={cn(
                          'mt-1',
                          bankAccountNumberError &&
                            'border-destructive focus-visible:ring-destructive/20',
                        )}
                      />
                      {bankAccountNumberError && (
                        <p className="text-destructive mt-1 text-[11px]">
                          {bankAccountNumberError}
                        </p>
                      )}
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-muted-foreground text-xs">
                        Account name
                      </label>
                      <Input
                        value={bankAccountNameInput}
                        onChange={(e) =>
                          setBankAccountNameInput(e.target.value)
                        }
                        onBlur={commitEmployeeEdits}
                        disabled={isReadOnly}
                        placeholder="Jane Doe"
                        className="mt-1"
                      />
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              <Collapsible
                open={recurringOpen}
                onOpenChange={setRecurringOpen}
                className="bg-card rounded border p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="group flex w-full min-w-0 items-start justify-between gap-3 text-left"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold">
                            Recurring deductions
                          </span>
                          <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[9px] font-semibold tracking-wide uppercase">
                            Monthly
                          </span>
                        </div>
                        <p className="text-muted-foreground text-xs">
                          Loans, union dues, or voluntary contributions.
                        </p>
                      </div>
                      <ChevronDown className="text-muted-foreground size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
                    </button>
                  </CollapsibleTrigger>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 shrink-0 px-2 text-[11px]"
                    disabled={isReadOnly}
                    onClick={() => {
                      setRecurringOpen(true);
                      openRecurringEditor({
                        mode: 'add',
                        name: '',
                        amount: '',
                        taxTreatment: 'non_taxable',
                        fromMonth: currentMonth,
                        fromYear: currentYear,
                        toMonth: currentMonth,
                        toYear: currentYear,
                        isOngoing: false,
                      });
                    }}
                  >
                    <Plus className="size-3" />
                    Add item
                  </Button>
                </div>
                <CollapsibleContent className="space-y-3 pt-3">
                  <p className="text-muted-foreground text-xs">
                    Import columns: name, amount, tax_treatment, from_month,
                    to_month.
                  </p>
                  {renderRecurringEditor()}
                  {recurringDeductions.length === 0 ? (
                    <div className="text-muted-foreground rounded-md border border-dashed p-3 text-xs">
                      No recurring deductions yet. Add one to apply it every
                      month.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {recurringDeductions.map((item) => {
                        const amountValue = parseFloat(item.amount);
                        const displayAmount = Number.isFinite(amountValue)
                          ? amountValue
                          : 0;
                        const isActive =
                          currentMonthKey != null &&
                          item.fromMonth <= currentMonthKey &&
                          (!item.toMonth || item.toMonth >= currentMonthKey);

                        return (
                          <div
                            key={item.id}
                            className="bg-muted/20 rounded-md border p-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-sm font-medium">
                                    {item.name}
                                  </p>
                                  {isActive && (
                                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-emerald-700 uppercase dark:bg-emerald-950/30 dark:text-emerald-400">
                                      Active
                                    </span>
                                  )}
                                </div>
                                <p className="text-muted-foreground text-xs">
                                  {formatPeriodLabel(
                                    item.fromMonth,
                                    item.toMonth,
                                  )}
                                </p>
                              </div>
                              <div className="flex items-start gap-2">
                                <div className="text-right">
                                  <span className="text-sm font-semibold tabular-nums">
                                    {ngnMoneyFormatter(displayAmount)}
                                  </span>
                                  <span className="bg-muted text-muted-foreground mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
                                    {formatTaxTreatmentLabel(item.taxTreatment)}
                                  </span>
                                </div>
                                <div className="flex flex-col gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0"
                                    disabled={isReadOnly}
                                    aria-label="Edit recurring deduction"
                                    onClick={() => {
                                      const fromParts = getMonthKeyParts(
                                        item.fromMonth,
                                      );
                                      const toParts = getMonthKeyParts(
                                        item.toMonth,
                                      );
                                      openRecurringEditor({
                                        mode: 'edit',
                                        id: item.id,
                                        name: item.name,
                                        amount: item.amount,
                                        taxTreatment:
                                          isValidRecurringTaxTreatment(
                                            item.taxTreatment ?? '',
                                          )
                                            ? (item.taxTreatment as RecurringTaxTreatment)
                                            : 'non_taxable',
                                        fromMonth:
                                          fromParts.month || currentMonth,
                                        fromYear: fromParts.year || currentYear,
                                        toMonth: toParts.month || currentMonth,
                                        toYear: toParts.year || currentYear,
                                        isOngoing: !item.toMonth,
                                      });
                                    }}
                                  >
                                    <Pencil className="size-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive h-7 w-7 p-0"
                                    disabled={isReadOnly}
                                    aria-label="Remove recurring deduction"
                                    onClick={() =>
                                      handleRemoveRecurringDeduction(item.id)
                                    }
                                  >
                                    <Trash2 className="size-3.5" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>

              <Collapsible
                open={oneOffOpen}
                onOpenChange={setOneOffOpen}
                className="bg-card rounded border p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="group flex w-full min-w-0 items-start justify-between gap-3 text-left"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold">
                            One-off adjustments
                          </span>
                          <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[9px] font-semibold tracking-wide uppercase">
                            This run
                          </span>
                        </div>
                        <p className="text-muted-foreground text-xs">
                          Loss of employment, bonuses, special deductions.
                        </p>
                      </div>
                      <ChevronDown className="text-muted-foreground size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
                    </button>
                  </CollapsibleTrigger>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 shrink-0 px-2 text-[11px]"
                    disabled={isReadOnly}
                    onClick={() => {
                      setOneOffOpen(true);
                      openOneOffEditor({
                        mode: 'add',
                        kind: 'allowance',
                        name: '',
                        amount: '',
                        taxTreatment: 'taxable',
                      });
                    }}
                  >
                    <Plus className="size-3" />
                    Add one-off
                  </Button>
                </div>
                <CollapsibleContent className="space-y-3 pt-3">
                  <p className="text-muted-foreground text-xs">
                    Import columns: type, name, amount, tax_treatment,
                    employer_type.
                  </p>
                  {renderOneOffEditor()}
                  {oneOffItems.length === 0 ? (
                    <div className="text-muted-foreground rounded-md border border-dashed p-3 text-xs">
                      No one-off adjustments yet. Add one to apply only to this
                      run.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {oneOffItems.map((item) => {
                        const amountValue = parseFloat(item.amount);
                        const displayAmount = Number.isFinite(amountValue)
                          ? amountValue
                          : 0;
                        const taxTreatment =
                          item.kind === 'employer'
                            ? undefined
                            : item.taxTreatment;
                        const employerType =
                          item.kind === 'employer'
                            ? employerTypeLabels[item.type]
                            : undefined;

                        return (
                          <div
                            key={item.id}
                            className="bg-muted/20 rounded-md border p-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">
                                  {item.name}
                                </p>
                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                  <span
                                    className={cn(
                                      'rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase',
                                      oneOffTypeClassNames[item.kind] ??
                                        'bg-muted text-muted-foreground',
                                    )}
                                  >
                                    {oneOffTypeLabels[item.kind] ?? item.kind}
                                  </span>
                                  {employerType && (
                                    <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
                                      {employerType}
                                    </span>
                                  )}
                                  {taxTreatment && (
                                    <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
                                      {formatTaxTreatmentLabel(taxTreatment)}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-start gap-2">
                                <span className="shrink-0 text-sm font-semibold tabular-nums">
                                  {ngnMoneyFormatter(displayAmount)}
                                </span>
                                <div className="flex flex-col gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0"
                                    disabled={isReadOnly}
                                    aria-label="Edit one-off"
                                    onClick={() => {
                                      if (item.kind === 'employer') {
                                        openOneOffEditor({
                                          mode: 'edit',
                                          id: item.id,
                                          kind: 'employer',
                                          name: item.name,
                                          amount: item.amount,
                                          employerType: item.type,
                                        });
                                        return;
                                      }

                                      openOneOffEditor({
                                        mode: 'edit',
                                        id: item.id,
                                        kind: item.kind,
                                        name: item.name,
                                        amount: item.amount,
                                        taxTreatment:
                                          item.kind === 'allowance'
                                            ? isValidAllowanceTaxTreatment(
                                                item.taxTreatment,
                                              )
                                              ? item.taxTreatment
                                              : 'taxable'
                                            : isValidDeductionTaxTreatment(
                                                  item.taxTreatment,
                                                )
                                              ? item.taxTreatment
                                              : 'non_taxable',
                                      });
                                    }}
                                  >
                                    <Pencil className="size-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive h-7 w-7 p-0"
                                    disabled={isReadOnly}
                                    aria-label="Remove one-off"
                                    onClick={() =>
                                      handleRemoveOneOff(item.kind, item.id)
                                    }
                                  >
                                    <Trash2 className="size-3.5" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>
            </div>
          </div>

          <div className="border-t" />
          <div className="grid gap-4 px-4 py-4">
            <Collapsible
              defaultOpen
              className="bg-card space-y-3 rounded border p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="group flex w-full min-w-0 items-start justify-between gap-3 text-left"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold">
                          Compensation history
                        </span>
                        <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[9px] font-semibold tracking-wide uppercase">
                          Monthly/Annual
                        </span>
                      </div>
                      <p className="text-muted-foreground text-xs">
                        Import-ready: from/to month, gross, BHT split.
                      </p>
                    </div>
                    <ChevronDown className="text-muted-foreground size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
                  </button>
                </CollapsibleTrigger>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 shrink-0 px-2 text-[11px]"
                  disabled={isReadOnly}
                  onClick={handleAddCompRecord}
                >
                  <Plus className="size-3" />
                  Add record
                </Button>
              </div>
              <CollapsibleContent className="space-y-3 pt-3">
                <div className="text-muted-foreground text-[11px]">
                  <div className="flex items-center gap-1">
                    <Lock className="size-3" />
                    <span>Records with finalized runs are locked.</span>
                  </div>
                  <span>Update end date and add a new record for changes.</span>
                </div>

                {pendingCompAutoEnd && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
                    <div className="flex items-start gap-2">
                      <Lock className="mt-0.5 size-3.5" />
                      <div className="space-y-1">
                        <p className="text-xs font-semibold">
                          End the current record?
                        </p>
                        <p>
                          This will end the current record at{' '}
                          {formatMonthKeyLabel(pendingCompAutoEnd.endKey)} and
                          start the new record at{' '}
                          {formatMonthKeyLabel(pendingCompAutoEnd.startKey)}.
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        onClick={() => setPendingCompAutoEnd(null)}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        type="button"
                        onClick={() => {
                          const startParts = getMonthKeyParts(
                            pendingCompAutoEnd.startKey,
                          );
                          const startMonth =
                            startParts.month || nextCompStartMonth;
                          const startYear =
                            startParts.year || nextCompStartYear;
                          const startLabel = formatMonthKeyLabel(
                            pendingCompAutoEnd.startKey,
                          );
                          const endLabel = formatMonthKeyLabel(
                            pendingCompAutoEnd.endKey,
                          );

                          openHistoryEditor(
                            buildCompHistoryDraft({
                              startMonth,
                              startYear,
                              startLocked: true,
                              startLockHint: startLabel
                                ? `Start month locked to ${startLabel} to avoid overlaps.`
                                : compStartLockHint,
                              autoEndNotice: endLabel
                                ? `Current record will end at ${endLabel} when this record is saved.`
                                : undefined,
                            }),
                          );
                        }}
                      >
                        Confirm & continue
                      </Button>
                    </div>
                  </div>
                )}

                {renderHistoryEditor('comp')}
                <div className="space-y-3">
                  {sortedCompHistory.map((entry) => {
                    const fromParts = getMonthKeyParts(entry.fromMonth);
                    const toParts = getMonthKeyParts(entry.toMonth);
                    const entryMode = 'annual';
                    const entryModeLabel = 'Annual entry';
                    const breakdownLabel = 'Annual BHT breakdown';
                    const isCurrent = Boolean(
                      currentMonthKey &&
                        entry.fromMonth <= currentMonthKey &&
                        (!entry.toMonth || entry.toMonth >= currentMonthKey),
                    );
                    const annualGrossValue = parseMoneyValue(entry.annualGross);
                    const monthlyGrossValue = annualGrossValue / 12;
                    const hasBreakdown = Boolean(
                      entry.annualBasic ||
                        entry.annualHousing ||
                        entry.annualTransport,
                    );
                    const breakdownValues = hasBreakdown
                      ? {
                          basic: parseMoneyValue(entry.annualBasic),
                          housing: parseMoneyValue(entry.annualHousing),
                          transport: parseMoneyValue(entry.annualTransport),
                        }
                      : null;
                    const entryHasFinalizedOverlap = hasFinalizedOverlapForComp(
                      entry.fromMonth,
                      entry.toMonth,
                    );
                    const showAddInsteadOfEdit =
                      isCurrent && entryHasFinalizedOverlap;

                    return (
                      <div
                        key={entry.id}
                        className="bg-muted/20 hover:bg-muted/30 space-y-2 rounded-md border p-3 transition-colors"
                      >
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium">
                              {formatPeriodLabel(
                                entry.fromMonth,
                                entry.toMonth,
                              )}
                            </p>

                            <div className="flex flex-col items-end gap-1">
                              {isCurrent ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-[10px] tracking-wide uppercase"
                                  disabled={isReadOnly}
                                  onClick={() => {
                                    if (showAddInsteadOfEdit) {
                                      handleAddCompRecord();
                                      return;
                                    }

                                    openHistoryEditor({
                                      kind: 'comp',
                                      mode: 'edit',
                                      id: entry.id,
                                      fromMonth:
                                        fromParts.month || currentMonth,
                                      fromYear: fromParts.year || currentYear,
                                      toMonth: toParts.month || currentMonth,
                                      toYear: toParts.year || currentYear,
                                      isOngoing: !entry.toMonth,
                                      entryMode,
                                      includeBreakdown: hasBreakdown,
                                      annualGross: entry.annualGross,
                                      monthlyGross:
                                        monthlyGrossValue.toFixed(2),
                                      note: entry.note,
                                      basic: entry.annualBasic ?? '',
                                      housing: entry.annualHousing ?? '',
                                      transport: entry.annualTransport ?? '',
                                      futureStartConfirmed: true,
                                    });
                                  }}
                                >
                                  <Pencil className="size-3" />
                                  {showAddInsteadOfEdit ? 'New record' : 'Edit'}
                                </Button>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-[10px] tracking-wide uppercase"
                                  disabled
                                >
                                  <Lock className="size-3" />
                                  Locked
                                </Button>
                              )}
                            </div>
                          </div>

                          <div className="min-w-0 space-y-1">
                            <div className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5">
                              <p
                                className={cn(
                                  'rounded-full px-2 py-0.5 text-[9px] font-medium tracking-wide whitespace-nowrap uppercase',
                                  isCurrent
                                    ? 'border-[0.5px]'
                                    : 'bg-muted text-muted-foreground',
                                )}
                              >
                                {isCurrent ? 'Current' : 'Past'}
                              </p>
                              {entryHasFinalizedOverlap && (
                                <p className="rounded-full border-[0.5px] px-2 py-0.5 text-[9px] font-medium tracking-wide whitespace-nowrap uppercase">
                                  Finalized
                                </p>
                              )}
                              <p className="rounded-full border-[0.5px] px-2 py-0.5 text-[9px] font-medium tracking-wide whitespace-nowrap uppercase">
                                {entryModeLabel}
                              </p>
                              <p
                                className={cn(
                                  'rounded-full border-[0.5px] px-2 py-0.5 text-[9px] font-medium tracking-wide whitespace-nowrap uppercase',
                                  hasBreakdown
                                    ? ''
                                    : 'bg-muted text-muted-foreground',
                                )}
                              >
                                {hasBreakdown ? 'BHT split' : 'Gross only'}
                              </p>
                            </div>
                            <p className="text-muted-foreground truncate text-xs">
                              {entry.note || 'No note added.'}
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div>
                            <span className="text-muted-foreground block text-[10px] tracking-wide uppercase">
                              Annual gross
                            </span>
                            <span className="text-sm font-semibold tabular-nums">
                              {ngnMoneyFormatter(annualGrossValue)}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground block text-[10px] tracking-wide uppercase">
                              Monthly gross
                            </span>
                            <span className="text-sm font-semibold tabular-nums">
                              {ngnMoneyFormatter(monthlyGrossValue)}
                            </span>
                          </div>
                        </div>
                        {breakdownValues && (
                          <div className="bg-muted/40 rounded-md p-2">
                            <span className="text-muted-foreground block text-[10px] tracking-wide uppercase">
                              {breakdownLabel}
                            </span>
                            <div className="mt-2 grid gap-2 text-xs sm:grid-cols-3">
                              <div>
                                <span className="text-muted-foreground block text-[10px] tracking-wide uppercase">
                                  Basic
                                </span>
                                <span className="text-sm font-semibold tabular-nums">
                                  {ngnMoneyFormatter(breakdownValues.basic)}
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground block text-[10px] tracking-wide uppercase">
                                  Housing
                                </span>
                                <span className="text-sm font-semibold tabular-nums">
                                  {ngnMoneyFormatter(breakdownValues.housing)}
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground block text-[10px] tracking-wide uppercase">
                                  Transport
                                </span>
                                <span className="text-sm font-semibold tabular-nums">
                                  {ngnMoneyFormatter(breakdownValues.transport)}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CollapsibleContent>
            </Collapsible>

            <Collapsible className="bg-card space-y-3 rounded border p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="group flex w-full min-w-0 items-start justify-between gap-3 text-left"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold">
                          Rent history
                        </span>
                        <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
                          Relief
                        </span>
                      </div>
                      <p className="text-muted-foreground text-xs">
                        Import-ready: from/to month, rent, address.
                      </p>
                    </div>
                    <ChevronDown className="text-muted-foreground size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
                  </button>
                </CollapsibleTrigger>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 shrink-0 px-2 text-[11px]"
                  disabled={isReadOnly}
                  onClick={() =>
                    openHistoryEditor({
                      kind: 'rent',
                      mode: 'add',
                      fromMonth: currentMonth,
                      fromYear: currentYear,
                      toMonth: currentMonth,
                      toYear: currentYear,
                      isOngoing: false,
                      entryMode: 'monthly',
                      periodRent: '',
                      address: '',
                      futureStartConfirmed: false,
                    })
                  }
                >
                  <Plus className="size-3" />
                  Add record
                </Button>
              </div>
              <CollapsibleContent className="space-y-3 pt-3">
                <div className="text-muted-foreground flex items-center gap-1 text-[11px]">
                  <Lock className="size-3" />
                  Past records are locked in this draft view.
                </div>
                {renderHistoryEditor('rent')}
                <div className="space-y-3">
                  {sortedRentHistory.map((entry) => {
                    const fromParts = getMonthKeyParts(entry.fromMonth);
                    const toParts = getMonthKeyParts(entry.toMonth);
                    const monthsInPeriod = getMonthsInPeriod(
                      entry.fromMonth,
                      entry.toMonth,
                    );
                    const monthlyEstimate =
                      monthsInPeriod && monthsInPeriod > 0
                        ? parseMoneyValue(entry.rent) / monthsInPeriod
                        : null;
                    const monthlyEstimateLabel =
                      monthlyEstimate == null
                        ? '-'
                        : ngnMoneyFormatter(
                            monthlyEstimate,
                            Math.abs(monthlyEstimate % 1) > 0 ? 2 : 0,
                          );
                    const isCurrent = Boolean(
                      currentMonthKey &&
                        entry.fromMonth <= currentMonthKey &&
                        (!entry.toMonth || entry.toMonth >= currentMonthKey),
                    );
                    const entryHasFinalizedOverlap = hasFinalizedOverlapForRent(
                      entry.fromMonth,
                      entry.toMonth,
                    );

                    return (
                      <div
                        key={entry.id}
                        className="bg-muted/20 hover:bg-muted/30 space-y-3 rounded-md border p-3 transition-colors"
                      >
                        <div className="flex flex-col">
                          <div className="flex min-w-0 justify-between">
                            <div className="min-w-0">
                              <p className="text-sm font-medium">
                                {formatPeriodLabel(
                                  entry.fromMonth,
                                  entry.toMonth,
                                )}
                              </p>
                            </div>
                            {isCurrent && !entryHasFinalizedOverlap ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-[10px] tracking-wide uppercase"
                                disabled={isReadOnly}
                                onClick={() =>
                                  openHistoryEditor({
                                    kind: 'rent',
                                    mode: 'edit',
                                    id: entry.id,
                                    fromMonth: fromParts.month || currentMonth,
                                    fromYear: fromParts.year || currentYear,
                                    toMonth: toParts.month || currentMonth,
                                    toYear: toParts.year || currentYear,
                                    isOngoing: false,
                                    entryMode: 'monthly',
                                    periodRent: entry.rent,
                                    address: entry.address,
                                    futureStartConfirmed: true,
                                  })
                                }
                              >
                                <Pencil className="size-3" />
                                Edit
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-[10px] tracking-wide uppercase"
                                disabled
                              >
                                <Lock className="size-3" />
                                Locked
                              </Button>
                            )}
                          </div>

                          <div className="flex gap-1">
                            <span
                              className={cn(
                                'rounded-full px-2 py-0.5 text-[9px] font-medium tracking-wide uppercase',
                                'bg-muted text-muted-foreground',
                              )}
                            >
                              {isCurrent ? 'Current' : 'Past'}
                            </span>
                            {entryHasFinalizedOverlap && (
                              <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[9px] font-medium tracking-wide uppercase">
                                Finalized
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <div className="flex flex-wrap justify-between gap-3 text-xs sm:grid sm:grid-cols-2">
                            <div>
                              <span className="text-muted-foreground block text-[10px] tracking-wide uppercase">
                                Rent for period
                              </span>
                              <span className="text-sm font-semibold tabular-nums">
                                {ngnMoneyFormatter(parseMoneyValue(entry.rent))}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground block text-[10px] tracking-wide uppercase">
                                Monthly estimate
                              </span>
                              <span className="text-sm font-semibold tabular-nums">
                                {monthlyEstimateLabel}
                              </span>
                            </div>
                          </div>

                          <p className="text-muted-foreground truncate text-[10px]">
                            {entry.address || 'No address provided'}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </div>
        <PanelFooter>
          <Button
            variant="outline"
            onClick={() => handleDetailsDrawerOpenChange(false)}
          >
            Close
          </Button>
        </PanelFooter>
      </>
    );
  };

  return {
    rowData,
    isReadOnly,
    name,
    setName,
    role,
    setRole,
    commitEmployeeEdits,
    detailsDrawerOpen,
    setDetailsDrawerOpen,
    handleDetailsDrawerOpenChange,
    computationDrawerOpen,
    setComputationDrawerOpen,
    isEditingGross,
    grossInputValue,
    setGrossInputValue,
    grossInputRef,
    handleGrossBlur,
    handleGrossFocus,
    monthlyGross,
    stateChipLabel,
    renderDetailsPanel,
  };
}

export type PayrollEmployeeEditorState = ReturnType<
  typeof usePayrollEmployeeEditor
>;

export function PayrollTableCard({
  runItem,
  computedItem,
  onEdit,
  onDelete,
  runStatus = 'draft',
  runPeriod,
  finalizedPeriodKeys = [],
}: PayrollTableCardProps) {
  const editor = usePayrollEmployeeEditor({
    runItem,
    computedItem,
    onEdit,
    runStatus,
    runPeriod,
    finalizedPeriodKeys,
  });

  const {
    rowData,
    isReadOnly,
    name,
    setName,
    role,
    setRole,
    commitEmployeeEdits,
    detailsDrawerOpen,
    setDetailsDrawerOpen,
    handleDetailsDrawerOpenChange,
    computationDrawerOpen,
    setComputationDrawerOpen,
    isEditingGross,
    grossInputValue,
    setGrossInputValue,
    grossInputRef,
    handleGrossBlur,
    handleGrossFocus,
    monthlyGross,
    stateChipLabel,
    renderDetailsPanel,
  } = editor;

  return (
    <>
      <div
        className={cn(
          'bg-card flex flex-col gap-3 border-b p-4',
          isReadOnly && 'pointer-events-none opacity-60 grayscale',
        )}
      >
        {/* Header: Name, Role, Actions */}
        <div className="relative flex items-start justify-between gap-2">
          <div className="flex flex-1 flex-col gap-1">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitEmployeeEdits}
              disabled={isReadOnly}
              spellCheck={false}
              placeholder="Employee name"
              className="h-7.5 rounded p-0 px-1 text-[16px] font-medium shadow-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <Input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              onBlur={commitEmployeeEdits}
              disabled={isReadOnly}
              placeholder="Role (optional)"
              className="text-muted-foreground h-7.5 rounded p-0 px-1 text-[16px] shadow-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <div className="absolute right-0 -bottom-2 px-1">
              <span className="text-muted-foreground inline-flex rounded px-2 py-0.5 text-[10px] font-medium capitalize backdrop-blur-xs">
                State: {stateChipLabel}
              </span>
            </div>
          </div>
          {!isReadOnly && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:text-foreground justify-right h-8 w-4 shrink-0 items-center rounded"
                >
                  <MoreVertical className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40 rounded">
                <DropdownMenuItem onClick={() => setDetailsDrawerOpen(true)}>
                  <Pencil className="mr-1 size-3.5" />
                  <span className="text-xs">Employee</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setComputationDrawerOpen(true)}
                >
                  <Calculator className="mr-1 size-3.5" />
                  <span className="text-xs">Computation</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => onDelete(runItem.id)}
                >
                  <Trash2 className="mr-1 size-3.5" />
                  <span className="text-xs">Delete</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Gross and Net Pay */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground text-xs">Gross Pay</span>
            {isEditingGross && !isReadOnly ? (
              <Input
                ref={grossInputRef}
                type="text"
                inputMode="numeric"
                autoFocus
                value={grossInputValue}
                onChange={(e) => {
                  const rawValue = e.target.value;
                  if (rawValue === '' || /^\d*\.?\d*$/.test(rawValue)) {
                    setGrossInputValue(rawValue);
                  }
                }}
                onBlur={handleGrossBlur}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.currentTarget.blur();
                  }
                }}
                className="h-7.5 rounded border text-right text-[16px] font-medium tabular-nums"
              />
            ) : (
              <div
                className={cn(
                  'flex h-7.5 items-center rounded border pl-1 font-medium tabular-nums',
                  !isReadOnly && 'hover:text-primary cursor-pointer',
                )}
                onClick={!isReadOnly ? handleGrossFocus : undefined}
              >
                {ngnMoneyFormatter(monthlyGross)}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-0.5 text-right">
            <span className="text-muted-foreground text-xs">Net Pay</span>
            <span
              className="cursor-pointer font-semibold text-green-600 tabular-nums dark:text-green-500"
              onClick={() => setComputationDrawerOpen(true)}
            >
              {ngnMoneyFormatter(rowData.netPay)}
            </span>
          </div>
        </div>

        {/* Summary: PAYE, Pension, Deductions */}
        <div className="mt-1 grid grid-cols-3 gap-2 border-t pt-2 text-xs">
          <div>
            <span className="text-muted-foreground block text-[10px]">
              PAYE
            </span>
            <span
              className="cursor-pointer tabular-nums"
              onClick={() => setComputationDrawerOpen(true)}
            >
              {rowData.paye ? ngnMoneyFormatter(rowData.paye) : '-'}
            </span>
          </div>
          <div className="text-center">
            <span className="text-muted-foreground block text-[10px]">
              Pension
            </span>
            <span
              className="cursor-pointer tabular-nums"
              onClick={() => setComputationDrawerOpen(true)}
            >
              {ngnMoneyFormatter(rowData.employeePension)}
            </span>
          </div>
          <div className="text-right">
            <span className="text-muted-foreground block text-[10px]">
              Other
            </span>
            <span
              className="cursor-pointer tabular-nums"
              onClick={() => setComputationDrawerOpen(true)}
            >
              {ngnMoneyFormatter(
                (rowData.employeeNhf || 0) + (rowData.employeeNhis || 0),
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Edit Details Drawer */}
      <Drawer
        open={detailsDrawerOpen}
        onOpenChange={handleDetailsDrawerOpenChange}
      >
        <DrawerContent className="max-h-[85vh]">
          {renderDetailsPanel('drawer')}
        </DrawerContent>
      </Drawer>

      {/* Computation Details Sheet */}
      <ComputationDetailsSheet
        open={computationDrawerOpen}
        onOpenChange={setComputationDrawerOpen}
        rowData={rowData}
        computedItem={computedItem}
        employeeName={name}
        side="bottom"
      />
    </>
  );
}
