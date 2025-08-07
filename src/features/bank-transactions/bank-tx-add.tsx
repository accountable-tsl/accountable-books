import { BankTransactionImporter } from "@/features/bankConnection/manualUpload/BankTransactionImporter";
import { BankAccount } from "../onboarding/steps/BankAccount";

export function AddBankTransaction() {
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

        <BankTransactionImporter />
      </div>
    </div>
  );
}
