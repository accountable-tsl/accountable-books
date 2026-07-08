/**
 * CSV Import Dialog Component
 * Minimal, clean design following app patterns
 */

import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import {
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  Upload,
  X,
} from 'lucide-react';

import { PFA_KEYS } from '../data/pfa';
import { NIGERIAN_STATES } from '../data/states';
import { formatMonthKey } from '../utils';
import { downloadCsvTemplate, parseCsvFile } from '../utils/csv-import';

import type { EmployeeRecord } from '../domain';
import type { CsvImportFormat } from '../utils/csv-import';
import type { CsvImportResult } from '../utils/csv-import';

export interface CsvImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (employees: EmployeeRecord[]) => Promise<void>;
  periodYear: number;
  periodMonth: number;
  existingEmployeeCount: number;
  isMdScreen: boolean;
}

export function CsvImportDialog({
  open,
  onOpenChange,
  onImport,
  periodYear,
  periodMonth,
  existingEmployeeCount,
  isMdScreen,
}: CsvImportDialogProps) {
  const [format, setFormat] = useState<CsvImportFormat>('simple');
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importResult, setImportResult] = useState<CsvImportResult | null>(
    null,
  );
  const [isImporting, setIsImporting] = useState(false);
  const [showValidValues, setShowValidValues] = useState(false);

  const fromMonth = formatMonthKey(String(periodYear), String(periodMonth));

  const handleProcessFile = useCallback(
    async (fileToProcess: File) => {
      setIsProcessing(true);
      setImportResult(null);

      try {
        const result = await parseCsvFile(fileToProcess, format, fromMonth);
        setImportResult(result);
      } catch (error) {
        setImportResult({
          employees: [],
          errors: [
            {
              row: 0,
              message: `Failed to process file: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
          warnings: [],
        });
      } finally {
        setIsProcessing(false);
      }
    },
    [format, fromMonth],
  );

  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = event.target.files?.[0];
      if (selectedFile) {
        if (
          !selectedFile.name.endsWith('.csv') &&
          selectedFile.type !== 'text/csv'
        ) {
          setImportResult({
            employees: [],
            errors: [
              {
                row: 0,
                message: 'Please select a CSV file (.csv extension)',
              },
            ],
            warnings: [],
          });
          setFile(null);
          return;
        }
        setFile(selectedFile);
        setImportResult(null);
        // Auto-process on file select
        handleProcessFile(selectedFile);
      }
    },
    [handleProcessFile],
  );

  const handleImport = useCallback(async () => {
    if (!importResult || importResult.employees.length === 0) return;

    setIsImporting(true);
    try {
      await onImport(importResult.employees);
      setFile(null);
      setImportResult(null);
      setFormat('simple');
      onOpenChange(false);
    } catch (error) {
      // Error is already handled by parent component (toast notification)
      // Re-throw to prevent dialog from closing on error
      throw error;
    } finally {
      setIsImporting(false);
    }
  }, [importResult, onImport, onOpenChange]);

  const handleClose = useCallback(() => {
    if (!isProcessing && !isImporting) {
      setFile(null);
      setImportResult(null);
      setFormat('simple');
      onOpenChange(false);
    }
  }, [isProcessing, isImporting, onOpenChange]);

  const canImport =
    importResult &&
    importResult.employees.length > 0 &&
    importResult.errors.length === 0;

  const Footer = isMdScreen ? DialogFooter : SheetFooter;

  const content = (
    <>
      <div className="min-h-0 space-y-4 border-t pb-4">
        {/* Format Selection */}
        <div className="space-y-2 p-4">
          <label className="text-xs leading-none font-medium">
            Import format
          </label>
          <RadioGroup
            value={format}
            onValueChange={(v) => {
              setFormat(v as CsvImportFormat);
              setFile(null);
              setImportResult(null);
            }}
            className="gap-3"
          >
            <div className="flex items-start gap-2">
              <RadioGroupItem value="simple" id="simple" className="mt-0.5" />
              <div className="flex-1 space-y-0.5">
                <Label
                  htmlFor="simple"
                  className="cursor-pointer text-sm font-medium"
                >
                  Simple
                </Label>
                <p className="text-muted-foreground text-xs">
                  Name, Role, State, Tax ID, Period Type, Gross Salary
                  (optional), Basic, Housing, Transport
                </p>
              </div>
            </div>
            {/* <div className="flex items-start gap-2 pointer-events-none opacity-50">
              <RadioGroupItem value="full" id="full" className="mt-0.5" />
              <div className="flex-1 space-y-0.5">
                <Label htmlFor="full" className="text-sm font-medium cursor-pointer">
                  Full (coming soon)
                </Label>
                <p className="text-xs text-muted-foreground">
                  All employee details (ID, Role, Tax ID, PFA, salary components, etc.)
                </p>
              </div>
            </div> */}
          </RadioGroup>
        </div>

        <Separator />

        {/* Valid Values Reference */}
        <div className="space-y-2 p-4">
          <button
            type="button"
            onClick={() => setShowValidValues(!showValidValues)}
            className="flex w-full items-center justify-between text-left"
          >
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Valid values reference</p>
              <p className="text-muted-foreground text-xs">
                Click to see valid State and PFA values
              </p>
            </div>
            {showValidValues ? (
              <ChevronUp className="text-muted-foreground h-4 w-4" />
            ) : (
              <ChevronDown className="text-muted-foreground h-4 w-4" />
            )}
          </button>
          {showValidValues && (
            <div className="bg-muted/30 mt-2 max-h-64 space-y-3 overflow-y-auto rounded border p-3 text-xs">
              <div>
                <p className="mb-1 font-medium">Valid States (exact match):</p>
                <p className="text-muted-foreground font-mono break-words">
                  {NIGERIAN_STATES.join(', ')}
                </p>
              </div>
              <div>
                <p className="mb-1 font-medium">Valid PFA keys (lowercase):</p>
                <p className="text-muted-foreground font-mono break-words">
                  {PFA_KEYS.join(', ')}
                </p>
              </div>
              <div>
                <p className="mb-1 font-medium">Period Type:</p>
                <p className="text-muted-foreground">monthly or annual</p>
              </div>
            </div>
          )}
        </div>

        <Separator />

        {/* Template Download */}
        <div className="space-y-2 p-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Template</p>
              <p className="text-muted-foreground text-xs">
                Download a CSV template with sample data and valid values
                reference
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => downloadCsvTemplate(format)}
              className="h-7.5"
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Download
            </Button>
          </div>
        </div>

        <Separator />

        {/* File Upload */}
        <div className="space-y-2 p-4">
          <label className="text-xs leading-none font-medium">
            Upload CSV file
          </label>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileSelect}
            className="hidden"
            id="csv-file-input"
            disabled={isProcessing || isImporting}
          />
          <label
            htmlFor="csv-file-input"
            className={cn(
              'flex cursor-pointer items-center gap-2 rounded border p-3 text-sm transition-colors',
              file
                ? 'border-primary/50 bg-primary/5'
                : 'border-input hover:bg-muted/50',
              (isProcessing || isImporting) && 'cursor-not-allowed opacity-50',
            )}
          >
            {file ? (
              <>
                <FileText className="h-4 w-4 shrink-0" />
                <span className="flex-1 truncate text-xs">{file.name}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                    setImportResult(null);
                  }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </>
            ) : (
              <>
                <Upload className="text-muted-foreground h-4 w-4 shrink-0" />
                <span className="text-muted-foreground text-xs">
                  Click to select CSV file
                </span>
              </>
            )}
          </label>
          {isProcessing && (
            <p className="text-muted-foreground text-xs">Processing...</p>
          )}
        </div>

        {/* Validation Results */}
        {importResult && (
          <>
            <Separator />
            <div className="space-y-3 p-4">
              {/* Success */}
              {importResult.employees.length > 0 && (
                <div className="space-y-1 border-l-4 border-green-600 bg-green-50/50 p-3 dark:bg-green-950/20">
                  <p className="text-xs font-medium text-green-700 dark:text-green-400">
                    {importResult.employees.length} employee
                    {importResult.employees.length !== 1 ? 's' : ''} ready to
                    import
                  </p>
                  {importResult.errors.length > 0 && (
                    <p className="text-xs text-green-600 dark:text-green-500">
                      Some rows had errors and were skipped
                    </p>
                  )}
                </div>
              )}

              {/* Errors */}
              {importResult.errors.length > 0 && (
                <div className="bg-destructive/10 dark:bg-destructive/20 border-destructive space-y-1 border-l-4 p-3">
                  <p className="text-destructive text-xs font-medium">
                    {importResult.errors.length} error
                    {importResult.errors.length !== 1 ? 's' : ''} found
                  </p>
                  <div className="text-destructive/90 max-h-40 space-y-0.5 overflow-y-auto text-xs">
                    {importResult.errors.slice(0, 10).map((error, idx) => (
                      <p key={idx} className="font-mono break-words">
                        Row {error.row}
                        {error.column && `, ${error.column}`}: {error.message}
                      </p>
                    ))}
                    {importResult.errors.length > 10 && (
                      <p className="text-muted-foreground">
                        ...and {importResult.errors.length - 10} more
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Warnings */}
              {importResult.warnings.length > 0 && (
                <div className="space-y-1 border-l-4 border-yellow-600 bg-yellow-50/50 p-3 dark:bg-yellow-950/20">
                  {importResult.warnings.map((warning, idx) => (
                    <p
                      key={idx}
                      className="text-xs text-yellow-700 dark:text-yellow-400"
                    >
                      {warning}
                    </p>
                  ))}
                </div>
              )}

              {/* Replacement Warning */}
              {existingEmployeeCount > 0 && canImport && (
                <div className="border-l-4 border-yellow-600 bg-yellow-50/50 p-3 dark:bg-yellow-950/20">
                  <p className="text-xs text-yellow-700 dark:text-yellow-400">
                    This will replace {existingEmployeeCount} existing employee
                    {existingEmployeeCount !== 1 ? 's' : ''}
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <Footer>
        <Button
          variant="outline"
          onClick={handleClose}
          disabled={isProcessing || isImporting}
          className="w-full md:w-auto"
        >
          Cancel
        </Button>
        {canImport && (
          <Button
            onClick={handleImport}
            disabled={isImporting}
            className="w-full md:w-auto"
          >
            {isImporting
              ? 'Importing...'
              : `Import ${importResult.employees.length}`}
          </Button>
        )}
      </Footer>
    </>
  );

  if (isMdScreen) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="flex max-h-[90vh] flex-col rounded sm:max-w-[520px]">
          <DialogHeader className="shrink-0">
            <DialogTitle>Import employees</DialogTitle>
            <DialogDescription>
              Upload a CSV file to bulk import employees. Simple format accepts
              Gross Salary or BHT components (Basic, Housing, Transport).
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">{content}</div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent
        side="bottom"
        className="mx-auto flex max-h-[90vh] max-w-2xl flex-col rounded"
      >
        <SheetHeader className="shrink-0 gap-0 pr-8 pb-0">
          <SheetTitle className="text-[16px]">Import employees</SheetTitle>
          <SheetDescription className="text-sm">
            Upload a CSV file to bulk import employees. Simple format accepts
            Gross Salary or BHT components (Basic, Housing, Transport).
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">{content}</div>
      </SheetContent>
    </Sheet>
  );
}
