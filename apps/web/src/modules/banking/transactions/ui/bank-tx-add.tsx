import { useMediaQuery } from '@/shared/hooks/use-media-query';
import { SmallScreenMessage } from '@/components/SmallScreenMessage';
import { UploadBankTransactions } from '../manual-upload/upload';

export function AddBankTransaction() {
  const is1024 = useMediaQuery('(max-width: 1023px)');

  if (is1024) return <SmallScreenMessage />;

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

        {/* <BankTransactionImporter /> */}
        <UploadBankTransactions />
      </div>
    </div>
  );
}
