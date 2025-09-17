import { CenteredLoader } from '@/components/CenteredLoader';
import ErrorPage from '@/components/ErrorPage';
import type { BankAccountWithMeta } from '@/modules/banking/accounts';
import { useSession } from '@session';
import { BankDropdown } from '@/features/upload-bank-transactions/ui/components/bank-selection/dropdown';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SelectedBankAccount } from './components/bank-selection/selected-account';
import { SpreadsheetImporter } from '@/domains-pending-migration/spreadsheets/SpreadsheetImporter';
import { cn } from '@/lib/utils';
import type { ParsedCsvResult } from '@/domains-pending-migration/spreadsheets/types';
import {
  bankTransactionSource,
  type BankTransactionBatchInsert,
} from '@/modules/banking/csv-upload/model/types';
import { transformParsedData } from '@/modules/banking/csv-upload/utils/transaction-parsers';
import { FailedRowsDisplay } from '@/features/upload-bank-transactions/ui/components/failed-rows';
import { useDataTable } from '@/components/data-table/use-data-table';
import { DataTable } from '@/components/data-table/data-table';
import { getBankTxnFields } from '@/features/upload-bank-transactions/ui/config/table-columns';
import { generateSourceMetadata } from '@/modules/banking/csv-upload';
import { FormattedAmount } from '@/components/FormattedAmount';
import { Button } from '@/components/ui/button';
import { Send, Upload, X } from 'lucide-react';
import { Success } from '@/components/Success';
import { useNavigate } from 'react-router';
import { sleep } from '@/shared/utils/random-utils';
import { fields } from '@/features/upload-bank-transactions/ui/config/import-fields';
import { useUploadBankTransactions } from '@/modules/banking/csv-upload';
import { useCompanyBankAccounts } from '@/modules/banking/accounts';
import { toast } from 'sonner';

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
    <div className="p-4 min-h-0 h-full overflow-y-auto">
      <div className="flex gap-4 min-h-0 h-full items-center justify-center">
        {/* <div>
          <div>Add Bank Transaction</div>
          <div className="text-muted-foreground text-sm">
            Manually upload bank transactions or statements via CSV file
          </div>
        </div> */}

        <div className="max-w-2xl mx-auto w-full space-y-6">
          <div className="text-center space-y-4">
            <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center mx-auto">
              <Upload className="w-8 h-8 text-primary-foreground" />
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
                  >
                    Open Google Sheets Template
                  </a>{' '}
                  <span className="text-muted-foreground text-xs">
                    (includes instructions)
                  </span>
                </span>
              </div>
              <div className="w-full bg-muted p-4 rounded-md">
                <div className="font-semibold">For best results:</div>
                <ul className="list-disc list-inside text-xs md:text-sm ">
                  <li>Format dates as YYYY-MM-DD (e.g., 2025-06-07) </li>
                  <li>Don’t include currency symbols or commas in amounts</li>
                </ul>
              </div>
            </div>
          )}
          <div className="container mx-auto max-w-6xl">
            <div className="flex flex-col gap-8 max-w-4xl mx-auto">
              <div
                className={cn(
                  'flex justify-between text-sm w-full border',
                  hasRows ? '' : 'hidden', //opacity-0
                  'transition-opacity duration-300',
                )}
              >
                <div className="p-4 rounded-md">
                  <div>#</div>
                  <div className="text-base">
                    {parsedBankTxns?.length ?? 0} rows
                  </div>
                </div>
                <div className="p-4 rounded-md">
                  <div>Money In</div>
                  <div className="text-green-500 font-medium text-base">
                    <FormattedAmount
                      amount={totalMoneyIn}
                      currency={selectedBankAccount?.currencyCode}
                      showCode
                      codePosition="prefix"
                    />
                  </div>
                </div>
                <div className="p-4 rounded-md">
                  <div>Money Out</div>
                  <div className="text-destructive font-medium text-base">
                    <FormattedAmount
                      amount={totalMoneyOut}
                      currency={selectedBankAccount?.currencyCode}
                      showCode
                      codePosition="prefix"
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col h-full min-h-0 overflow-hidden w-full border">
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
                <div className="flex-1 overflow-auto min-h-0 scrollbar-thin-2px">
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
                    <div className="min-h-0 h-[200px] max-h-[200px] flex flex-col transform transition-all duration-500 ease-in-out relative">
                      <DataTable table={table} />

                      {(isUploading || uploadError || uploadSuccess) && (
                        <div
                          className={cn(
                            'absolute inset-0 flex items-center justify-center bg-black/50 dark:bg-black/70 z-10',
                            uploadError ? 'bg-red-200/50' : '',
                            uploadSuccess ? 'bg-green-100/30' : '',
                          )}
                        >
                          {isUploading && (
                            <CenteredLoader message="Uploading..." />
                          )}
                          {uploadError && (
                            <div className="text-destructive flex flex-col items-center gap-2">
                              <X className="w-8 h-8" />
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

              <div className="flex gap-2 w-full justify-between items-center">
                <Button
                  variant="outline"
                  disabled={!hasRows || hasErrors}
                  onClick={handleUploadNewFile}
                >
                  Upload New File
                </Button>
                <div
                  className="flex-1 text-center text-xs text-muted-foreground hover:underline hover:text-foreground cursor-pointer"
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
                    className="flex items-center gap-1 ml-auto"
                    onClick={handleSubmit}
                  >
                    <Send className="w-4 h-4" />
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
