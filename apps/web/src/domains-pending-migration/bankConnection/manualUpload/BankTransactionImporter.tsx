import { useSession } from '@session';
import {
  Activity,
  Building,
  DollarSign,
  ExternalLink,
  Plus,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { PuffLoader } from 'react-spinners';
import { toast } from 'sonner';

import { AutocompleteDropdown } from '@/components/AutocompleteDropdown';
import { CenteredLoader } from '@/components/CenteredLoader';
import { Failed } from '@/components/Failed';
import { FormattedAmount } from '@/components/FormattedAmount';
import { FormField } from '@/components/FormField';
import { Success } from '@/components/Success';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  type BankTransactionBatchInput,
  type BankTransactionImporterProps,
  bankTransactionInput,
  bankTransactionSource,
  type FileTransaction,
} from '@/domains-pending-migration/bankConnection/manualUpload/types';
import { addNewBankTransactions } from '@/domains-pending-migration/bankConnection/shared/api';
import { SpreadsheetImporter } from '@/domains-pending-migration/spreadsheets/SpreadsheetImporter';
import { cn } from '@/lib/utils';
import { type BankAccountWithMeta } from '@/modules/banking/accounts';
import { getBankAccountsForCompany } from '@/modules/banking/accounts/api';
import { AddBankAccountDialog } from '@/modules/banking/accounts/ui/ba-add-dialog';
import { useIsMobile } from '@/shared/hooks/use-media-query';
import { maskDigits, parseDateString } from '@/shared/utils/formatting-utils';

import { type ParsedCsvResult } from '../../spreadsheets/types';
import { getDisplayFields } from '../../spreadsheets/utils';
import { bankTransactionImporterfields } from './constants';
import { computeStats } from './utils';

export const BankTransactionImporter = ({
  onImportSuccess,
  onImportError,
  options,
}: BankTransactionImporterProps) => {
  // States
  const [companyBankAccounts, setCompanyBankAccounts] = useState<
    BankAccountWithMeta[] | null
  >();
  const [selectedBankAccount, setSelectedBankAccount] =
    useState<BankAccountWithMeta | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [parsedResults, setParsedResults] = useState<ParsedCsvResult[]>();
  const [fileTransactions, setFileTransactions] = useState<
    FileTransaction[] | null
  >(null);

  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [_isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'success' | 'failed' | null>(
    null,
  );
  const [selectedStep, setSelectedStep] = useState<'upload' | 'review'>(
    'upload',
  );

  // Hooks
  const { companyId } = useSession();
  const isMobile = useIsMobile();
  const isFirstRender = useRef(true);
  const prevParsedKeys = useRef<string[]>([]);
  const isFetching = useRef(false);

  const { className: importedClassName, toastPosition } = options ?? {};

  // Handler for parsed results
  const handleParsed = (results: ParsedCsvResult[]) => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (!hasUserInteracted) {
      // Only set to true if something actually changed!
      if (results.length > 0) setHasUserInteracted(true);
      else return; // ignore initial empty trigger
    }

    if (!selectedBankAccount) {
      toast.error('Please select a bank account before uploading files', {
        position: toastPosition || 'top-right',
      });
      return;
    }

    // Compute current key for each file
    const currKeys = (results || [])
      .map(
        (r) => r.file?.name + '-' + r.file?.size + '-' + r.file?.lastModified,
      )
      .sort();
    const prevKeys = prevParsedKeys.current;

    // Only run if files actually changed
    if (currKeys.join(',') === prevKeys.join(',') && hasUserInteracted) {
      return;
    }
    prevParsedKeys.current = currKeys;

    setIsLoading(true);
    setParsedResults(results);

    const groupedByFile: FileTransaction[] = results
      .filter((r) => !r.error && r.data && r.data.length > 0)
      .map((r) => {
        const processedTransactions = r.data
          .map((t) => {
            if (!t.date) return t;
            return {
              ...t,
              date: parseDateString(t.date.toString()) || t.date,
              bankAccountId: selectedBankAccount.id,
            };
          })
          .sort((a, b) => {
            const dateA =
              a.date instanceof Date ? a.date : new Date(a.date as string);
            const dateB =
              b.date instanceof Date ? b.date : new Date(b.date as string);
            return dateA.getTime() - dateB.getTime();
          });

        const stats = computeStats({
          transactions: processedTransactions,
          amountField: 'amount',
          dateField: 'date',
        });

        return {
          fileName: r.file.name,
          transactions: processedTransactions,
          bankAccount: selectedBankAccount,
          stats,
        };
      });

    if (results.length > 0) setFileTransactions(groupedByFile);

    const filesWithErrors = results.filter((r) => r.error);
    const filesWithData = results.filter((r) => !r.error && r.data.length > 0);

    if (filesWithErrors.length) {
      toast.error(
        `Some files had errors: ${filesWithErrors.map((r) => r.file.name).join(', ')}`,
        {
          position: toastPosition || 'top-right',
        },
      );
    }
    if (filesWithData.length) {
      toast.success(
        `Imported ${filesWithData.length} file(s): ${filesWithData
          .map((r) => r.file.name)
          .join(', ')}`,
        { position: toastPosition || 'top-right' },
      );
    }
    if (!filesWithData.length && !filesWithErrors.length) {
      setFileTransactions(null);
      setParsedResults([]);
      toast('No files imported. Please upload a valid CSV file', {
        position: toastPosition || 'top-right',
      });
    }

    setIsLoading(false);
  };

  // Handler for general errors
  const handleError = (msg: string) => {
    toast.error(msg, { position: toastPosition || 'top-right' });
  };

  const handleReview = () => {
    setSelectedStep('review');
  };
  const handleBack = () => {
    if (fileTransactions?.length) {
      if (
        window.confirm('Are you sure? You may lose unsaved transaction data.')
      ) {
        setFileTransactions(null);
        setSelectedBankAccount(null);
        setParsedResults([]);
        setHasUserInteracted(false);
        setIsSubmitting(false);
        setUploadStatus(null);
        setParsedResults([]);
        setSelectedStep('upload');
      }
    } else {
      setSelectedStep('review');
    }
  };
  const handleSubmit = async () => {
    if (!fileTransactions || fileTransactions.length === 0) {
      toast.error('No transactions to submit.', {
        position: toastPosition || 'top-right',
      });
      return;
    }

    // Only support single file for now
    const { stats, transactions, bankAccount } = fileTransactions[0];

    // Guard: Incomplete data
    if (
      !stats.earliestDate ||
      !stats.latestDate ||
      !transactions ||
      !bankAccount.id
    ) {
      toast.error('Error reading transaction data', {
        position: toastPosition || 'top-right',
      });
      return;
    }

    // Guard: Invalid transaction structure
    const txnsForDb = bankTransactionInput.array().safeParse(transactions);
    if (!txnsForDb.success) {
      toast.error('Error re-validating transaction data', {
        position: toastPosition || 'top-right',
      });
      return;
    }

    // Guard: No company context
    if (!companyId) {
      toast.error('Something went wrong. Please try again.', {
        position: toastPosition || 'top-right',
      });
      return;
    }

    const batchData: BankTransactionBatchInput = {
      startDate: stats.earliestDate,
      endDate: stats.latestDate,
      bankAccountId: bankAccount.id,
      source: bankTransactionSource.enum.file_import,
      bankTransactions: txnsForDb.data,
    };

    setIsSubmitting(true);
    const toastId = toast.loading('Submitting transactions...', {
      position: toastPosition || 'top-right',
    });

    try {
      if (isSubmitting) {
        toast.loading('Submitting transactions...', {
          position: toastPosition || 'top-right',
        });
      }

      const [apiResult] = await Promise.allSettled([
        addNewBankTransactions(companyId, batchData),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);

      let response;

      if (apiResult.status === 'fulfilled') {
        response = apiResult.value;
      } else {
        response = null;
      }

      if (!response || !response.success) {
        toast.error('Failed to submit transactions', {
          id: toastId,
          position: toastPosition || 'top-right',
        });
        setUploadStatus('failed');
        onImportError?.(
          apiResult.status === 'rejected' ? apiResult.reason : response,
        );
        return;
      }

      toast.success('Bank transactions submitted successfully', {
        id: toastId,
        position: toastPosition || 'top-right',
      });
      setUploadStatus('success');
      onImportSuccess?.(response);
    } finally {
      setIsSubmitting(false);
    }
  };
  const fetchBankAccounts = async (companyId: string) => {
    if (isFetching.current) return;
    isFetching.current = true;

    try {
      const res = await getBankAccountsForCompany(companyId);

      if (!res.success) {
        toast.error(res.message || 'Failed to fetch bank accounts');
        return;
      }
      setCompanyBankAccounts(res.data);
    } catch (error) {
      toast.error('Failed to fetch bank accounts');
    } finally {
      isFetching.current = false;
    }
  };

  const onNewBankAccount = (newAccount?: BankAccountWithMeta) => {
    if (newAccount) {
      setCompanyBankAccounts((prev) =>
        prev ? [...prev, newAccount] : [newAccount],
      );
    }

    setSelectedBankAccount(newAccount ?? null);
    setDialogOpen(false);
    if (companyId) {
      fetchBankAccounts(companyId); // re-fetch for consistency
    }
  };

  useEffect(() => {
    if (!companyId) {
      return;
    }
    fetchBankAccounts(companyId);
  }, [companyId]);

  if (selectedStep === 'upload') {
    return (
      <div
        className={cn(
          'h-full text-sm w-full max-w-5xl mx-auto p-6 flex flex-col gap-6',
          importedClassName,
        )}
      >
        <>
          <h3 className="text-lg font-semibold">Import Bank Transactions</h3>

          {/* Guide and Template */}
          <div className="flex flex-col">
            <p>
              Create your statement file with our CSV template.
              {/* <br />
              You can also update your existing bank statement to match our
              template’s headers before uploading. */}
            </p>

            <p className="text-blue-500 hover:underline underline-offset-4 text-[13px]">
              <a
                href="/templates/bank-transactions-upload-template.csv"
                download
                className="flex gap-1 items-center"
              >
                Download CSV Template <ExternalLink size={12} />
              </a>
            </p>
          </div>
        </>

        {/* Nice to know */}
        {isMobile ||
          (!parsedResults?.length && (
            <div className="text-xs text-muted-foreground bg-muted p-4 rounded-md">
              <strong>For best results:</strong>
              <ul className="list-disc pl-4">
                <li>Save/export your file as CSV</li>
                <li>
                  Make sure all dates are in <b>YYYY-MM-DD</b> format (e.g.,
                  2025-06-07)
                </li>
                <li>Don’t include currency symbols or commas in amounts</li>
              </ul>
            </div>
          ))}

        <>
          {/* Transaction Importer */}
          <div className="flex flex-col h-full min-h-0 overflow-hidden border">
            {/* Select or add a bank account */}
            <FormField className="w-full space-y-0 flex-shrink-0">
              <AutocompleteDropdown
                id="bank-account"
                drawerTitle="Select Bank Account"
                items={companyBankAccounts || []}
                mapItem={(item) => ({
                  value: item.id,
                  label: `${item.displayName} ${maskDigits(
                    item.accountNumber,
                  )} (${item.currencyCode})`,
                })}
                value={selectedBankAccount?.id || ''}
                onValueChange={(id) => {
                  const found =
                    companyBankAccounts?.find((acc) => acc.id === id) ?? null;
                  setSelectedBankAccount(found);
                }}
                groupBy={isMobile ? '' : 'bankName'}
                actionItems={[
                  {
                    id: 'add-new',
                    label: 'Add New Bank Account',
                    icon: <Plus />,
                  },
                ]}
                onAction={(actionId) => {
                  if (actionId === 'add-new') {
                    setDialogOpen(true);
                  }
                }}
                emptyStateMessage="No bank accounts found"
                placeholder="Select a bank account..."
                // className="rounded-none border-none"
                className="rounded-none border-none"
              />
            </FormField>
            <hr />
            {/* Selected Bank Account */}
            {selectedBankAccount && (
              <div className="flex-shrink-0">
                <div className="bg-muted px-4 py-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <Building className="h-4 w-4 text-blue-600" />
                      </div>

                      <div>
                        <p className="font-medium">
                          {selectedBankAccount.bankName}
                        </p>
                        <p className="text-sm">
                          {selectedBankAccount.displayName}{' '}
                          {maskDigits(selectedBankAccount.accountNumber)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right hidden">
                      <p className="text-sm">Balance</p>
                      <p className="font-semibold">
                        <FormattedAmount
                          amount={selectedBankAccount.balance ?? 0}
                          currency={selectedBankAccount.currencyCode}
                          showSymbol={true}
                          showCode
                          codeClassName="text-muted-foreground text-xs"
                        />
                      </p>
                    </div>
                  </div>
                </div>
                <hr />
              </div>
            )}
            <div className="flex-1 overflow-auto min-h-0 scrollbar-thin-2px">
              {/* Spreadsheet Importer */}
              <SpreadsheetImporter
                fields={bankTransactionImporterfields}
                onParsed={handleParsed}
                onError={handleError}
                maxRows={5000}
                uploaderDisabled={!selectedBankAccount}
                uploaderClassName={cn(
                  'rounded-none border-none',
                  parsedResults && parsedResults[0]?.isValid ? 'h-full' : '',
                )}
              />
            </div>
          </div>
          {/* Add Bank Account Dialog */}
          <AddBankAccountDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            onSuccess={onNewBankAccount}
            onCancel={() => setDialogOpen(false)}
            overlayClassName="bg-black/85"
          />
        </>

        {/* Submit */}
        <div className="flex justify-end">
          <hr />
          <Button
            type="button"
            disabled={!selectedBankAccount}
            onClick={handleReview}
          >
            Review Transactions
          </Button>
        </div>
      </div>
    );
  }

  if (selectedStep === 'review') {
    return (
      <div
        className={cn(
          'h-full text-sm w-full min-w-0 max-w-5xl mx-auto p-6 flex flex-col',
          importedClassName,
        )}
      >
        <>
          <div className="flex flex-col text-sm gap-6 h-full min-h-0">
            {fileTransactions?.map((tx, idx) => {
              const { transactions, stats, bankAccount } = tx;
              const displayFields = getDisplayFields({
                fields: bankTransactionImporterfields,
                parsedHeaders: parsedResults?.[idx]?.headers,
              });

              return (
                <React.Fragment key={`${tx.fileName}-${idx}`}>
                  <div>
                    <div className="border-b font-semibold text-lg">
                      Bank Account
                    </div>

                    <div className="bg-muted inset-shadow-sm p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="p-2 bg-blue-100 rounded-lg">
                            <Building className="h-4 w-4 text-blue-600" />
                          </div>

                          <div>
                            <p className="font-medium">
                              {bankAccount.bankName}
                            </p>
                            <p className="text-sm">
                              {bankAccount.displayName}{' '}
                              {maskDigits(bankAccount.accountNumber)}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div key={`${idx}-${tx.fileName}`}>
                    <div className="border-b font-semibold text-lg">
                      Import Summary
                    </div>
                    <div
                      // className="grid grid-cols-1 sm:grid-cols-2 lg:[grid-template-columns:repeat(auto-fit,minmax(200px,1fr))] gap-3 inset-shadow-sm pt-4"
                      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[auto_1fr_1fr_1fr] gap-3 inset-shadow-sm pt-4"
                    >
                      <Card className="p-0 rounded-lg shadow-none">
                        <CardContent className="p-4 overflow-hidden">
                          <div className="flex items-center space-x-2">
                            <div className="p-2 bg-blue-100 rounded-lg">
                              <Activity className="h-4 w-4 text-blue-600" />
                            </div>
                            <div>
                              <p className="text-sm text-gray-600 truncate">
                                Transactions
                              </p>
                              <p className="text-xl font-semibold truncate">
                                {stats.transactionCount || transactions.length}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="p-0 rounded-lg shadow-none">
                        <CardContent className="p-4 overflow-hidden">
                          <div className="flex items-center space-x-2">
                            <div className="p-2 bg-green-100 rounded-lg">
                              <TrendingUp className="h-4 w-4 text-green-600" />
                            </div>
                            <div>
                              <p className="text-sm text-gray-600 truncate">
                                Money In
                              </p>
                              <p className="text-lg font-semibold text-green-600 truncate">
                                <FormattedAmount
                                  amount={stats.totalPositive}
                                  currency={bankAccount.currencyCode}
                                  showSymbol
                                />
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="p-0 rounded-lg shadow-none">
                        <CardContent className="p-4 overflow-hidden">
                          <div className="flex items-center space-x-2">
                            <div className="p-2 bg-red-100 rounded-lg">
                              <TrendingDown className="h-4 w-4 text-red-600" />
                            </div>
                            <div>
                              <p className="text-sm text-gray-600 truncate">
                                Money Out
                              </p>
                              <p className="text-lg font-semibold text-red-600 truncate">
                                <FormattedAmount
                                  amount={stats.totalNegative}
                                  currency={selectedBankAccount?.currencyCode}
                                  showSymbol
                                />
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="p-0 rounded-lg shadow-none">
                        <CardContent className="p-4 overflow-hidden">
                          <div className="flex items-center space-x-2">
                            <div className="p-2 bg-gray-100 rounded-lg">
                              <DollarSign className="h-4 w-4 text-gray-600" />
                            </div>
                            <div>
                              <p className="text-sm text-gray-600 truncate">
                                Net Change
                              </p>
                              <p className="text-lg font-semibold truncate">
                                <FormattedAmount
                                  amount={stats.netChange}
                                  currency={selectedBankAccount?.currencyCode}
                                  showSymbol
                                  // symbolClassName="text-sm text-muted-foreground"
                                />
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </div>

                  <div className="flex flex-col flex-1 min-h-0 h-full">
                    <div className="font-semibold text-lg">
                      Transactions to import
                    </div>
                    <div className="flex-1 min-h-0 flex flex-col overflow-clip mb-2 inset-shadow-sm relative">
                      {(isSubmitting || uploadStatus) && (
                        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/40 backdrop-blur-sm">
                          {isSubmitting && (
                            <CenteredLoader
                              loader={
                                <div className="flex flex-col gap-2 items-center">
                                  <PuffLoader />
                                  <div>Uploading ...</div>
                                </div>
                              }
                            />
                          )}
                          {uploadStatus === 'success' && <Success />}
                          {uploadStatus === 'failed' && <Failed />}
                        </div>
                      )}
                      {/* Fixed Header */}
                      <div role="table" className="bg-muted/50">
                        <div role="rowgroup" className="last:border-b">
                          <div role="row" className="flex border-b min-w-0">
                            {displayFields.map((f) => {
                              const columnPercentWidth = `${100 / displayFields.length}%`;
                              return (
                                <div
                                  key={f.value}
                                  role="columnheader"
                                  className={cn(
                                    'flex-1 p-2.5 first:pl-4 last:pr-4 text-sm font-medium truncate text-left',
                                    f.className ?? '',
                                  )}
                                  style={{
                                    flex: f.width ? `0 0 ${f.width}` : '1 1 0%',
                                    width: f.width
                                      ? f.width
                                      : columnPercentWidth,
                                    minWidth: f.width ? f.width : '5rem',
                                  }}
                                >
                                  {f.label}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Scrollable Body */}
                      <div
                        role="table"
                        className="flex-1 overflow-auto scrollbar-thin-2px"
                      >
                        <div role="rowgroup">
                          {transactions.map((row: any, rowIdx: number) => (
                            <div
                              key={rowIdx}
                              role="row"
                              className="flex border-b last:border-b-0 hover:bg-muted/50"
                            >
                              {displayFields.map((f, fIdx) => {
                                const cell =
                                  f.render?.(
                                    row[f.value],
                                    row,
                                    rowIdx,
                                    bankAccount.currencyCode,
                                  ) ??
                                  row[f.value] ??
                                  '';

                                const columnPercentWidth = `${100 / displayFields.length}%`;

                                return (
                                  <div
                                    key={`${f.value}-${fIdx}`}
                                    className={`flex-1 first:pl-4 last:pr-4 p-2 text-sm truncate ${
                                      f.align === 'right'
                                        ? 'text-right'
                                        : f.align === 'center'
                                          ? 'text-center'
                                          : 'text-left'
                                    } ${f.className ?? ''}`}
                                    style={{
                                      flex: f.width
                                        ? `0 0 ${f.width}`
                                        : '1 1 0%',
                                      width: f.width
                                        ? f.width
                                        : columnPercentWidth,
                                      minWidth: f.width ? f.width : '5rem',
                                    }}
                                  >
                                    {typeof cell === 'object' &&
                                    !React.isValidElement(cell)
                                      ? JSON.stringify(cell)
                                      : cell}
                                  </div>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2 justify-end pt-4 bg-background mt-auto border-t">
                      <Button
                        type="button"
                        variant={'outline'}
                        onClick={handleBack}
                        disabled={
                          isSubmitting ||
                          selectedStep !== 'review' ||
                          uploadStatus === 'success'
                        }
                      >
                        Back
                      </Button>

                      <Button
                        type="button"
                        onClick={handleSubmit}
                        disabled={
                          isSubmitting ||
                          selectedStep !== 'review' ||
                          typeof uploadStatus === 'string'
                        }
                      >
                        All good, upload
                      </Button>
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </>
      </div>
    );
  }

  return null;
};
