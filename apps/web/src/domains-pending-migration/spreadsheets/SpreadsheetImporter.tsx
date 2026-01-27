import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from '@/components/CustomTable';
import { FileUploader } from '@/components/FileUploader';
import { SkeletonBlock } from '@/components/SkeletonBlock';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { FILE_TYPE_MAP } from '@/domains-pending-migration/spreadsheets/constants';
import {
  type FileCardExtraProps,
  type ParsedCsvResult,
  type SpreadsheetImporterProps,
} from '@/domains-pending-migration/spreadsheets/types';
import {
  getDisplayFields,
  isValidFile,
  normalizeRow,
  parseSpreadsheetFile,
  validateHeaders as validateFileHeaders,
} from '@/domains-pending-migration/spreadsheets/utils';
import { cn } from '@/lib/utils';

export const SpreadsheetImporter = ({
  fields,
  accept: receivedAccept = ['csv'],
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
  buttonLabel = 'Import CSV',
  buttonClassName,
  hasHeader = true,
  validateHeaders = true,
  showCustomFileCard = true,
  previewRowCount = 3,
  requireAllExpectedHeaders = false,
  rejectUnexpectedColumns = false,
  showAllFields = false,
  wrapperClassName = '',
  showUnexpectedColumnsWarning = true,
  fileCardClassName,
  ...props
}: SpreadsheetImporterProps) => {
  const [files, setFiles] = useState<File[]>([]);
  const [parsedResults, setParsedResults] = useState<ParsedCsvResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Memoize computed values
  const accept = useMemo(() => receivedAccept, [receivedAccept]);

  const maxSizeInBytes = useMemo(
    () => maxFileSizeInMB * 1024 * 1024,
    [maxFileSizeInMB],
  );
  const effectiveMaxFileCount = useMemo(
    () => (uploadMultiple ? maxFileCount : 1),
    [uploadMultiple, maxFileCount],
  );

  const effectiveAccept = useMemo(() => {
    return accept.reduce(
      (acc, type) => {
        const meta = FILE_TYPE_MAP[type];
        if (meta) {
          meta.mime.forEach((m) => (acc[m] = meta.ext));
        }
        return acc;
      },
      {} as Record<string, string[]>,
    );
  }, [accept]);

  const acceptText = useMemo(() => {
    return accept
      .map((type) => FILE_TYPE_MAP[type]?.label)
      .filter(Boolean)
      .join(', ');
  }, [accept]);

  const validationOptions = useMemo(
    () => ({
      requireAllExpectedHeaders,
      rejectUnexpectedColumns,
    }),
    [requireAllExpectedHeaders, rejectUnexpectedColumns],
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
          : 'Please select a valid file type';

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
              validationOptions,
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
        onError?.(error instanceof Error ? error.message : 'Processing failed');
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
      onParsed,
    ],
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
        onError?.(error instanceof Error ? error.message : 'Upload failed');
      }
    },
    [onServerUpload, onError],
  );

  // Generate the CustomFileCard for each file
  const getFileCardExtra = useMemo(() => {
    if (!showCustomFileCard) return undefined;

    return (file?: File, idx?: number) => {
      if (!file || typeof idx !== 'number') return null;

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
      uploaderClassName={uploaderClassName ?? ''}
      disabled={uploaderDisabled}
      value={files}
      onValueChange={setFiles}
      onUpload={onServerUpload ? handleServerUpload : undefined}
      fileCardExtra={getFileCardExtra}
      fileCardClassName={cn(
        'border-0 rounded-none border-t border-foreground/20',
        fileCardClassName,
      )}
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
            className={buttonClassName ?? 'btn'}
            aria-label={buttonLabel}
          >
            {buttonLabel}
          </button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader className={cn(dialogHeader ? '' : 'sr-only')}>
            <DialogTitle>{dialogHeader ?? 'Upload CSV'}</DialogTitle>
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
    const displayFields = useMemo(
      () =>
        parsedResult
          ? getDisplayFields({
              fields,
              parsedHeaders: parsedResult.headers,
              showAllFields,
            })
          : [],
      [fields, showAllFields, parsedResult],
    );

    if (!parsedResult) return null;

    // Error: Show only error & nothing else
    if (parsedResult.error) {
      return (
        <div className="flex w-full min-w-0 flex-col gap-2">
          <div className="text-destructive font-bold">{parsedResult.error}</div>
          {parsedResult.duplicateHeaders &&
            parsedResult.duplicateHeaders?.length > 0 && (
              <div className="text-destructive">
                Duplicate columns: {parsedResult.duplicateHeaders.join(', ')}
              </div>
            )}
        </div>
      );
    }

    // Don't render table if nothing to show
    if (
      !parsedResult.preview ||
      !parsedResult.preview.length ||
      !displayFields.length
    ) {
      return (
        <div className="text-muted-foreground w-full min-w-0 italic">
          No preview available
        </div>
      );
    }

    const parsedResultWarning = parsedResult.warning;
    const unexpectedColumnsWarning =
      parsedResult?.unexpectedColumns &&
      parsedResult.unexpectedColumns.length > 0
        ? `Unexpected columns found: ${parsedResult.unexpectedColumns.join(', ')}`
        : null;
    return (
      <div className="flex w-full min-w-0 flex-col gap-2">
        <div>
          {/* Show warning/info if present */}
          {parsedResultWarning &&
            parsedResultWarning !== unexpectedColumnsWarning && (
              <div className="text-muted-foreground text-sm text-[15px]">
                {parsedResultWarning}
              </div>
            )}
          {unexpectedColumnsWarning && showUnexpectedColumnsWarning && (
            <div className="text-sm text-blue-500">
              {unexpectedColumnsWarning}
            </div>
          )}
        </div>
        <div>
          <p className="mb-2 text-sm font-medium">
            {`Preview (${
              parsedResult.preview.length === 1
                ? 'Only 1 row available'
                : `first ${parsedResult.preview.length} rows`
            })`}
          </p>
          <div className="overflow-hidden rounded border">
            <Table>
              <TableHeader className="bg-muted">
                <TableRow variant="header">
                  {displayFields.map((f) => (
                    <TableCell
                      variant="header"
                      key={f.value}
                      className={`p-2 text-left font-medium ${f.className ?? ''}`}
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
                        '';
                      // Force to string or ReactNode, never {}
                      return (
                        <TableCell
                          key={f.value}
                          className={cn(`p-2 ${f.className ?? ''}`, 'truncate')}
                        >
                          {typeof cell === 'object' &&
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
  },
);
