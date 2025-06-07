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
import React, { useEffect, useMemo, useState } from "react";
import {
  FileCardExtraProps,
  ParsedCsvResult,
  SpreadsheetImporterProps,
} from "@/features/spreadsheets/types";
import {
  getDisplayFields,
  isValidFile,
  normalizeRow,
  parseSpreadsheetFile,
  validateHeaders as validateFileHeaders,
} from "@/features/spreadsheets/utils";
import { FILE_TYPE_MAP } from "@/features/spreadsheets/constants";

export const SpreadsheetImporter = ({
  fields,
  accept = ["csv"],
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
  validateHeaders = true,
  showCustomFileCard = true,
  previewRowCount = 3,
  requireAllExpectedHeaders = false,
  rejectUnexpectedColumns = false,
  showAllFields = false,
}: SpreadsheetImporterProps) => {
  const [files, setFiles] = useState<File[]>([]);
  const [parsedResults, setParsedResults] = useState<ParsedCsvResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

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

  const validateFile = (file: File): string | null => {
    const isFileValid = isValidFile(file, accept);
    if (!isFileValid) {
      return "Please select a valid file type";
    }

    if (file.size > maxSizeInBytes) {
      return `File size exceeds ${maxFileSizeInMB}MB limit`;
    }

    return null;
  };

  useEffect(() => {
    const parseAllFiles = async () => {
      if (!files.length) {
        setParsedResults([]);
        return;
      }

      setIsProcessing(true);
      const results: ParsedCsvResult[] = [];

      // Validate all files first
      for (const file of files) {
        // Validate file first
        const validationError = validateFile(file);
        if (validationError) {
          results.push({
            file,
            data: [],
            preview: [],
            rowCount: 0,
            error: validationError,
          });
          continue;
        }

        try {
          // Parse the file
          const result = await parseSpreadsheetFile({
            file,
            hasHeader,
            limit: maxRows,
            previewRowCount,
          });

          // Validate headers if enabled
          if (validateHeaders && hasHeader) {
            const headerCheck = validateFileHeaders(result.headers, fields, {
              requireAllExpectedHeaders,
              rejectUnexpectedColumns,
            });

            const {
              error,
              warning,
              unexpectedColumns,
              duplicateHeaders,
              isValid,
            } = headerCheck;

            // Add validation results to the parsed result
            result.error = error || undefined;
            result.warning = warning || undefined;
            if (unexpectedColumns?.length) {
              result.unexpectedColumns = unexpectedColumns;
            }
            if (duplicateHeaders?.length) {
              result.duplicateHeaders = duplicateHeaders;
            }

            // Normalize data only if validation passed
            if (isValid) {
              result.preview = result.preview.map((row) =>
                normalizeRow(row, fields)
              );
              result.data = result.data.map((row) => normalizeRow(row, fields));
            }
          }

          results.push(result);
        } catch (err) {
          results.push({
            file,
            data: [],
            preview: [],
            rowCount: 0,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      setParsedResults(results);
      setIsProcessing(false);
    };

    parseAllFiles();
  }, [
    files,
    hasHeader,
    maxRows,
    previewRowCount,
    validateHeaders,
    fields,
    requireAllExpectedHeaders,
    rejectUnexpectedColumns,
  ]);

  // Send results to parent when they're ready
  useEffect(() => {
    if (parsedResults.length > 0) {
      onParsed(parsedResults);
    }
  }, [parsedResults, onParsed]);

  // Handle server upload (separate from parsing)
  const handleServerUpload = async (filesToUpload: File[]) => {
    if (!onServerUpload) return;

    try {
      await onServerUpload(filesToUpload);
      // Server upload successful - files will be parsed automatically
      // by the useEffect above since FileUploader manages the file state
    } catch (error) {
      onError?.(error instanceof Error ? error.message : "Upload failed");
    }
  };

  // Generate the CustomFileCard for each file
  const getFileCardExtra = useMemo(() => {
    if (!showCustomFileCard) return undefined;

    return (file?: File, idx?: number) => {
      if (!file || isProcessing || typeof idx !== "number") return null;

      // Find the parsed result for this specific file
      const parsed = parsedResults.find(
        (result) =>
          result.file.name === file.name && result.file.size === file.size
      );

      if (!parsed) return null;

      return (
        <CustomFileCard
          parsedResult={parsed}
          fields={fields}
          showAllFields={showAllFields}
        />
      );
    };
  }, [showCustomFileCard, parsedResults, isProcessing, fields, showAllFields]);

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
      value={files}
      onValueChange={setFiles}
      onUpload={onServerUpload ? handleServerUpload : undefined}
      fileCardExtra={getFileCardExtra}
    />
  );

  console.log("Files in importer:", files);

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

export const CustomFileCard = ({
  parsedResult,
  fields = [],
  showAllFields = false,
  renderOptions = {},
}: FileCardExtraProps) => {
  if (!parsedResult) return null;

  // Error: Show only error & nothing else
  if (parsedResult.error) {
    return (
      <div>
        <div className="text-red-600 font-bold mb-2">{parsedResult.error}</div>
        {parsedResult.duplicateHeaders &&
          parsedResult.duplicateHeaders?.length > 0 && (
            <div className="text-red-500">
              Duplicate columns: {parsedResult.duplicateHeaders.join(", ")}
            </div>
          )}
      </div>
    );
  }

  const displayFields = getDisplayFields({
    fields,
    parsedHeaders: parsedResult.headers,
    showAllFields,
  });

  // Don't render table if nothing to show
  if (
    !parsedResult.preview ||
    !parsedResult.preview.length ||
    !displayFields.length
  ) {
    return (
      <div className="text-muted-foreground italic">No preview available</div>
    );
  }

  return (
    <div>
      {/* Show warning/info if present */}
      {parsedResult.warning && (
        <div className="text-yellow-700 mb-2">{parsedResult.warning}</div>
      )}
      {parsedResult.unexpectedColumns &&
        parsedResult.unexpectedColumns?.length > 0 && (
          <div className="text-blue-700 mb-2">
            Unexpected columns: {parsedResult.unexpectedColumns.join(", ")}
          </div>
        )}
      <div>
        <p className="text-sm font-medium mb-2">
          {`Preview (first ${parsedResult.preview.length} rows)`}
        </p>
        <div className="border rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                {displayFields.map((f) => (
                  <th
                    key={f.value}
                    className={`p-2 font-medium ${f.className ?? ""}`}
                  >
                    {f.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {parsedResult.preview.map((row: any, rowIdx: number) => (
                <tr key={rowIdx} className="border-t">
                  {displayFields.map((f) => {
                    // If render returns undefined/null, fall back to ""
                    const cell =
                      f.render?.(row[f.value], row, rowIdx, renderOptions) ??
                      row[f.value] ??
                      "";
                    // Force to string or ReactNode, never {}
                    return (
                      <td key={f.value} className={`p-2 ${f.className ?? ""}`}>
                        {typeof cell === "object" && !React.isValidElement(cell)
                          ? JSON.stringify(cell)
                          : cell}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
