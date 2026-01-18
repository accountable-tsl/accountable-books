import { useSession } from '@session';
import { Send, Upload, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { CenteredLoader } from '@/components/CenteredLoader';
import { DataTable } from '@/components/data-table/data-table';
import { useDataTable } from '@/components/data-table/use-data-table';
import ErrorPage from '@/components/ErrorPage';
import { FormattedAmount } from '@/components/FormattedAmount';
import { Success } from '@/components/Success';
import { Button } from '@/components/ui/button';
import { SpreadsheetImporter } from '@/domains-pending-migration/spreadsheets/SpreadsheetImporter';
import type { ParsedCsvResult } from '@/domains-pending-migration/spreadsheets/types';
import { BankDropdown } from '@/features/upload-bank-transactions/ui/components/bank-selection/dropdown';
import { FailedRowsDisplay } from '@/features/upload-bank-transactions/ui/components/failed-rows';
import { fields } from '@/features/upload-bank-transactions/ui/config/import-fields';
import { getBankTxnFields } from '@/features/upload-bank-transactions/ui/config/table-columns';
import { cn } from '@/lib/utils';
import type { BankAccountWithMeta } from '@/modules/banking/accounts';
import { useCompanyBankAccounts } from '@/modules/banking/accounts';
import {
  generateSourceMetadata,
  useUploadBankTransactions,
} from '@/modules/banking/csv-upload';
import type { BankTransactionBatchInsert } from '@/modules/banking/csv-upload/model/types';
import { bankTransactionSource } from '@/modules/banking/csv-upload/model/types';
import { transformParsedData } from '@/modules/banking/csv-upload/utils/transaction-parsers';
import { sleep } from '@/shared/utils/random-utils';

import { SelectedBankAccount } from './components/bank-selection/selected-account';

export function UploadBankTransactions() {
  const [selectedBankAccount, setSelectedBankAccount] =
    useState<BankAccountWithMeta | null>(null);
  const [parsed, setParsed] = useState<ParsedCsvResult | null>(null);
  const [batchInsert, setBatchInsert] = useState<
    BankTransactionBatchInsert | undefined
  >(undefined);

  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadSuccessMessage, setUploadSuccessMessage] = useState<
    string | undefined
  >(undefined);

  const navigate = useNavigate();
  const { companyId, loading, tenantRoutes } = useSession();
  const { data: rawBankAccounts, isLoading: loadingBankAccounts } =
    useCompanyBankAccounts(companyId ?? '');
  const uploadBankTxnMutation = useUploadBankTransactions();

  const bankAccounts = useMemo(
    () => rawBankAccounts?.data || [],
    [rawBankAccounts],
  );

  const handleParsedFile = useCallback((results: ParsedCsvResult[]) => {
    setParsed(results[0]);
  }, []);

  const {
    transactions: parsedBankTxns,
    inserts,
    errors: transactionErrors,
    totalMoneyIn,
    totalMoneyOut,
  } = useMemo(() => {
    return transformParsedData({
      data: parsed?.data,
      bankAccountId: selectedBankAccount?.id ?? '',
    });
  }, [parsed?.data, selectedBankAccount?.id]);

  useEffect(() => {
    let isMounted = true;

    const computeBatchInsert = async () => {
      if (!parsed?.file || !selectedBankAccount?.id || !inserts?.length) {
        return undefined;
      }

      return {
        source: bankTransactionSource.enum.file_import,
        bank_account_id: selectedBankAccount.id,
        bank_transactions: inserts,
        metadata: generateSourceMetadata(parsed.file),
      };
    };

    computeBatchInsert().then((result) => {
      if (isMounted) setBatchInsert(result);
    });

    return () => {
      isMounted = false;
    };
  }, [inserts, selectedBankAccount?.id, parsed?.file]);

  const handleSubmit = useCallback(async () => {
    if (!batchInsert) return;

    setIsUploading(true);
    setUploadError(null);

    await sleep(1000);

    try {
      console.log('batchInsert', batchInsert);
      const response = await uploadBankTxnMutation.mutateAsync(
        {
          companyId: companyId ?? '',
          data: batchInsert,
        },
        {
          onSuccess: (response) => {
            toast.success(
              response.message || 'Transactions uploaded successfully',
            );
          },
          onError: (error) => {
            toast.error(error.message || 'Failed to upload transactions');
          },
        },
      );

      if (response.success) {
        setUploadSuccess(true);
        setUploadSuccessMessage(response.message);
      } else {
        setUploadError(response.message || 'Failed to upload transactions');
      }
    } catch (error: unknown) {
      setUploadError(
        (error as Error).message || 'Failed to upload transactions',
      );
    } finally {
      setIsUploading(false);
    }
  }, [companyId, batchInsert, uploadBankTxnMutation]);

  const handleUploadNewFile = useCallback(() => {
    setParsed(null);
    setBatchInsert(undefined);
    setUploadSuccess(false);
    setUploadError(null);
    setIsUploading(false);
    setSelectedBankAccount(null);
  }, []);

  const handleNavigateToTransactions = useCallback(() => {
    if (tenantRoutes?.accounting?.catEngine) {
      navigate(tenantRoutes.accounting.catEngine());
    }
  }, [navigate, tenantRoutes]);

  const columns = useMemo(
    () => getBankTxnFields(selectedBankAccount?.currencyCode ?? ''),
    [selectedBankAccount?.currencyCode],
  );

  const { table } = useDataTable({
    columns,
    data: parsedBankTxns || [],
    customOptions: {
      customClassNames: {
        table: 'border-none rounded-none transition-all duration-300',
        wrapper: `p-0 gap-0 ${uploadSuccess || uploadError ? 'opacity-50' : ''}`,
      },
    },
  });

  // Clear parsed data when bank account is deselected
  useEffect(() => {
    if (!selectedBankAccount) {
      setParsed(null);
      setBatchInsert(undefined);
      setUploadSuccess(false);
      setUploadError(null);
      setIsUploading(false);
    }
  }, [selectedBankAccount]);

  const hasRows = (parsedBankTxns?.length ?? 0) > 0;
  const hasErrors = transactionErrors.length > 0;
  const showInput = !hasRows && !hasErrors;
  const canSubmit = batchInsert && !isUploading && !uploadSuccess;

  if (loading || loadingBankAccounts) return <CenteredLoader />;
  if (!companyId || !tenantRoutes) return <ErrorPage type="default" />;

  return (
    <div className="h-full min-h-0 overflow-y-auto p-4">
      <div className="flex h-full min-h-0 items-center justify-center gap-4">
        {/* <div>
          <div>Add Bank Transaction</div>
          <div className="text-muted-foreground text-sm">
            Manually upload bank transactions or statements via CSV file
          </div>
        </div> */}

        <div className="mx-auto w-full max-w-2xl space-y-6">
          <div className="space-y-4 text-center">
            <div className="bg-primary mx-auto flex h-12 w-12 items-center justify-center rounded-full">
              <Upload className="text-primary-foreground h-8 w-8" />
            </div>
            <div>
              <h2 className="text-lg font-medium">Upload bank transactions</h2>
              <p className="text-muted-foreground text-sm">
                Manually import data from your bank statements
              </p>
            </div>
          </div>
          {!hasRows && (
            <div className="space-y-2 text-sm">
              <div className="flex flex-col">
                <span>Create your statement file with our CSV template</span>
                <span>
                  <a
                    href="https://docs.google.com/spreadsheets/d/1odReHXPWoO6epMO11qMvdUL2FbXv4Qks9RVE08-4lDU"
                    target="_blank"
                    className="text-blue-600 hover:underline"
                    rel="noreferrer"
                  >
                    Open Google Sheets Template
                  </a>{' '}
                  <span className="text-muted-foreground text-xs">
                    (includes instructions)
                  </span>
                </span>
              </div>
              <div className="bg-muted w-full rounded-md p-4">
                <div className="font-semibold">For best results:</div>
                <ul className="list-inside list-disc text-xs md:text-sm">
                  <li>Format dates as YYYY-MM-DD (e.g., 2025-06-07) </li>
                  <li>Don’t include currency symbols or commas in amounts</li>
                </ul>
              </div>
            </div>
          )}
          <div className="container mx-auto max-w-6xl">
            <div className="mx-auto flex max-w-4xl flex-col gap-8">
              <div
                className={cn(
                  'flex w-full justify-between border text-sm',
                  hasRows ? '' : 'hidden', //opacity-0
                  'transition-opacity duration-300',
                )}
              >
                <div className="rounded-md p-4">
                  <div>#</div>
                  <div className="text-base">
                    {parsedBankTxns?.length ?? 0} rows
                  </div>
                </div>
                <div className="rounded-md p-4">
                  <div>Money In</div>
                  <div className="text-base font-medium text-green-500">
                    <FormattedAmount
                      amount={totalMoneyIn}
                      currency={selectedBankAccount?.currencyCode}
                      showCode
                      codePosition="prefix"
                    />
                  </div>
                </div>
                <div className="rounded-md p-4">
                  <div>Money Out</div>
                  <div className="text-destructive text-base font-medium">
                    <FormattedAmount
                      amount={totalMoneyOut}
                      currency={selectedBankAccount?.currencyCode}
                      showCode
                      codePosition="prefix"
                    />
                  </div>
                </div>
              </div>

              <div className="flex h-full min-h-0 w-full flex-col overflow-hidden border">
                <BankDropdown
                  bankAccounts={bankAccounts}
                  selectedBankAccount={selectedBankAccount}
                  setSelectedBankAccount={setSelectedBankAccount}
                />
                {selectedBankAccount && (
                  <SelectedBankAccount
                    selectedBankAccount={selectedBankAccount}
                  />
                )}
                <div className="scrollbar-thin-2px min-h-0 flex-1 overflow-auto">
                  {showInput && (
                    <SpreadsheetImporter
                      fields={fields}
                      onParsed={handleParsedFile}
                      maxRows={5000}
                      uploaderDisabled={!selectedBankAccount}
                      uploaderClassName={cn(
                        'rounded-none border-none',
                        selectedBankAccount ? 'h-full' : '',
                        parsed?.file ? 'hidden' : '',
                      )}
                      showCustomFileCard={false}
                      fileCardContainerClassName="border-0"
                    />
                  )}
                  {transactionErrors.length > 0 && (
                    <FailedRowsDisplay errors={transactionErrors} />
                  )}
                  {parsedBankTxns?.length > 0 && (
                    <div className="relative flex h-[200px] max-h-[200px] min-h-0 transform flex-col transition-all duration-500 ease-in-out">
                      <DataTable table={table} />

                      {(isUploading || uploadError || uploadSuccess) && (
                        <div
                          className={cn(
                            'absolute inset-0 z-10 flex items-center justify-center bg-black/50 dark:bg-black/70',
                            uploadError ? 'bg-red-200/50' : '',
                            uploadSuccess ? 'bg-green-100/30' : '',
                          )}
                        >
                          {isUploading && (
                            <CenteredLoader message="Uploading..." />
                          )}
                          {uploadError && (
                            <div className="text-destructive flex flex-col items-center gap-2">
                              <X className="h-8 w-8" />
                              <span>{uploadError}</span>
                            </div>
                          )}
                          {uploadSuccess && (
                            <Success description={uploadSuccessMessage} />
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex w-full items-center justify-between gap-2">
                <Button
                  variant="outline"
                  disabled={!hasRows || hasErrors}
                  onClick={handleUploadNewFile}
                >
                  Upload New File
                </Button>
                <div
                  className="text-muted-foreground hover:text-foreground flex-1 cursor-pointer text-center text-xs hover:underline"
                  onClick={() => navigate(tenantRoutes?.banking.connect())}
                >
                  Connect bank
                </div>
                {uploadSuccess ? (
                  <Button onClick={handleNavigateToTransactions}>
                    Go to transactions
                  </Button>
                ) : (
                  <Button
                    disabled={!canSubmit}
                    className="ml-auto flex items-center gap-1"
                    onClick={handleSubmit}
                  >
                    <Send className="h-4 w-4" />
                    {isUploading
                      ? 'Uploading...'
                      : uploadError
                        ? 'Try again'
                        : 'Submit Transactions'}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
