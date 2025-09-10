import { useMediaQuery } from '@/shared/hooks/use-media-query';
import { SmallScreenMessage } from '@/components/SmallScreenMessage';
// import { UploadBankTransactions } from './upload';
import { BankTransactionImporter } from '@/domains-pending-migration/bankConnection/manualUpload/BankTransactionImporter';

export function AddBankTransaction() {
  const is1024 = useMediaQuery('(max-width: 1023px)');

  // if (is1024) return <SmallScreenMessage />;

  return (
    <div className="p-4 min-h-0 h-full overflow-y-auto">
      {/* <BankAccount /> */}
      <div className="flex flex-col gap-4 min-h-0">
        <div>
          <div>Add Bank Transaction</div>
          <div className="text-muted-foreground text-sm">
            Manually upload bank transactions or statements via CSV file
          </div>
        </div>

        <div className="max-w-2xl mx-auto w-full space-y-4">
          <div className="space-y-2 text-sm">
            <div className="flex flex-col">
              <span>Create your statement file with our CSV template</span>
              <span>
                <a
                  href="https://docs.google.com/spreadsheets/d/1esQsP0H9gAZy_JAsz9CRVVYKlbHI7YGbofXJE5y6WAc"
                  target="_blank"
                  className="text-blue-600 hover:underline"
                >
                  Open Google Sheets Template
                </a>{' '}
                <span className="text-muted-foreground text-xs">(includes instructions)</span>
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

          {/* <BankTransactionImporter /> */}
          {/* <UploadBankTransactions className="p-0" /> */}
        </div>
      </div>
    </div>
  );
}
