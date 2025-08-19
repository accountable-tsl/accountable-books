import { CenteredLoader } from '@/components/CenteredLoader';
import ErrorPage from '@/components/ErrorPage';
import { useCompanyBankAccounts } from '@/domains/bank-accounts/hooks';
import { BankAccountWithMeta } from '@/domains/bank-accounts/types';
import { useSession } from '@/features/auth/Session';
import { BankDropdown } from '@/features/bank-transactions/manual-upload/components/bank-selection/dropdown';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SelectedBankAccount } from './components/bank-selection/selected-account';
import { SpreadsheetImporter } from '@/features/spreadsheets/SpreadsheetImporter';
import { cn } from '@/lib/utils';
import { ParsedCsvResult } from '@/features/spreadsheets/types';
import {
  BankTransactionBatchInsert,
  bankTransactionSource,
} from '@/features/bank-transactions/manual-upload/types';
import { transformParsedData } from '@/features/bank-transactions/manual-upload/services/transaction-parsers';
import { FailedRowsDisplay } from '@/features/bank-transactions/manual-upload/components/failed-rows';
import { useDataTable } from '@/components/data-table/use-data-table';
import { DataTable } from '@/components/data-table/data-table';
import { getBankTxnFields } from '@/features/bank-transactions/manual-upload/config/table-columns';
import { fields } from '@/features/bank-transactions/manual-upload/config/import-fields';
import { generateMeta } from './services/generate-meta';
import { FormattedAmount } from '@/components/FormattedAmount';
import { Button } from '@/components/ui/button';
import { Send, X } from 'lucide-react';
import { useUploadBankTransactions } from '@/features/bank-transactions/bank-tx-hooks';
import { Success } from '@/components/Success';
import { useNavigate } from 'react-router-dom';
import { sleep } from '@/shared/utils/random-utils';

export function UploadBankTransactions() {
  const [selectedBankAccount, setSelectedBankAccount] = useState<BankAccountWithMeta | null>(null);
  const [parsed, setParsed] = useState<ParsedCsvResult | null>(null);
  const [batchInsert, setBatchInsert] = useState<BankTransactionBatchInsert | undefined>(undefined);

  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  const navigate = useNavigate();
  const { companyId, loading, tenantRoutes } = useSession();
  const { data: rawBankAccounts, isLoading: loadingBankAccounts } = useCompanyBankAccounts(
    companyId ?? '',
  );
  const uploadBankTxnMutation = useUploadBankTransactions();

  const bankAccounts = useMemo(() => rawBankAccounts?.data || [], [rawBankAccounts]);

  const handleParsedFile = useCallback((results: ParsedCsvResult[]) => {
    setParsed(results[0]);
  }, []);

  const {
    transactions: parsedBankTxns,
    dateRange,
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
      if (
        !parsed?.file ||
        !selectedBankAccount?.id ||
        !dateRange?.earliestDate ||
        !dateRange?.latestDate ||
        !inserts?.length
      ) {
        return undefined;
      }

      const { fingerprint, sourceMetadata } = await generateMeta(parsed.file);
      return {
        startDate: dateRange.earliestDate,
        endDate: dateRange.latestDate,
        source: bankTransactionSource.enum.file_import,
        bankAccountId: selectedBankAccount.id,
        bankTransactions: inserts,
        fingerprint,
        sourceMetadata,
      };
    };

    computeBatchInsert().then((result) => {
      if (isMounted) setBatchInsert(result);
    });

    return () => {
      isMounted = false;
    };
  }, [dateRange, inserts, selectedBankAccount?.id, parsed?.file]);

  const handleSubmit = useCallback(async () => {
    if (!batchInsert) return;

    setIsUploading(true);
    setUploadError(null);

    await sleep(1000);

    try {
      const response = await uploadBankTxnMutation.mutateAsync({
        companyId: companyId ?? '',
        data: batchInsert,
      });

      if (response.success) {
        setUploadSuccess(true);
      } else {
        setUploadError(response.message || 'Failed to upload transactions');
      }
    } catch (error: unknown) {
      setUploadError(error.message || 'Failed to upload transactions');
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
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="flex flex-col gap-8 max-w-4xl mx-auto">
        <div
          className={cn(
            'flex justify-between text-sm w-full border',
            hasRows ? '' : 'opacity-0',
            'transition-opacity duration-300',
          )}
        >
          <div className="p-4 rounded-md">
            <div>#</div>
            <div>{parsedBankTxns?.length ?? 0} rows</div>
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
          {selectedBankAccount && <SelectedBankAccount selectedBankAccount={selectedBankAccount} />}
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
            {transactionErrors.length > 0 && <FailedRowsDisplay errors={transactionErrors} />}
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
                    {isUploading && <CenteredLoader message="Uploading..." />}
                    {uploadError && (
                      <div className="text-destructive flex flex-col items-center gap-2">
                        <X className="w-8 h-8" />
                        <span>{uploadError}</span>
                      </div>
                    )}
                    {uploadSuccess && <Success />}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2 w-full justify-between">
          <Button variant="outline" disabled={!hasRows || hasErrors} onClick={handleUploadNewFile}>
            Upload New File
          </Button>
          {uploadSuccess ? (
            <Button onClick={handleNavigateToTransactions}>Go to transactions</Button>
          ) : (
            <Button
              disabled={!canSubmit}
              className="flex items-center gap-1 ml-auto"
              onClick={handleSubmit}
            >
              <Send className="w-4 h-4" />
              {isUploading ? 'Uploading...' : uploadError ? 'Try again' : 'Submit Transactions'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
