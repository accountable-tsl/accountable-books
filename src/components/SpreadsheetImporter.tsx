import { parseCsvFile, useParseCsv } from "@/features/spreadsheets/hooks";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { FileUploader } from "@/components/FileUploader";

export interface SpreadsheetImporterField {
  /** Field display label shown to the user. */
  label: string;
  /** Key identifying the field in the imported data. */
  value: string;
  /** Optional flag indicating if the field is required. Default: false */
  required?: boolean;
}

type SpreadsheetAcceptType = "csv" | "xls" | "xlsx";

export interface SpreadsheetImporterProps {
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
  onParsed: (data: Record<string, unknown>[]) => void;

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

  /** */
  hasHeader?: boolean;

  showFileCard?: boolean;
}

export const SpreadsheetImporter = ({
  fields,
  accept = ["csv", "xls", "xlsx"],
  onParsed,
  onServerUpload,
  onError,
  uploaderDisabled = false,
  uploaderClassName,
  uploadMultiple = false,
  maxRows = 1000,
  maxFileSizeInMB = 2,
  maxFileCount,
  useDialog = false,
  dialogHeader,
  buttonLabel = "Import CSV",
  buttonClassName,
  hasHeader = true,
  showFileCard = true,
  ...props
}: SpreadsheetImporterProps) => {
  const { onParse, getSanitizedData } = useParseCsv({
    fields,
    onSuccess: (parsedData) => onParsed(getSanitizedData({ data: parsedData })),
    onError,
  });

  const maxSizeInBytes = maxFileSizeInMB * 1024 * 1024;
  const effectiveMaxFileCount = uploadMultiple ? maxFileCount : 1;
  const effectiveAccept = accept.reduce((acc, type) => {
    const meta = FILE_TYPE_MAP[type];
    if (meta) {
      meta.mime.forEach((m) => (acc[m] = meta.ext));
    }
    return acc;
  }, {} as Record<string, string[]>);

  const acceptText = accept
    .map((type) => FILE_TYPE_MAP[type]?.label)
    .filter(Boolean)
    .join(", ");

  const isValid = (file: File) => {
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

  const validateFile = (file: File): string | null => {
    const isValidFile = isValid(file);
    if (!isValidFile) {
      return "Please select a valid file type";
    }

    if (file.size > maxSizeInBytes) {
      return `File size exceeds ${maxFileSizeInMB}MB limit`;
    }

    return null;
  };

  const handleFileSelection = async (files: File[]) => {
    if (!files.length) {
      onError?.("No files selected");
      return;
    }

    // Validate all files first
    for (const file of files) {
      const validationError = validateFile(file);
      if (validationError) {
        onError?.(validationError);
        return;
      }
    }

    if (files.length === 1) {
      onParse({ file: files[0], limit: maxRows });
      return;
    }

    try {
      const allParsedData = [];
      for (const file of files) {
        const parsedData = await parseCsvFile(file, {
          /*options if needed*/
        });
        allParsedData.push(...parsedData);
      }
      onParsed(allParsedData);
    } catch (error) {
      onError?.(
        error instanceof Error ? error.message : "Failed to process files"
      );
    }
  };

  /**
   * Handles server upload if provided, then parses the file.
   * This is called by FileUploader's onUpload prop.
   */
  const handleServerUploadAndParse = async (files: File[]) => {
    if (!onServerUpload || !files.length) return;

    const file = files[0];
    if (!file) return;

    for (const file of files) {
      const validationError = validateFile(file);
      if (validationError) {
        onError?.(validationError);
        return;
      }
    }

    try {
      await onServerUpload(files);

      // Then parse locally for immediate use
      await handleFileSelection(files);
    } catch (error) {
      onError?.(error instanceof Error ? error.message : "Upload failed");
    }
  };

  const uploaderComponent = (
    <FileUploader
      accept={effectiveAccept}
      acceptText={acceptText}
      maxRows={maxRows}
      multiple={uploadMultiple}
      maxSize={maxSizeInBytes}
      maxFileCount={effectiveMaxFileCount}
      className={uploaderClassName ?? ""}
      disabled={uploaderDisabled}
      onUpload={onServerUpload ? handleServerUploadAndParse : undefined}
      onValueChange={onServerUpload ? undefined : handleFileSelection}
      {...props}
    />
  );

  if (useDialog) {
    return (
      <Dialog>
        <DialogTrigger asChild>
          <button
            type="button"
            disabled={uploaderDisabled}
            className={buttonClassName ?? "btn"}
            aria-label={buttonLabel}
          >
            {buttonLabel}
          </button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader className={cn(dialogHeader ? "" : "sr-only")}>
            <DialogTitle>{dialogHeader ?? "Upload CSV"}</DialogTitle>
            <DialogDescription>
              Drag and drop your files here or click to browse.
            </DialogDescription>
          </DialogHeader>
          {uploaderComponent}
        </DialogContent>
      </Dialog>
    );
  }

  return uploaderComponent;
};

const FILE_TYPE_MAP = {
  csv: {
    mime: ["text/csv", "application/csv"],
    ext: [".csv"],
    label: "CSV (.csv)",
  },
  xls: {
    mime: ["application/vnd.ms-excel"],
    ext: [".xls"],
    label: "Excel 97-2003 (.xls)",
  },
  xlsx: {
    mime: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    ext: [".xlsx"],
    label: "Excel (.xlsx)",
  },
};
