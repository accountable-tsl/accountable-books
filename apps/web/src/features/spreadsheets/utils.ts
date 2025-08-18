import * as XLSX from 'xlsx';
import Papa, { ParseResult } from 'papaparse';
import {
  ParseCsvOptions,
  ParsedCsvResult,
  SpreadsheetAcceptType,
  SpreadsheetImporterField,
  ValidateHeadersOptions,
  ValidateHeadersResult,
} from '@/features/spreadsheets/types';
import { FILE_TYPE_MAP } from './constants';
export function isSpreadsheetFile(file: File) {
  const spreadsheetTypes = [
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.oasis.opendocument.spreadsheet',
    'text/csv',
  ];
  const extensions = ['.xls', '.xlsx', '.ods', '.csv'];
  const name = file.name.toLowerCase();
  return spreadsheetTypes.includes(file.type) || extensions.some((ext) => name.endsWith(ext));
}

export const countCsvRows = async (file: File) => {
  try {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((line) => {
      const values = line.split(',');
      return values.some((v) => v.trim() !== '');
    });
    return lines.length;
  } catch {
    return 0;
  }
};

const countExcelRows = async (file: File) => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }); // array of arrays

    const nonEmptyRows = data.filter((row) =>
      Array.isArray(row)
        ? row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== '')
        : false,
    );

    return nonEmptyRows.length;
  } catch {
    return 0;
  }
};

export const getSpreadsheetRowCount = async (
  file: File,
  hasHeader: boolean = true,
): Promise<number> => {
  const fileName = file.name.toLowerCase();

  if (fileName.endsWith('.csv')) {
    const rowCount = await countCsvRows(file);
    return hasHeader ? Math.max(0, rowCount - 1) : rowCount;
  }
  if (fileName.endsWith('.xls') || fileName.endsWith('.xlsx')) {
    const rowCount = await countExcelRows(file);
    return hasHeader ? Math.max(0, rowCount - 1) : rowCount;
  }

  return 0;
};

export const isValidFile = (file: File, accept: SpreadsheetAcceptType[]) => {
  const fileName = file.name.toLowerCase();
  const fileType = file.type.toLowerCase();
  return accept.some((type) => {
    const meta = FILE_TYPE_MAP[type];
    return (
      meta &&
      (meta.ext.some((ext) => fileName.endsWith(ext)) ||
        meta.mime.some((mime) => fileType.includes(mime)))
    );
  });
};

/**
 * Robustly parses a CSV file and returns a detailed result.
 *
 * @param {Object} options
 * @param {File} options.file - The File object to parse.
 * @param {boolean} [options.hasHeader=true] - Whether the CSV has a header row.
 * @param {number} [options.limit=Infinity] - Maximum number of rows to parse.
 * @param {number} [options.previewRowCount=0] - Number of preview rows to capture.
 * @param {boolean} [options.showEmptyFields=false] - Whether to keep empty columns.
 * @param {boolean} [options.dynamicTyping=true] - Whether to convert values to numbers/dates automatically.
 * @param {string} [options.encoding] - File encoding (optional).
 * @returns {Promise<ParsedCsvResult>} Parsed CSV result object with data, preview, headers, errors, and meta.
 */
export function parseCsvFile({
  file,
  hasHeader = true,
  limit = Infinity,
  previewRowCount = 0,
  showEmptyFields = false,
  dynamicTyping = true,
  encoding,
}: ParseCsvOptions): Promise<ParsedCsvResult> {
  return new Promise((resolve) => {
    const allData: Record<string, unknown>[] = [];
    const preview: Record<string, unknown>[] = [];

    let rowCount = 0;

    let headers: string[] | undefined = undefined;
    let meta: any = undefined;

    let error: string | undefined = undefined;
    const rawErrors: any[] = [];
    const rowErrors: { [row: number]: string[] } = {};

    Papa.parse(file, {
      header: hasHeader,
      skipEmptyLines: true,
      dynamicTyping,
      encoding,

      /**
       * Cleans and standardizes headers before parsing.
       * Trims, renames empties, optionally removes empty columns.
       */
      beforeFirstChunk: hasHeader
        ? (chunk) => {
            // Parse just the first chunk as a raw row array (no headers)
            const parsedChunk = Papa.parse<string[]>(chunk, {
              header: false,
              skipEmptyLines: true,
            });

            const rows = parsedChunk.data;
            const rawHeaders = rows[0] ?? [];

            headers = rawHeaders
              .map((col, index) => {
                const trimmed = col?.toString().trim() ?? '';
                if (trimmed === '') {
                  if (!showEmptyFields) return null;
                  return `Field ${index + 1}`;
                }
                return trimmed;
              })
              .filter((col): col is string => col !== null);

            // Replace the original header row with cleaned version
            rows[0] = headers;

            // Convert back to a string so PapaParse can continue parsing
            return Papa.unparse(rows);
          }
        : undefined,

      /**
       * Handles each row as it's parsed.
       * Applies row limit, captures errors and data.
       */
      step: (results, parser) => {
        // If the row limit is hit, abort parsing
        if (rowCount >= limit) {
          error = `File exceeds maximum of ${limit} rows`;
          parser.abort();
          return;
        }

        // If this row has errors, collect them
        if (results.errors && results.errors.length > 0) {
          results.errors.forEach((err) => {
            rawErrors.push(err);
            if (typeof err.row === 'number') {
              if (!rowErrors[err.row]) rowErrors[err.row] = [];
              rowErrors[err.row].push(err.message);
            }
          });
        }

        // ✅ Skip fully empty rows (all null, undefined, or empty string)
        const isCompletelyEmpty = Object.values(results.data).every(
          (v) => v === null || v === undefined || v === '',
        );
        if (isCompletelyEmpty) return;

        // Store row if data is present and not empty
        if (results.data && Object.keys(results.data).length > 0) {
          allData.push(results.data);
          if (preview.length < previewRowCount) preview.push(results.data);
          rowCount++;
        }
      },

      /**
       * Handles completion: captures meta, headers, and all errors.
       */
      complete: (results: ParseResult<Record<string, unknown>>, fileObj: File) => {
        meta = results.meta;

        // Get headers if available (and header mode was used)
        if (!headers && hasHeader && Array.isArray(results.meta.fields)) {
          headers = results.meta.fields;
        }

        // Catch parse errors (bad delimiter, malformed input, etc)
        if (results.errors && results.errors.length > 0) {
          results.errors.forEach((err) => {
            rawErrors.push(err);
            if (typeof err.row === 'number') {
              if (!rowErrors[err.row]) rowErrors[err.row] = [];
              rowErrors[err.row].push(err.message);
            }
          });

          // Set a generic error if there were any fatal errors
          if (!error) {
            // If there is at least one "Delimiter" or "TooFewFields" error, treat as global error
            const fatal = rawErrors.find(
              (e) =>
                ['Delimiter', 'TooFewFields', 'TooManyFields'].includes(e.code ?? '') ||
                e.type === 'Quotes',
            );

            if (fatal) {
              error = fatal.message;
            }
          }
        }

        resolve({
          file: fileObj,
          data: allData,
          preview,
          rowCount: allData.length,
          headers,
          meta,
          error,
          rawErrors,
          rowErrors,
          isValid: !error && allData.length > 0,
        });
      },
      error: (err, fileObj) => {
        resolve({
          file: fileObj || file,
          data: [],
          preview: [],
          rowCount: 0,
          headers: undefined,
          meta: undefined,
          error: err.message,
          rawErrors: [err],
          rowErrors: {},
          isValid: false,
        });
      },
    });
  });
}

export const parseSpreadsheetFile = (options: ParseCsvOptions) => {
  const extension = options.file.name.toLowerCase().split('.').pop();
  switch (extension) {
    case 'csv':
      return parseCsvFile(options);

    // TODO: Add support for other spreadsheet types
    // TODO: Maybe switch to exceljs instead of sheetjs
    // case "xlsx":
    // case "xls":
    //   return parseWithSheetJS(file, options);

    default:
      throw new Error(`Unsupported file type: ${extension}`);
  }
};

export const handleLargeFileStream = async ({
  file,
  hasHeader = true,
  maxRows = 1000,
}: {
  file: File;
  hasHeader?: boolean;
  maxRows?: number;
}) => {
  const CHUNK_SIZE = 100; // Process in chunks of 100 rows
  let processedRows = 0;

  return new Promise<ParsedCsvResult>((resolve) => {
    let buffer: any[] = [];

    Papa.parse(file, {
      header: hasHeader,
      skipEmptyLines: true,
      dynamicTyping: true,

      step: (results, parser) => {
        buffer.push(results.data);

        // Process in chunks to avoid blocking UI
        if (buffer.length >= CHUNK_SIZE) {
          setTimeout(() => {
            // Process chunk (could send to server here)
            processedRows += buffer.length;
            buffer = [];

            if (processedRows >= maxRows) {
              parser.abort();
            }
          }, 0);
        }
      },

      complete: () => {
        // Process remaining buffer
        if (buffer.length > 0) {
          processedRows += buffer.length;
        }

        resolve({
          file,
          data: [], // For large files, don't store all data in memory
          preview: [], // Get preview separately
          rowCount: processedRows,
        });
      },
    });
  });
};

export const validateHeaders = (
  fileHeaders: string[] | undefined,
  fields: SpreadsheetImporterField[],
  opts: ValidateHeadersOptions = {},
): ValidateHeadersResult => {
  if (!fileHeaders)
    return {
      error: 'No headers found in file.',
      warning: null,
      isValid: false,
    };

  const { requireAllExpectedHeaders = false, rejectUnexpectedColumns = false } = opts;

  // Collect all issues
  const errors: string[] = [];
  const warnings: string[] = [];
  let duplicateHeaders: string[] = [];
  let unexpectedColumns: string[] = [];

  // Check for duplicates
  duplicateHeaders = getDuplicateColumns(fileHeaders);
  if (duplicateHeaders.length > 0) {
    // Find original header names for the duplicates
    const originalDuplicates = duplicateHeaders
      .map((normalized) =>
        fileHeaders.find((original) => original.trim().toLowerCase() === normalized),
      )
      .filter(Boolean) as string[];

    errors.push(`Duplicate headers found: ${originalDuplicates.join(', ')}`);
    duplicateHeaders = originalDuplicates;
  }

  // Normalize headers for field matching
  const normalizedFileHeaders = fileHeaders.map((h) => h.trim().toLowerCase());

  // Helper function to check if a field matches any file header
  const fieldMatchesHeaders = (field: SpreadsheetImporterField): boolean => {
    const possibilities = field.possibleFields ?? [field.label, field.value];
    return possibilities.some((header) =>
      normalizedFileHeaders.includes(header.trim().toLowerCase()),
    );
  };

  // Check for missing required fields
  const missingRequired = fields
    .filter((f) => f.required)
    .filter((f) => !fieldMatchesHeaders(f))
    .map((f) => f.label);

  if (missingRequired.length > 0) {
    errors.push(`Missing required columns: ${missingRequired.join(', ')}`);
  }

  // Check for missing optional/expected fields
  const missingOptional = fields
    .filter((f) => !f.required)
    .filter((f) => !fieldMatchesHeaders(f))
    .map((f) => f.label);

  if (requireAllExpectedHeaders && missingOptional.length > 0) {
    errors.push(`Missing expected columns: ${missingOptional.join(', ')}`);
  } else if (missingOptional.length > 0) {
    warnings.push(`Missing optional columns: ${missingOptional.join(', ')}`);
  }

  // Check for unexpected columns
  const allPossibleHeaders = fields
    .flatMap((f) => f.possibleFields ?? [f.label, f.value])
    .map((h) => h.trim().toLowerCase());

  unexpectedColumns = fileHeaders.filter(
    (h) => !allPossibleHeaders.includes(h.trim().toLowerCase()),
  );

  if (rejectUnexpectedColumns && unexpectedColumns.length > 0) {
    errors.push(`Unexpected columns found: ${unexpectedColumns.join(', ')}`);
  } else if (unexpectedColumns.length > 0) {
    warnings.push(`Unexpected columns found: ${unexpectedColumns.join(', ')}`);
  }

  // Combine all errors and warnings
  const finalError = errors.length > 0 ? errors.join('; ') : null;
  const finalWarning = warnings.length > 0 ? warnings.join('; ') : null;

  return {
    error: finalError,
    warning: finalWarning,
    isValid: errors.length === 0, // No errors means validation passed
    ...(unexpectedColumns.length > 0 ? { unexpectedColumns } : {}),
    ...(duplicateHeaders.length > 0 ? { duplicateHeaders } : {}),
  };
};

export const getDuplicateColumns = (headers: string[] = []) => {
  const normalized = headers.map((h) => h.trim().toLowerCase());
  const counts = normalized.reduce(
    (acc, h) => {
      acc[h] = (acc[h] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  return Object.keys(counts).filter((key) => counts[key] > 1);
};

export const normalizeRow = (
  row: Record<string, any>,
  fields: SpreadsheetImporterField[],
): Record<string, any> => {
  const result: Record<string, any> = {};
  for (const field of fields) {
    const possibilities = field.possibleFields ?? [field.label, field.value];
    for (const possible of possibilities) {
      for (const key of Object.keys(row)) {
        if (key.trim().toLowerCase() === possible.trim().toLowerCase()) {
          result[field.value] = row[key];
          break;
        }
      }
      if (result[field.value] !== undefined) break;
    }
  }
  return result;
};

export const getDisplayFields = ({
  fields,
  parsedHeaders,
  showAllFields = false,
}: {
  fields: SpreadsheetImporterField[];
  parsedHeaders: string[] | undefined;
  showAllFields?: boolean;
}) => {
  if (showAllFields) return fields;

  if (!parsedHeaders) return fields.filter((f) => f.required); // fallback

  const normalizedHeaders = parsedHeaders.map((h) => h.trim().toLowerCase());

  return fields.filter((f) => {
    if (f.required) return true;
    // If not required, only include if present in the file
    const possible = f.possibleFields ?? [f.label, f.value];
    return possible.some((p) => normalizedHeaders.includes(p.trim().toLowerCase()));
  });
};

type FieldValidationError = {
  field: string;
  message: string;
};

type RowValidationResult = {
  isValid: boolean;
  errors: FieldValidationError[];
};

export function validateRow(
  row: Record<string, any>,
  fields: SpreadsheetImporterField[],
): RowValidationResult {
  const errors: FieldValidationError[] = [];

  for (const field of fields) {
    const key = field.value;

    if (
      field.required &&
      (row[key] === null || row[key] === undefined || row[key]?.toString().trim() === '')
    ) {
      errors.push({
        field: key,
        message: `${field.label} is required.`,
      });
    }

    // You can add more validation rules per field here (e.g., regex, enum, number checks)
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
