/**
 * CSV Import utilities for payroll employee data
 */

import Papa from 'papaparse';
import { NIGERIAN_STATES } from '../data/states';
import { PFA_KEYS, PFAS } from '../data/pfa';
import type { EmployeeRecord } from '../domain';
import { makeNewEmployeeRecord } from '../domain';
import { generateId } from '../utils';
import { logger } from './logger';
import type { StateValue } from '../data/states';
import type { PfaKey } from '../data/pfa';

/**
 * Constants for CSV import validation
 */
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_EMPLOYEES = 1000;
const ANNUAL_SALARY_THRESHOLD = 1_000_000; // Salaries above this are likely annual
const MAX_MONEY_AMOUNT = 1_000_000_000; // Maximum amount to prevent overflow
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

/**
 * Valid file types and extensions for CSV import
 */
const VALID_MIME_TYPES = ['text/csv', 'text/plain', 'application/vnd.ms-excel', 'application/csv'];
const VALID_EXTENSIONS = ['.csv'];

/**
 * CSV Import Format Types
 */
export type CsvImportFormat = 'simple' | 'full';

/**
 * Simple CSV format columns (minimal required fields)
 */
export const SIMPLE_CSV_COLUMNS = [
  'Name',
  'Role',
  'State',
  'Tax ID',
  'Period Type',
  'Gross Salary',
  'Basic',
  'Housing',
  'Transport',
] as const;

/**
 * Full CSV format columns (all employee details)
 */
export const FULL_CSV_COLUMNS = [
  'Employee ID',
  'Name',
  'Role',
  'Join Date',
  'Exit Date',
  'State',
  'Tax ID',
  'PFA',
  'RSA PIN',
  'NHF',
  'NHIS',
  'Rent',
  'Rent Period',
  'Basic',
  'Housing',
  'Transport',
  'Other Allowances',
  'Gross Salary',
] as const;

/**
 * Parsed CSV row data (before validation)
 */
export interface ParsedCsvRow {
  [key: string]: string | undefined;
}

/**
 * Validation error for a CSV row
 */
export interface CsvRowError {
  row: number; // 1-indexed row number (header is row 0)
  column?: string;
  message: string;
  value?: string;
}

/**
 * Result of CSV parsing and validation
 */
export interface CsvImportResult {
  employees: EmployeeRecord[];
  errors: CsvRowError[];
  warnings: string[];
}

/**
 * Generate CSV template content for download
 */
export function generateCsvTemplate(
  format: CsvImportFormat,
  includeSampleData: boolean = true,
): string {
  if (format === 'simple') {
    const header = SIMPLE_CSV_COLUMNS.join(',');
    if (!includeSampleData) {
      return header;
    }
    
    // Sample data rows
    // State: Must be exact match (e.g., "Lagos", "Abuja", "Kano")
    // Tax ID: Optional, can be left empty
    // Role: Optional, can be left empty
    // Gross Salary: Optional if Basic/Housing/Transport are provided
    const sampleRows = [
      'John Doe,Software Engineer,Lagos,TAX123456,monthly,500000,300000,150000,50000',
      'Jane Smith,Product Manager,Abuja,,monthly,,300000,200000,100000',
      'Mike Johnson,Designer,Kano,TAX789012,annual,7200000,,,',
    ];
    
    // Add reference rows formatted as CSV columns (label in col A, list in col B)
    // We'll detect and skip rows where first column is "REFERENCE" during parsing
    const referenceRows = [
      '',
      '#REF States:,' + NIGERIAN_STATES.join(', '),
      '#REF PFA keys (lowercase):,' + PFA_KEYS.join(', '),
      '#REF Period Type:, monthly, annual',
    ];

    return [header, ...sampleRows, ...referenceRows].join('\n');
  } else {
    // Full format
    const header = FULL_CSV_COLUMNS.join(',');
    if (!includeSampleData) {
      return header;
    }
    // Sample data row (with some optional fields)
    const sampleRow = [
      'EMP001',
      'John Doe',
      'Software Engineer',
      '2024-01-15',
      '',
      'Lagos',
      'TAX123456',
      'stanbic',
      'RSA123456',
      '5000',
      '15000',
      '200000',
      '2024-01',
      '300000',
      '150000',
      '50000',
      '0',
      '500000',
    ].join(',');
    return [header, sampleRow].join('\n');
  }
}

/**
 * Download CSV template file
 */
export function downloadCsvTemplate(format: CsvImportFormat): void {
  const content = generateCsvTemplate(format, true);
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `payroll-import-template-${format}.csv`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Auto-detect CSV format based on column headers
 */
export function detectCsvFormat(headers: string[]): CsvImportFormat | null {
  const normalizedHeaders = headers.map((h) => h.trim().toLowerCase());

  // Check for simple format (must have Name, State, and either Gross or BHT components)
  const hasName = normalizedHeaders.some((h) =>
    ['name', 'full name', 'employee name'].includes(h),
  );
  const hasState = normalizedHeaders.some((h) =>
    ['state', 'state of employment'].includes(h),
  );
  const hasGross = normalizedHeaders.some((h) =>
    ['gross salary', 'gross', 'monthly gross', 'annual gross'].includes(h),
  );
  const hasBasic = normalizedHeaders.some((h) =>
    ['basic', 'basic salary'].includes(h),
  );
  const hasHousing = normalizedHeaders.some((h) =>
    ['housing', 'housing allowance'].includes(h),
  );
  const hasTransport = normalizedHeaders.some((h) =>
    ['transport', 'transport allowance'].includes(h),
  );
  const hasPeriodType = normalizedHeaders.some((h) =>
    ['period type', 'period', 'type'].includes(h),
  );

  // Simple format if it has name, state, and (gross OR BHT components) and period type
  // Also check for Role and Tax ID which are now in simple format
  const hasRole = normalizedHeaders.some((h) =>
    ['role', 'position', 'job title'].includes(h),
  );
  const hasTaxId = normalizedHeaders.some((h) =>
    ['tax id', 'taxid', 'tin'].includes(h),
  );

  if (
    hasName &&
    hasState &&
    (hasGross || (hasBasic && hasHousing && hasTransport)) &&
    hasPeriodType &&
    (hasRole || hasTaxId || headers.length <= 10) // Allow for Role and Tax ID
  ) {
    return 'simple';
  }

  // Check for full format (has many of the full columns)
  const fullFormatIndicators = [
    'employee id',
    'role',
    'join date',
    'tax id',
    'pfa',
    'basic',
    'housing',
    'transport',
  ];
  const fullFormatMatches = fullFormatIndicators.filter((indicator) =>
    normalizedHeaders.some((h) => h.includes(indicator)),
  );

  if (fullFormatMatches.length >= 4 || headers.length >= 10) {
    return 'full';
  }

  return null;
}

/**
 * Normalize column name for matching (case-insensitive, handles variations)
 */
function normalizeColumnName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Get column value from row by matching normalized column names
 */
function getColumnValue(
  row: ParsedCsvRow,
  headers: string[],
  possibleNames: string[],
): string | undefined {
  for (const possibleName of possibleNames) {
    const normalized = normalizeColumnName(possibleName);
    for (const header of headers) {
      if (normalizeColumnName(header) === normalized) {
        return row[header]?.trim();
      }
    }
  }
  return undefined;
}

/**
 * Validate and normalize state value
 */
function validateState(state: string | undefined): {
  valid: boolean;
  value?: StateValue;
  error?: string;
} {
  if (!state || state.trim() === '') {
    return { valid: false, error: 'State is required' };
  }

  const normalized = state.trim();
  const validState = NIGERIAN_STATES.find(
    (s) => s.toLowerCase() === normalized.toLowerCase(),
  );

  if (!validState) {
    // Show first few examples to help users
    const examples = NIGERIAN_STATES.slice(0, 5).join(', ');
    return {
      valid: false,
      error: `Invalid state: "${state}". Must be a valid Nigerian state (e.g., ${examples}...). State names are case-insensitive.`,
    };
  }

  return { valid: true, value: validState };
}

/**
 * Validate and normalize PFA - accepts key, label, code, or name
 */
function validatePfa(pfa: string | undefined): {
  valid: boolean;
  value?: PfaKey;
  error?: string;
} {
  if (!pfa || pfa.trim() === '') {
    return { valid: true }; // PFA is optional
  }

  const normalized = pfa.trim().toLowerCase();
  
  // Try to find by key (lowercase)
  let foundPfa = PFAS.find((p) => p.key.toLowerCase() === normalized);
  
  // If not found by key, try by label
  if (!foundPfa) {
    foundPfa = PFAS.find((p) => p.label.toLowerCase() === normalized);
  }
  
  // If not found by label, try by code
  if (!foundPfa) {
    foundPfa = PFAS.find((p) => p.code.toLowerCase() === normalized);
  }
  
  // If not found by code, try by name (partial match)
  if (!foundPfa) {
    foundPfa = PFAS.find((p) => 
      p.name.toLowerCase().includes(normalized) ||
      normalized.includes(p.name.toLowerCase())
    );
  }

  if (!foundPfa) {
    // Show examples with different formats
    const keyExamples = PFA_KEYS.slice(0, 3).join(', ');
    const labelExamples = PFAS.slice(0, 3).map(p => p.label).join(', ');
    return {
      valid: false,
      error: `Invalid PFA: "${pfa}". Accepts key (${keyExamples}...), label (${labelExamples}...), code (033, 037...), or name.`,
    };
  }

  return { valid: true, value: foundPfa.key };
}

/**
 * Parse money value (handles commas, currency symbols, etc.)
 */
function parseMoney(value: string | undefined): {
  valid: boolean;
  amount?: string;
  error?: string;
} {
  if (!value || value.trim() === '') {
    return { valid: false, error: 'Amount is required' };
  }

  // Remove all non-numeric characters except decimal point
  const cleaned = value.replace(/[^\d.]/g, '');
  
  // Handle multiple decimal points (take first, ignore rest)
  const parts = cleaned.split('.');
  const cleanedValue = parts.length > 1 
    ? parts[0] + '.' + parts.slice(1).join('')
    : parts[0];
  
  // Reject scientific notation and other edge cases
  if (cleanedValue.includes('e') || cleanedValue.includes('E')) {
    return { valid: false, error: `Invalid amount format: "${value}". Scientific notation not supported.` };
  }
  
  const parsed = parseFloat(cleanedValue);

  if (isNaN(parsed) || parsed < 0) {
    return { valid: false, error: `Invalid amount: "${value}"` };
  }

  // Validate maximum to prevent overflow
  if (parsed > MAX_MONEY_AMOUNT) {
    return { 
      valid: false, 
      error: `Amount too large: "${value}". Maximum is ${MAX_MONEY_AMOUNT.toLocaleString()}` 
    };
  }

  return { valid: true, amount: parsed.toFixed(2) };
}

/**
 * Parse date value (YYYY-MM-DD format)
 */
function parseDate(value: string | undefined): {
  valid: boolean;
  date?: string;
  error?: string;
} {
  if (!value || value.trim() === '') {
    return { valid: true }; // Date is optional
  }

  const trimmed = value.trim();
  
  // Try YYYY-MM-DD format first (preferred)
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10);
    const day = parseInt(isoMatch[3], 10);
    
    // Validate month and day ranges
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return { valid: false, error: `Invalid date: "${value}". Month must be 1-12, day must be 1-31` };
    }
    
    // Validate year range
    if (year < MIN_YEAR || year > MAX_YEAR) {
      return { 
        valid: false, 
        error: `Date out of range: "${value}". Use dates between ${MIN_YEAR}-${MAX_YEAR}` 
      };
    }
    
    // Create date and verify it's valid (catches invalid dates like 2024-02-30)
    const date = new Date(year, month - 1, day);
    if (
      date.getFullYear() !== year || 
      date.getMonth() !== month - 1 || 
      date.getDate() !== day
    ) {
      return { valid: false, error: `Invalid date: "${value}" (e.g., day 30 in February)` };
    }
    
    return { valid: true, date: trimmed };
  }

  // Fallback to Date parsing for other formats
  const date = new Date(trimmed);
  if (isNaN(date.getTime())) {
    return { valid: false, error: `Invalid date format: "${value}". Use YYYY-MM-DD` };
  }

  // Validate year range for parsed date
  const year = date.getFullYear();
  if (year < MIN_YEAR || year > MAX_YEAR) {
    return { 
      valid: false, 
      error: `Date out of range: "${value}". Use dates between ${MIN_YEAR}-${MAX_YEAR}` 
    };
  }

  // Format as YYYY-MM-DD
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return { valid: true, date: `${year}-${month}-${day}` };
}

/**
 * Parse month key (YYYY-MM format)
 */
function parseMonthKey(value: string | undefined): {
  valid: boolean;
  monthKey?: string;
  error?: string;
} {
  if (!value || value.trim() === '') {
    return { valid: true }; // Optional
  }

  // Try to parse YYYY-MM format
  const match = value.trim().match(/^(\d{4})-(\d{1,2})$/);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    if (year >= 2000 && year <= 2100 && month >= 1 && month <= 12) {
      return {
        valid: true,
        monthKey: `${year}-${String(month).padStart(2, '0')}`,
      };
    }
  }

  return {
    valid: false,
    error: `Invalid month format: "${value}". Use YYYY-MM (e.g., 2024-01)`,
  };
}

/**
 * Parse simple format CSV row
 */
function parseSimpleFormatRow(
  row: ParsedCsvRow,
  headers: string[],
  csvRowNumber: number,
  fromMonth: string,
): { employee?: EmployeeRecord; errors: CsvRowError[] } {
  const errors: CsvRowError[] = [];

  // Get required fields
  const name = getColumnValue(row, headers, ['Name', 'Full Name', 'Employee Name']);
  const role = getColumnValue(row, headers, ['Role', 'Position', 'Job Title']);
  const state = getColumnValue(row, headers, ['State', 'State of Employment']);
  const taxId = getColumnValue(row, headers, ['Tax ID', 'TaxID', 'TIN']);
  const periodType = getColumnValue(row, headers, [
    'Period Type',
    'Period',
    'Type',
  ]);
  const grossSalary = getColumnValue(row, headers, [
    'Gross Salary',
    'Gross',
    'Monthly Gross',
    'Annual Gross',
  ]);
  const basic = getColumnValue(row, headers, ['Basic', 'Basic Salary']);
  const housing = getColumnValue(row, headers, ['Housing', 'Housing Allowance']);
  const transport = getColumnValue(row, headers, [
    'Transport',
    'Transport Allowance',
  ]);

  // Validate name
  if (!name || name.trim() === '') {
    errors.push({
      row: csvRowNumber,
      column: 'Name',
      message: 'Name is required',
    });
  }

  // Validate state
  const stateResult = validateState(state);
  if (!stateResult.valid) {
    errors.push({
      row: csvRowNumber,
      column: 'State',
      message: stateResult.error || 'Invalid state',
      value: state,
    });
  }

  // Validate period type
  const normalizedPeriodType = periodType?.trim().toLowerCase();
  if (
    normalizedPeriodType &&
    normalizedPeriodType !== 'monthly' &&
    normalizedPeriodType !== 'annual'
  ) {
    errors.push({
      row: csvRowNumber,
      column: 'Period Type',
      message: 'Period Type must be "monthly" or "annual"',
      value: periodType,
    });
  }

  // Parse BHT components
  const basicResult = basic ? parseMoney(basic) : { valid: true, amount: '0' };
  const housingResult = housing
    ? parseMoney(housing)
    : { valid: true, amount: '0' };
  const transportResult = transport
    ? parseMoney(transport)
    : { valid: true, amount: '0' };

  if (basic && !basicResult.valid) {
    errors.push({
      row: csvRowNumber,
      column: 'Basic',
      message: basicResult.error || 'Invalid basic salary',
      value: basic,
    });
  }
  if (housing && !housingResult.valid) {
    errors.push({
      row: csvRowNumber,
      column: 'Housing',
      message: housingResult.error || 'Invalid housing allowance',
      value: housing,
    });
  }
  if (transport && !transportResult.valid) {
    errors.push({
      row: csvRowNumber,
      column: 'Transport',
      message: transportResult.error || 'Invalid transport allowance',
      value: transport,
    });
  }

  // Calculate BHT sum
  const basicNum = parseFloat(basicResult.amount || '0');
  const housingNum = parseFloat(housingResult.amount || '0');
  const transportNum = parseFloat(transportResult.amount || '0');
  const bhtSum = basicNum + housingNum + transportNum;

  // Parse and validate gross salary
  let grossNum = 0;
  let hasGross = false;
  
  // Validate gross salary if provided
  if (grossSalary) {
    const grossResult = parseMoney(grossSalary);
    if (!grossResult.valid) {
      errors.push({
        row: csvRowNumber,
        column: 'Gross Salary',
        message: grossResult.error || 'Invalid gross salary',
        value: grossSalary,
      });
    } else {
      grossNum = parseFloat(grossResult.amount!);
      hasGross = true;
    }
  }

  // Validate: if Gross is provided, it must be >= sum of BHT
  if (hasGross && bhtSum > 0 && grossNum < bhtSum) {
    errors.push({
      row: csvRowNumber,
      column: 'Gross Salary',
      message: `Gross Salary (${grossNum.toLocaleString()}) must be greater than or equal to the sum of Basic, Housing, and Transport (${bhtSum.toLocaleString()})`,
      value: grossSalary,
    });
  }

  // Must have either Gross or BHT components
  if (!hasGross && bhtSum === 0) {
    errors.push({
      row: csvRowNumber,
      message:
        'Either Gross Salary or Basic/Housing/Transport components must be provided',
    });
  }

  // If there are errors, return them
  if (errors.length > 0) {
    return { errors };
  }

  // Determine if amounts are monthly or annual
  const isMonthly =
    normalizedPeriodType === 'monthly' ||
    (!normalizedPeriodType && grossNum > 0 && grossNum < ANNUAL_SALARY_THRESHOLD);

  // Calculate annual gross
  let annualGross: string;
  let annualBasic: string | undefined;
  let annualHousing: string | undefined;
  let annualTransport: string | undefined;

  if (hasGross) {
    // Use provided gross, convert to annual if monthly
    annualGross = isMonthly
      ? (grossNum * 12).toFixed(2)
      : grossNum.toFixed(2);
  } else {
    // Calculate from BHT components
    const monthlyGross = bhtSum;
    annualGross = isMonthly
      ? (monthlyGross * 12).toFixed(2)
      : monthlyGross.toFixed(2);
  }

  // Convert BHT to annual if provided
  if (basicNum > 0) {
    annualBasic = isMonthly ? (basicNum * 12).toFixed(2) : basicNum.toFixed(2);
  }
  if (housingNum > 0) {
    annualHousing = isMonthly
      ? (housingNum * 12).toFixed(2)
      : housingNum.toFixed(2);
  }
  if (transportNum > 0) {
    annualTransport = isMonthly
      ? (transportNum * 12).toFixed(2)
      : transportNum.toFixed(2);
  }

  // Create employee record
  const employee = makeNewEmployeeRecord({
    id: generateId(),
    fullName: name!.trim(),
    state: stateResult.value,
    annualGross,
    fromMonth,
  });

  // Add optional fields
  if (role) {
    employee.identity.role = role.trim();
  }
  if (taxId) {
    employee.identity.taxId = taxId.trim();
  }

  // Add BHT breakdown if provided
  if (annualBasic || annualHousing || annualTransport) {
    const compensation = employee.payProfile.compensationHistory[0];
    if (annualBasic) {
      compensation.annualBasic = annualBasic;
    }
    if (annualHousing) {
      compensation.annualHousing = annualHousing;
    }
    if (annualTransport) {
      compensation.annualTransport = annualTransport;
    }
  }

  return { employee, errors: [] };
}

/**
 * Parse full format CSV row
 */
function parseFullFormatRow(
  row: ParsedCsvRow,
  headers: string[],
  csvRowNumber: number,
  fromMonth: string,
): { employee?: EmployeeRecord; errors: CsvRowError[] } {
  const errors: CsvRowError[] = [];

  // Get all fields
  const employeeId = getColumnValue(row, headers, ['Employee ID', 'EmployeeID']);
  const name = getColumnValue(row, headers, ['Name', 'Full Name', 'Employee Name']);
  const role = getColumnValue(row, headers, ['Role', 'Position', 'Job Title']);
  const joinDate = getColumnValue(row, headers, ['Join Date', 'JoinDate', 'Start Date']);
  const exitDate = getColumnValue(row, headers, ['Exit Date', 'ExitDate', 'End Date']);
  const state = getColumnValue(row, headers, ['State', 'State of Employment']);
  const taxId = getColumnValue(row, headers, ['Tax ID', 'TaxID', 'TIN']);
  const pfa = getColumnValue(row, headers, ['PFA', 'Pension Fund Administrator']);
  const rsaPin = getColumnValue(row, headers, ['RSA PIN', 'RSAPIN', 'RSA Pin']);
  // Note: NHF and NHIS are extracted but not used in employee record creation
  // They are typically set per payroll run, not per employee
  const rent = getColumnValue(row, headers, ['Rent', 'Monthly Rent']);
  const rentPeriod = getColumnValue(row, headers, ['Rent Period', 'RentPeriod']);
  const basic = getColumnValue(row, headers, ['Basic', 'Basic Salary']);
  const housing = getColumnValue(row, headers, ['Housing', 'Housing Allowance']);
  const transport = getColumnValue(row, headers, [
    'Transport',
    'Transport Allowance',
  ]);
  const otherAllowances = getColumnValue(row, headers, [
    'Other Allowances',
    'Other',
    'Others',
  ]);
  const grossSalary = getColumnValue(row, headers, [
    'Gross Salary',
    'Gross',
    'Monthly Gross',
    'Annual Gross',
  ]);

  // Validate required fields
  if (!name || name.trim() === '') {
    errors.push({
      row: csvRowNumber,
      column: 'Name',
      message: 'Name is required',
    });
  }

  // Validate gross salary (use gross salary if provided, otherwise calculate from components)
  let annualGross: string | undefined;
  if (grossSalary) {
    const grossResult = parseMoney(grossSalary);
    if (!grossResult.valid) {
      errors.push({
        row: csvRowNumber,
        column: 'Gross Salary',
        message: grossResult.error || 'Invalid gross salary',
        value: grossSalary,
      });
    } else {
      annualGross = grossResult.amount!;
      // Convert monthly to annual if needed
      const grossNum = parseFloat(annualGross);
      if (grossNum < ANNUAL_SALARY_THRESHOLD) {
        annualGross = (grossNum * 12).toFixed(2);
      }
    }
  } else if (basic || housing || transport || otherAllowances) {
    // Calculate from components
    const basicNum = parseFloat(basic?.replace(/[₦$,\s]/g, '') || '0');
    const housingNum = parseFloat(housing?.replace(/[₦$,\s]/g, '') || '0');
    const transportNum = parseFloat(transport?.replace(/[₦$,\s]/g, '') || '0');
    const otherNum = parseFloat(otherAllowances?.replace(/[₦$,\s]/g, '') || '0');
    const monthlyTotal = basicNum + housingNum + transportNum + otherNum;
    if (monthlyTotal > 0) {
      annualGross = (monthlyTotal * 12).toFixed(2);
    } else {
      errors.push({
        row: csvRowNumber,
        message: 'Either Gross Salary or salary components (Basic, Housing, Transport) must be provided',
      });
    }
  } else {
    errors.push({
      row: csvRowNumber,
      message: 'Gross Salary is required',
    });
  }

  // Validate state
  const stateResult = validateState(state);
  if (!stateResult.valid) {
    errors.push({
      row: csvRowNumber,
      column: 'State',
      message: stateResult.error || 'Invalid state',
      value: state,
    });
  }

  // Validate optional fields
  if (pfa) {
    const pfaResult = validatePfa(pfa);
    if (!pfaResult.valid) {
      errors.push({
        row: csvRowNumber,
        column: 'PFA',
        message: pfaResult.error || 'Invalid PFA',
        value: pfa,
      });
    }
  }

  if (joinDate) {
    const joinDateResult = parseDate(joinDate);
    if (!joinDateResult.valid) {
      errors.push({
        row: csvRowNumber,
        column: 'Join Date',
        message: joinDateResult.error || 'Invalid join date',
        value: joinDate,
      });
    }
  }

  if (exitDate) {
    const exitDateResult = parseDate(exitDate);
    if (!exitDateResult.valid) {
      errors.push({
        row: csvRowNumber,
        column: 'Exit Date',
        message: exitDateResult.error || 'Invalid exit date',
        value: exitDate,
      });
    }
  }

  if (rentPeriod) {
    const rentPeriodResult = parseMonthKey(rentPeriod);
    if (!rentPeriodResult.valid) {
      errors.push({
        row: csvRowNumber,
        column: 'Rent Period',
        message: rentPeriodResult.error || 'Invalid rent period',
        value: rentPeriod,
      });
    }
  }

  // If there are errors, return them
  if (errors.length > 0 || !annualGross) {
    return { errors };
  }

  // Create employee record with all fields
  const employee = makeNewEmployeeRecord({
    id: generateId(),
    fullName: name!.trim(),
    state: stateResult.value,
    annualGross,
    fromMonth,
  });

  // Add optional identity fields
  if (employeeId) {
    employee.identity.employeeId = employeeId.trim();
  }
  if (role) {
    employee.identity.role = role.trim();
  }
  if (joinDate) {
    const joinDateResult = parseDate(joinDate);
    if (joinDateResult.valid && joinDateResult.date) {
      employee.identity.joinDate = joinDateResult.date;
    }
  }
  if (exitDate) {
    const exitDateResult = parseDate(exitDate);
    if (exitDateResult.valid && exitDateResult.date) {
      employee.identity.exitDate = exitDateResult.date;
    }
  }
  if (taxId) {
    employee.identity.taxId = taxId.trim();
  }
  if (pfa) {
    const pfaResult = validatePfa(pfa);
    if (pfaResult.valid && pfaResult.value) {
      employee.identity.pfa = pfaResult.value;
    }
  }
  if (rsaPin) {
    employee.identity.rsaPin = rsaPin.trim();
  }

  // Add compensation breakdown if provided
  if (basic || housing || transport || otherAllowances) {
    const compensation = employee.payProfile.compensationHistory[0];
    if (basic) {
      const basicResult = parseMoney(basic);
      if (basicResult.valid && basicResult.amount) {
        const basicNum = parseFloat(basicResult.amount);
        compensation.annualBasic = (basicNum < ANNUAL_SALARY_THRESHOLD ? basicNum * 12 : basicNum).toFixed(2);
      }
    }
    if (housing) {
      const housingResult = parseMoney(housing);
      if (housingResult.valid && housingResult.amount) {
        const housingNum = parseFloat(housingResult.amount);
        compensation.annualHousing = (housingNum < ANNUAL_SALARY_THRESHOLD ? housingNum * 12 : housingNum).toFixed(2);
      }
    }
    if (transport) {
      const transportResult = parseMoney(transport);
      if (transportResult.valid && transportResult.amount) {
        const transportNum = parseFloat(transportResult.amount);
        compensation.annualTransport = (transportNum < ANNUAL_SALARY_THRESHOLD ? transportNum * 12 : transportNum).toFixed(2);
      }
    }
    if (otherAllowances) {
      const otherResult = parseMoney(otherAllowances);
      if (otherResult.valid && otherResult.amount) {
        const otherNum = parseFloat(otherResult.amount);
        compensation.annualOtherAllowances = (otherNum < ANNUAL_SALARY_THRESHOLD ? otherNum * 12 : otherNum).toFixed(2);
      }
    }
  }

  // Add NHF/NHIS if provided (these would be stored in run items, not employee records)
  // For now, we'll skip these as they're typically set per payroll run

  // Add rent if provided
  if (rent) {
    const rentResult = parseMoney(rent);
    if (rentResult.valid && rentResult.amount) {
      const rentNum = parseFloat(rentResult.amount);
      const monthlyRent = rentNum < ANNUAL_SALARY_THRESHOLD ? rentNum : rentNum / 12;
      const rentPeriodKey = rentPeriod
        ? parseMonthKey(rentPeriod).monthKey || fromMonth
        : fromMonth;
      
      employee.payProfile.rentHistory = [
        {
          id: generateId(),
          fromMonth: rentPeriodKey,
          toMonth: rentPeriodKey, // Default to same month, can be edited later
          rent: monthlyRent.toFixed(2),
        },
      ];
    }
  }

  return { employee, errors: [] };
}

/**
 * Parse CSV file and convert to EmployeeRecord array
 */
export function parseCsvFile(
  file: File,
  format: CsvImportFormat,
  fromMonth: string,
): Promise<CsvImportResult> {
  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    logger.warn('CSV import rejected: file too large', {
      fileName: file.name,
      fileSize: file.size,
      maxSize: MAX_FILE_SIZE,
    });
    return Promise.resolve({
      employees: [],
      errors: [
        {
          row: 0,
          message: `File is too large (${(file.size / 1024 / 1024).toFixed(2)}MB). Maximum file size is ${(MAX_FILE_SIZE / 1024 / 1024).toFixed(0)}MB.`,
        },
      ],
      warnings: [],
    });
  }

  // Validate file type
  const fileName = file.name.toLowerCase();
  const fileExtension = fileName.substring(fileName.lastIndexOf('.'));
  const isValidExtension = VALID_EXTENSIONS.includes(fileExtension);
  const isValidMimeType = file.type === '' || VALID_MIME_TYPES.includes(file.type);

  if (!isValidExtension && !isValidMimeType) {
    logger.warn('CSV import rejected: invalid file type', {
      fileName: file.name,
      fileType: file.type,
      fileExtension,
    });
    return Promise.resolve({
      employees: [],
      errors: [
        {
          row: 0,
          message: 'Invalid file type. Please upload a CSV file (.csv extension).',
        },
      ],
      warnings: [],
    });
  }

  logger.info('CSV import started', {
    fileName: file.name,
    fileSize: file.size,
    format,
    fromMonth,
  });

  return new Promise((resolve) => {
    try {
      Papa.parse<ParsedCsvRow>(file, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.trim(),
        complete: (results) => {
          const errors: CsvRowError[] = [];
          const employees: EmployeeRecord[] = [];
          const warnings: string[] = [];

          // Check for parsing errors
          if (results.errors.length > 0) {
            logger.warn('CSV parsing errors detected', {
              errorCount: results.errors.length,
              errors: results.errors.slice(0, 5), // Log first 5 errors
            });
            results.errors.forEach((error) => {
              errors.push({
                row: error.row ?? 0,
                message: error.message || 'CSV parsing error',
              });
            });
          }

          // Get headers
          const headers = results.meta.fields || [];
          if (headers.length === 0) {
            logger.error('CSV import failed: no headers found');
            resolve({
              employees: [],
              errors: [{ row: 0, message: 'CSV file has no headers' }],
              warnings: [],
            });
            return;
          }

          // Auto-detect format if not specified (for validation)
          const detectedFormat = detectCsvFormat(headers);
          if (detectedFormat && detectedFormat !== format) {
            warnings.push(
              `Detected format "${detectedFormat}" but using "${format}". Please verify your data matches the selected format.`,
            );
            logger.info('CSV format mismatch detected', {
              detected: detectedFormat,
              selected: format,
            });
          }

          // Parse each row
          // Track actual CSV row number (accounting for header row = row 1)
          // Header is row 0, first data row is row 1
          let csvRowNumber = 1; // Start at 1 (will be incremented before processing first row)
          
          results.data.forEach((row) => {
            // Skip completely empty rows
            const hasData = Object.values(row).some(
              (value) => value && value.toString().trim() !== '',
            );
            if (!hasData) {
              return;
            }

            // Skip comment rows (rows where first column starts with "#")
            const firstValue = Object.values(row)[0];
            if (firstValue && firstValue.toString().trim().startsWith('#')) {
              return;
            }

            // Skip reference rows (rows where first column is "REFERENCE")
            const firstColumnValue = Object.values(row)[0]?.toString().trim().toUpperCase();
            if (firstColumnValue === 'REFERENCE') {
              return;
            }

            // Increment row number AFTER skip checks, BEFORE processing
            // This ensures skipped rows don't affect row numbering
            csvRowNumber++;

            let parseResult: { employee?: EmployeeRecord; errors: CsvRowError[] };
            if (format === 'simple') {
              parseResult = parseSimpleFormatRow(row, headers, csvRowNumber, fromMonth);
            } else {
              parseResult = parseFullFormatRow(row, headers, csvRowNumber, fromMonth);
            }

            if (parseResult.errors.length > 0) {
              errors.push(...parseResult.errors);
            } else if (parseResult.employee) {
              employees.push(parseResult.employee);
            }
          });

          // Check if we have any valid employees after parsing
          if (employees.length === 0 && errors.length === 0) {
            warnings.push('No valid employee data found in CSV file. Please check your file format.');
            logger.warn('CSV import: no valid employees found');
          }

          // Limit number of employees
          if (employees.length > MAX_EMPLOYEES) {
            logger.warn('CSV import: too many employees', {
              count: employees.length,
              max: MAX_EMPLOYEES,
            });
            errors.push({
              row: 0,
              message: `Too many employees (${employees.length}). Maximum ${MAX_EMPLOYEES} employees per import. Please split your file into smaller batches.`,
            });
            // Truncate to max
            employees.splice(MAX_EMPLOYEES);
          }

          logger.info('CSV import completed', {
            employeeCount: employees.length,
            errorCount: errors.length,
            warningCount: warnings.length,
          });

          resolve({ employees, errors, warnings });
        },
        error: (error) => {
          logger.error('CSV parsing failed', error, {
            fileName: file.name,
            format,
          });
          resolve({
            employees: [],
            errors: [{ row: 0, message: `Failed to parse CSV: ${error.message}` }],
            warnings: [],
          });
        },
      });
    } catch (error) {
      logger.error('Unexpected error during CSV import', error, {
        fileName: file.name,
        format,
      });
      resolve({
        employees: [],
        errors: [
          { 
            row: 0, 
            message: `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}` 
          },
        ],
        warnings: [],
      });
    }
  });
}
