import { FileUploader } from "@/components/FileUploader";
import { useEffect, useState } from "react";
import { FormField } from "./FormField";
import { AutocompleteDropdown } from "./AutocompleteDropdown";
import { Building, Plus } from "lucide-react";
import { toast } from "sonner";
import { getBankAccountsForCompany } from "@/features/bankAccount/api";
import { BankAccountWithMeta } from "@/features/bankAccount/types";
import { useCompany } from "@/domains/company/store";
import { formatAmount, maskDigits } from "@/shared/utils/formattingUtils";
import { AddBankAccountDialog } from "@/features/bankAccount/AddBankAccountDialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { FormattedAmount } from "./FormattedAmount";

export const BankTransactionImporter = () => {
  // States
  const [companyBankAccounts, setCompanyBankAccounts] = useState<
    BankAccountWithMeta[] | null
  >();
  const [selectedBankAccount, setSelectedBankAccount] =
    useState<BankAccountWithMeta | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Hooks
  const { companyId } = useCompany();
  const isMobile = useIsMobile();
  const fetchBankAccounts = async (companyId: string) => {
    try {
      const res = await getBankAccountsForCompany(companyId);

      if (!res.success) {
        toast.error(res.message || "Failed to fetch bank accounts");
      }
      setCompanyBankAccounts(res.data);
    } catch (error) {
      toast.error("Failed to fetch bank accounts");
    }
  };

  const onNewBankAccount = (newAccount?: BankAccountWithMeta) => {
    newAccount &&
      setCompanyBankAccounts((prev) =>
        prev ? [...prev, newAccount] : [newAccount]
      );

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
  return (
    <>
      <div className="w-full max-w-4xl mx-auto rounded-lg overflow-hidden shadow-md p-6">
        <div className="">
          <FormField className="w-full">
            <AutocompleteDropdown
              id="bank-account"
              drawerTitle="Select Bank Account"
              items={companyBankAccounts || []}
              mapItem={(item) => ({
                value: item.id,
                label: `${item.displayName} ${maskDigits(
                  item.accountNumber
                )} (${item.currencyCode})`,
              })}
              value={selectedBankAccount?.id || ""}
              onValueChange={(id) => {
                const found =
                  companyBankAccounts?.find((acc) => acc.id === id) ?? null;
                setSelectedBankAccount(found);
              }}
              groupBy={isMobile ? "" : "bankName"}
              actionItems={[
                {
                  id: "add-new",
                  label: "Add New Bank Account",
                  icon: <Plus />,
                },
              ]}
              onAction={(actionId) => {
                if (actionId === "add-new") {
                  setDialogOpen(true);
                }
              }}
              emptyStateMessage="No bank accounts found"
              placeholder="Select a bank account..."
              className="rounded-none border-none"
            />
          </FormField>
          <div></div>
          <div className="col-span-2">
            {selectedBankAccount && (
              <div className="bg-muted p-4">
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
                        {selectedBankAccount.displayName}{" "}
                        {maskDigits(selectedBankAccount.accountNumber)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm">Balance</p>
                    <p className="font-semibold">
                      {/* {formatAmount(selectedBankAccount.balance ?? 0, {
                        currency: selectedBankAccount.currencyCode,
                        showSymbol: true,
                      })} */}
                      <FormattedAmount
                        amount={selectedBankAccount.balance ?? 0}
                        currency={selectedBankAccount.currencyCode}
                        showSymbol={true}
                        showCode
                        codeClassName="text-muted-foreground text-xs"
                      />
                      {/* <span className="ml-1 text-sm">
                        {selectedBankAccount.currencyCode}
                      </span> */}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="col-span-2">
            <FileUploader
              accept={{ "text/csv": [] }}
              multiple={false}
              maxSize={2 * 1024 * 1024}
              maxFileCount={1}
              className=""
              disabled={!selectedBankAccount}
              // Using this without uploading immediately
              onValueChange={(files) => {
                const file = files[0];
                if (!file) return;
              }}
              // Alternatively, we could opt to upload the file immediately
              // e.g
              // onUpload={async (files) => {
              //   const file = files[0];
              //   if (!file) return;
              //   await onUpload(files);

              //   onParse({ file, limit: 1001 });
              //   setStep("map");
              // }}
            />
          </div>
        </div>
        <AddBankAccountDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSuccess={onNewBankAccount}
          onCancel={() => setDialogOpen(false)}
          overlayClassName="bg-black/85"
        />
      </div>
    </>
  );
};
