import type { EnrichedAccountType } from '@/domains-pending-migration/account-classification/types';
import type {
  ParsedCsvResult,
  SpreadsheetImporterField,
} from '@/domains-pending-migration/spreadsheets/types';
import type { CreateCoa } from '@/modules/accounting/chart-of-accounts';
import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { SpreadsheetImporter } from '@/domains-pending-migration/spreadsheets/SpreadsheetImporter';
import { queryClient } from '@/lib/queryClient';
import { cn } from '@/lib/utils';
import {
  createCoaSchema,
  useCompanyCoa,
} from '@/modules/accounting/chart-of-accounts';
import { XCircle } from 'lucide-react';

const CSV_FIELDS: Array<SpreadsheetImporterField> = [
  {
    label: 'Code',
    value: 'code',
    possibleFields: ['code', 'Code', 'Account Code', 'account_code'],
  },
  {
    label: 'Account Name',
    value: 'name',
    possibleFields: [
      'account name',
      'account_name',
      'Account Name',
      '*Account Name',
      'Account Name*',
      'name',
      'name*',
      '*name',
      'Name',
      'Name*',
    ],
    required: true,
  },
  {
    label: 'Account Type',
    value: 'accountType',
    possibleFields: [
      'type',
      'Type',
      'Account Type',
      '*Account Type',
      'Account Type*',
      'account type',
      'account_type',
      'accountType',
    ],
    required: true,
  },
  {
    label: 'Key',
    value: 'accountTypeKey',
    possibleFields: [
      'key',
      'Account Type Key',
      'Account Type Key 🔒',
      '*Account Type Key',
      'Account Type Key*',
      'account type key',
      'account_type_key',
    ],
    required: true,
  },
  {
    label: 'Description',
    value: 'description',
    possibleFields: ['description', 'Description'],
  },
];
export function CoaImportCsv({
  companyId,
  accountTypeByKey,
  onSubmit,
  onClose,
}: {
  companyId: string;
  accountTypeByKey: Map<string, EnrichedAccountType>;
  onSubmit: (data: CreateCoa[]) => Promise<void>;
  onClose?: () => void;
}) {
  const { isDuplicateCode, isDuplicateName } = useCompanyCoa(companyId);
  //   const [parsed, setParsed] = useState<ParsedCsvResult | null>(null);
  const [coaData, setCoaData] = useState<CreateCoa[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [processingErrors, setProcessingErrors] = useState<
    Array<{ row: number; errors: string[] }>
  >([]);

  const clearState = useCallback(() => {
    setCoaData([]);
    setError(null);
    setProcessingErrors([]);
  }, []);

  const handleParsedCsv = useCallback(
    (data: ParsedCsvResult[]) => {
      // Reset state for new import
      clearState();
      queryClient.invalidateQueries({
        queryKey: ['coa', companyId],
        exact: false,
      });

      try {
        const parsed = data[0];
        //   setParsed(parsed);
        if (!parsed || !parsed.data) {
          setError('No data found in the CSV file.');
          return;
        }

        if (parsed.error) {
          setError(parsed.error);
          return;
        }

        const parsedData = Array.isArray(parsed.data)
          ? parsed.data
          : [parsed.data];
        const results: CreateCoa[] = [];
        const allErrors: Array<{ row: number; errors: string[] }> = [];
        const seenCodes = new Set();
        const seenNames = new Set();

        for (let i = 0; i < parsedData.length; i++) {
          const row = parsedData[i];
          const rowNumber = i + 1;
          const rowErrors: string[] = [];

          // Convert and trim values
          const code = String(row['code'] || '').trim();
          const name = String(row['name'] || '').trim();
          const accountType = String(row['accountType'] || '').trim();
          const accountTypeKey = String(row['accountTypeKey'] || '').trim();
          const description = row['description']
            ? String(row['description']).trim()
            : null;

          // Validate required fields
          if (!name || !accountType || !accountTypeKey) {
            rowErrors.push(`Missing required fields`);
          }

          // Check for duplicate codes within CSV
          if (code && seenCodes.has(code)) {
            rowErrors.push(`Duplicate code '${code}' found in CSV`);
          }

          // Check for duplicate names within CSV
          if (name && seenNames.has(name)) {
            rowErrors.push(`Duplicate name '${name}' found in CSV`);
          }

          // Make sure code does not already exist for the company
          if (code && isDuplicateCode(code)) {
            rowErrors.push(`Code '${code}' already exists in system`);
          }

          // Make sure name does not already exist for the company
          if (!name) {
            rowErrors.push(`Missing account name`);
          } else if (name && isDuplicateName(name)) {
            rowErrors.push(`Name '${name}' already exists in system`);
          }

          // Check that type is valid
          if (!accountType) {
            rowErrors.push(`Missing account type`);
          }

          // Check that account type key is valid
          if (!accountTypeKey) {
            rowErrors.push(`Missing account type key`);
          } else if (!accountTypeByKey.has(accountTypeKey)) {
            rowErrors.push(`Invalid account type key '${accountTypeKey}'`);
          }

          // If we have errors, skip schema validation and add to errors array
          if (rowErrors.length > 0) {
            allErrors.push({ row: rowNumber, errors: rowErrors });
            continue;
          }

          // Construct the CreateCoa object
          const coa: CreateCoa = {
            code,
            name,
            accountTypeKey,
            description,
          };

          // Validate against the schema
          const validation = createCoaSchema.safeParse(coa);
          if (!validation.success) {
            // Format Zod errors more nicely
            const errorMessages = validation.error.errors
              .map((err) => `${err.path.join('.')}: ${err.message}`)
              .join(', ');
            allErrors.push({ row: rowNumber, errors: [errorMessages] });
            continue;
          }

          // Success??  Add to results and tracking sets
          seenCodes.add(code);
          seenNames.add(name);
          results.push(validation.data);
        }

        // Handle batch results
        if (allErrors.length > 0) {
          const errorSummary = allErrors
            .slice(0, 5) // Show first 5 error rows
            .map(({ row, errors }) => `Row ${row}: ${errors.join(', ')}`)
            .join('\n');

          setError(
            `Found errors in ${allErrors.length} rows:\n${errorSummary}${
              allErrors.length > 5 ? '\n...' : ''
            }`,
          );
          setProcessingErrors(allErrors);
        }

        setCoaData(results);
      } catch (error) {
        setError('Failed to process CSV file');
      }
    },
    [isDuplicateCode, isDuplicateName, accountTypeByKey, clearState, companyId],
  );

  const onImportClick = async () => {
    // If we have no data, do nothing
    if (coaData.length === 0) {
      setError('No valid data to import');
      return;
    }

    // Send to server
    await onSubmit(coaData);
  };

  const handleCancel = () => {
    clearState();
    onClose?.();
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col justify-between gap-6">
      <div className="flex flex-col">
        <a
          href="https://docs.google.com/spreadsheets/d/1esQsP0H9gAZy_JAsz9CRVVYKlbHI7YGbofXJE5y6WAc"
          target="_blank"
          className="text-blue-600 hover:underline"
          rel="noreferrer"
        >{`[Open Google Sheets Template]`}</a>

        <ul className="list-disc pt-4 pl-4">
          <li>Complete the template and upload below</li>
          <li>Instructions are on the first sheet</li>
        </ul>
      </div>

      {!error && processingErrors.length === 0 && (
        <SpreadsheetImporter
          fields={CSV_FIELDS}
          onParsed={handleParsedCsv}
          maxRows={999}
          wrapperClassName="min-w-0 w-full max-w-full"
          uploaderClassName={cn('max-h-40', coaData.length > 0 ? 'hidden' : '')}
          uploaderDisabled={coaData.length > 0}
          showUnexpectedColumnsWarning={false}
        />
      )}

      {(error || processingErrors.length > 0) && (
        <ErrorBanner
          error={error}
          processingErrors={processingErrors}
          errorsToShow={10}
        />
      )}

      <div className="flex">
        {processingErrors.length > 0 ? (
          <Button variant="secondary" onClick={clearState}>
            Upload again
          </Button>
        ) : (
          <Button variant="secondary" onClick={handleCancel}>
            Cancel
          </Button>
        )}
        <Button
          className="ml-auto"
          disabled={
            coaData.length === 0 ||
            processingErrors.length > 0 ||
            error !== null
          }
          onClick={onImportClick}
        >
          Import
        </Button>
      </div>
    </div>
  );
}

type ProcessingError = { row: number; errors: string[] };

const ErrorBanner = ({
  error,
  processingErrors: errors,
  errorsToShow = 5,
}: {
  error: string | null;
  processingErrors: ProcessingError[];
  errorsToShow?: number;
}) => (
  <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-4">
    <div className="flex">
      <div className="flex-shrink-0">
        <XCircle className="h-5 w-5 text-red-400" />
      </div>
      <div className="ml-3">
        <h3 className="text-sm font-medium text-red-800">
          Found {errors.length} rows with error{errors.length !== 1 ? 's' : ''}
        </h3>

        <div className="scrollbar-thin-2px mt-2 max-h-40 overflow-y-auto text-sm text-red-700">
          {error && errors.length === 0 && <>{error}</>}
          <ul className="list-disc space-y-1 pl-4">
            {errors.slice(0, errorsToShow).map((err, idx) => (
              <li key={idx}>
                Row {err.row}: {err.errors.join('; ')}
              </li>
            ))}
            {errors.length > errorsToShow && (
              <li>...and {errors.length - errorsToShow} more errors</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  </div>
);
