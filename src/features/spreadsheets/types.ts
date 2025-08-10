export interface SpreadsheetImporterField {
  label: string;
  value: string;
  required?: boolean;
  possibleFields?: string[];

  className?: string;

  render?: (
    value: any,
    row: any,
    index?: number,
    options?: any
  ) => React.ReactNode;

  align?: "left" | "center" | "right";
  width?: string;
}

export type SpreadsheetAcceptType = "csv" | "xls" | "xlsx";

export type SpreadsheetImporterProps = {
  /**
   * The fields (schema) expected in the spreadsheet.
   * Each includes a label, value, and optional required flag.
   * @example fields={[{ label: 'Name', value: 'name', required: true }, { label: 'Email', value: 'email' }]}
   */
  fields: SpreadsheetImporterField[];

  /**
   * Accepted file types for the uploader.
   * @type { [key: string]: string[]}
   * @default
   * ```ts
   * { "image/*": [] }
   * ```
   * @example accept={["image/png", "image/jpeg"]}
   */
  accept?: SpreadsheetAcceptType[];

  /** Disables the file uploader when true. Default: false */
  uploaderDisabled?: boolean;

  /**
   * Callback called when CSV parsing is complete.
   * Receives an array of parsed records.
   * @example onParsed={(data) => console.log('Parsed data:', data)}
   */
  onParsed: (data: ParsedCsvResult[]) => void;

  /**
   * Optional server upload function. If provided, files will be uploaded
   * to your server before being parsed locally.
   * @example onServerUpload={async (files) => await uploadToS3(files)}
   */
  onServerUpload?: (files: File[]) => Promise<void>;

  /**
   * Optional error callback if parsing or validation fails.
   * @example onError={(message) => alert(message)}
   */
  onError?: (message: string) => void;

  /**
   * Optional: Maximum allowed rows to import (default: Infinity).
   * @example maxRows={1000}
   */
  maxRows?: number;

  /**
   * Maximum file size allowed in megabytes.
   * @default 2
   * @example maxFileSizeInMB={5}
   */
  maxFileSizeInMB?: number;

  /**
   * Maximum number of files that can be uploaded when uploadMultiple is true.
   * Only applies when uploadMultiple is enabled.
   * @example maxFileCount={3}
   */
  maxFileCount?: number;

  /**
   * Whether to allow multiple file uploads.
   * @default false
   * @example uploadMultiple={true}
   */
  uploadMultiple?: boolean;

  /**
   * Additional CSS classes to apply to the uploader component.
   * @example uploaderClassName="border-dashed border-2"
   */
  uploaderClassName?: string;

  /**
   * If true, renders as a dialog with a trigger button.
   * If false, renders inline (default: false).
   * @default false
   * @example useDialog={true}
   */
  useDialog?: boolean;

  /**
   * Label for the import button or dialog trigger.
   * @default "Import CSV"
   * @example buttonLabel="Upload Data"
   */
  buttonLabel?: string;

  /**
   * Header text for the dialog when useDialog is true.
   * If not provided, defaults to "Upload CSV".
   * @example dialogHeader="Import Your Data"
   */
  dialogHeader?: string;

  /**
   * Additional CSS classes to apply to the dialog trigger button.
   * Only applies when useDialog is true.
   * @example buttonClassName="bg-blue-500 hover:bg-blue-600"
   */
  buttonClassName?: string;

  wrapperClassName?: string;

  /** */
  hasHeader?: boolean;

  validateHeaders?: boolean;

  showFileCard?: boolean;

  previewRowCount?: number;

  showCustomFileCard?: boolean;

  showAllFields?: boolean;

  showUnexpectedColumnsWarning?: boolean;

  fileCardClassName?: string;
  fileCardContentClassName?: string;
  fileCardContainerClassName?: string;
} & ValidateHeadersOptions;

export interface ParsedCsvResult {
  file: File;

  data: Record<string, unknown>[];
  preview: Record<string, unknown>[];

  rowCount: number;

  headers?: string[];
  meta?: any;

  error?: string;
  warning?: string;
  unexpectedColumns?: string[];

  rawErrors?: any[];
  rowErrors?: { [row: number]: string[] };

  duplicateHeaders?: string[];

  isValid?: boolean;
}

export interface ParseCsvOptions {
  file: File;
  hasHeader?: boolean;
  limit?: number;
  previewRowCount?: number;
  dynamicTyping?: boolean;
  encoding?: string;
  showEmptyFields?: boolean;
}

export type FileCardExtraProps = {
  // file: File;
  // index: number;
  // hasHeader?: boolean;
  fields?: SpreadsheetImporterField[];
  parsedResult?: ParsedCsvResult;
  showAllFields?: boolean;
  renderOptions?: any;
  showUnexpectedColumnsWarning?: boolean;
};

export type ValidateHeadersOptions = {
  requireAllExpectedHeaders?: boolean;
  rejectUnexpectedColumns?: boolean;
};

export type ValidateHeadersResult = {
  error: string | null;
  warning: string | null;
  unexpectedColumns?: string[];
  duplicateHeaders?: string[];
  isValid: boolean; // Helper to know if validation passed
};
