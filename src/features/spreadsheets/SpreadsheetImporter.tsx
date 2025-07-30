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
import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
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
  validateRow,
} from "@/features/spreadsheets/utils";
import { FILE_TYPE_MAP } from "@/features/spreadsheets/constants";
import { SkeletonBlock } from "@/components/SkeletonBlock";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/CustomTable";

export const SpreadsheetImporter = ({
  fields,
  accept: receivedAccept = ["csv"],
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
  wrapperClassName = "",
  showUnexpectedColumnsWarning = true,
  ...props
}: SpreadsheetImporterProps) => {
  const [files, setFiles] = useState<File[]>([]);
  const [parsedResults, setParsedResults] = useState<ParsedCsvResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Memoize computed values
  const accept = useMemo(() => receivedAccept, []);

  const maxSizeInBytes = useMemo(
    () => maxFileSizeInMB * 1024 * 1024,
    [maxFileSizeInMB]
  );
  const effectiveMaxFileCount = useMemo(
    () => (uploadMultiple ? maxFileCount : 1),
    [uploadMultiple, maxFileCount]
  );

  const effectiveAccept = useMemo(() => {
    return accept.reduce((acc, type) => {
      const meta = FILE_TYPE_MAP[type];
      if (meta) {
        meta.mime.forEach((m) => (acc[m] = meta.ext));
      }
      return acc;
    }, {} as Record<string, string[]>);
  }, [accept]);

  const acceptText = useMemo(() => {
    return accept
      .map((type) => FILE_TYPE_MAP[type]?.label)
      .filter(Boolean)
      .join(", ");
  }, [accept]);

  const validationOptions = useMemo(
    () => ({
      requireAllExpectedHeaders,
      rejectUnexpectedColumns,
    }),
    [requireAllExpectedHeaders, rejectUnexpectedColumns]
  );

  // const validateFile = useCallback(
  //   (file: File): string | null => {
  //     const isFileValid = isValidFile(file, accept);
  //     if (!isFileValid) {
  //       return "Please select a valid file type";
  //     }

  //     if (file.size > maxSizeInBytes) {
  //       return `File size exceeds ${maxFileSizeInMB}MB limit`;
  //     }

  //     return null;
  //   },
  //   [accept, maxFileSizeInMB, maxSizeInBytes]
  // );

  const parseAllFiles = useCallback(
    async (files: File[]) => {
      if (!files.length) {
        setParsedResults([]);
        return;
      }

      setIsProcessing(true);
      const results: ParsedCsvResult[] = [];

      const processPromises = files.map(async (file) => {
        const validationError = isValidFile(file, accept)
          ? null
          : "Please select a valid file type";

        if (validationError || file.size > maxSizeInBytes) {
          return {
            file,
            data: [],
            preview: [],
            rowCount: 0,
            error:
              validationError || `File size exceeds ${maxFileSizeInMB}MB limit`,
            isValid: false,
          };
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
            const headerCheck = validateFileHeaders(
              result.headers,
              fields,
              validationOptions
            );

            // Add validation results to the parsed result
            result.error = headerCheck.error || undefined;
            result.warning = headerCheck.warning || undefined;
            result.isValid = headerCheck.isValid;
            result.unexpectedColumns = headerCheck.unexpectedColumns;
            result.duplicateHeaders = headerCheck.duplicateHeaders;
          }
          // Normalize data only if validation passed
          if (!result.error) {
            const normalizeData = (rows: any[]) =>
              rows.map((row) => normalizeRow(row, fields));

            result.preview = normalizeData(result.preview);
            result.data = normalizeData(result.data);
          }

          return result;

          //   if (isValid) {
          //     result.preview = result.preview.map((row) => {
          //       const normalized = normalizeRow(row, fields);
          //       // const validation = validateRow(normalized, fields);

          //       return {
          //         ...normalized,
          //         // __validation: validation,
          //       };
          //     });

          //     result.data = result.data.map((row) => {
          //       const normalized = normalizeRow(row, fields);
          //       // const validation = validateRow(normalized, fields);
          //       return {
          //         ...normalized,
          //         // __validation: validation,
          //       };
          //     });
          //   }
          // }

          // results.push(result);
        } catch (err) {
          return {
            file,
            data: [],
            preview: [],
            rowCount: 0,
            error: err instanceof Error ? err.message : String(err),
            isValid: false,
          };
        }
      });

      try {
        const processedResults = await Promise.all(processPromises);
        setParsedResults(processedResults);
        if (onParsed && processedResults.length > 0) {
          onParsed(processedResults);
        }
      } catch (error) {
        onError?.(error instanceof Error ? error.message : "Processing failed");
      } finally {
        setIsProcessing(false);
      }
    },
    [
      accept,
      maxSizeInBytes,
      maxFileSizeInMB,
      hasHeader,
      maxRows,
      previewRowCount,
      validateHeaders,
      fields,
      validationOptions,
      onError,
    ]
  );

  useEffect(() => {
    parseAllFiles(files);
  }, [files, parseAllFiles]);

  // Handle server upload (separate from parsing)
  const handleServerUpload = useCallback(
    async (filesToUpload: File[]) => {
      if (!onServerUpload) return;

      try {
        await onServerUpload(filesToUpload);
        // Server upload successful - files will be parsed automatically
        // by the useEffect above since FileUploader manages the file state
      } catch (error) {
        onError?.(error instanceof Error ? error.message : "Upload failed");
      }
    },
    [onServerUpload, onError]
  );

  // Generate the CustomFileCard for each file
  const getFileCardExtra = useMemo(() => {
    if (!showCustomFileCard) return undefined;

    return (file?: File, idx?: number) => {
      if (!file || typeof idx !== "number") return null;

      // Find the parsed result for this specific file
      const parsed = parsedResults[idx];

      if (isProcessing || !parsed) return <SkeletonBlock />;

      if (!parsed) return null;

      return (
        <CustomFileCard
          parsedResult={parsed}
          fields={fields}
          showAllFields={showAllFields}
          showUnexpectedColumnsWarning={showUnexpectedColumnsWarning}
        />
      );
    };
  }, [
    showCustomFileCard,
    parsedResults,
    isProcessing,
    fields,
    showAllFields,
    showUnexpectedColumnsWarning,
  ]);

  const uploaderComponent = (
    <FileUploader
      accept={effectiveAccept}
      acceptText={acceptText}
      maxRows={maxRows}
      multiple={uploadMultiple}
      maxSize={maxSizeInBytes}
      maxFileCount={effectiveMaxFileCount}
      uploaderClassName={uploaderClassName ?? ""}
      disabled={uploaderDisabled}
      value={files}
      onValueChange={setFiles}
      onUpload={onServerUpload ? handleServerUpload : undefined}
      fileCardExtra={getFileCardExtra}
      fileCardClassName="border-0 rounded-none border-t border-foreground/20"
      className={wrapperClassName}
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

export const CustomFileCard = memo(
  ({
    parsedResult,
    fields = [],
    showAllFields = false,
    showUnexpectedColumnsWarning = true,
    renderOptions = {},
  }: FileCardExtraProps) => {
    if (!parsedResult) return null;

    // Error: Show only error & nothing else
    if (parsedResult.error) {
      return (
        <div className="flex flex-col gap-2 min-w-0 w-full">
          <div className="text-destructive font-bold">{parsedResult.error}</div>
          {parsedResult.duplicateHeaders &&
            parsedResult.duplicateHeaders?.length > 0 && (
              <div className="text-destructive">
                Duplicate columns: {parsedResult.duplicateHeaders.join(", ")}
              </div>
            )}
        </div>
      );
    }

    const displayFields = useMemo(
      () =>
        getDisplayFields({
          fields,
          parsedHeaders: parsedResult.headers,
          showAllFields,
        }),
      [fields, parsedResult.headers, showAllFields]
    );

    // Don't render table if nothing to show
    if (
      !parsedResult.preview ||
      !parsedResult.preview.length ||
      !displayFields.length
    ) {
      return (
        <div className="text-muted-foreground italic min-w-0 w-full">
          No preview available
        </div>
      );
    }

    const parsedResultWarning = parsedResult.warning;
    const unexpectedColumnsWarning =
      parsedResult?.unexpectedColumns &&
      parsedResult.unexpectedColumns.length > 0
        ? `Unexpected columns found: ${parsedResult.unexpectedColumns.join(
            ", "
          )}`
        : null;
    return (
      <div className="flex flex-col gap-2 min-w-0 w-full">
        <div>
          {/* Show warning/info if present */}
          {parsedResultWarning &&
            parsedResultWarning !== unexpectedColumnsWarning && (
              <div className="text-muted-foreground text-[15px] text-sm">
                {parsedResultWarning}
              </div>
            )}
          {unexpectedColumnsWarning && showUnexpectedColumnsWarning && (
            <div className="text-blue-500 text-sm">
              {unexpectedColumnsWarning}
            </div>
          )}
        </div>
        <div>
          <p className="text-sm font-medium mb-2">
            {`Preview (${
              parsedResult.preview.length === 1
                ? "Only 1 row available"
                : `first ${parsedResult.preview.length} rows`
            })`}
          </p>
          <div className="border rounded overflow-hidden">
            <Table>
              <TableHeader className="bg-muted">
                <TableRow variant="header">
                  {displayFields.map((f) => (
                    <TableCell
                      variant="header"
                      key={f.value}
                      className={`p-2 font-medium text-left ${
                        f.className ?? ""
                      }`}
                    >
                      {f.label}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody className="w-full min-w-0">
                {parsedResult.preview.map((row: any, rowIdx: number) => (
                  <TableRow key={rowIdx} className="border-t">
                    {displayFields.map((f) => {
                      // If render returns undefined/null, fall back to ""
                      const cell =
                        f.render?.(row[f.value], row, rowIdx, renderOptions) ??
                        row[f.value] ??
                        "";
                      // Force to string or ReactNode, never {}
                      return (
                        <TableCell
                          key={f.value}
                          className={cn(`p-2 ${f.className ?? ""}`, "truncate")}
                        >
                          {typeof cell === "object" &&
                          !React.isValidElement(cell)
                            ? JSON.stringify(cell)
                            : cell}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    );
  }
);
