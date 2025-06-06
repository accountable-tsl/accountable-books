import { FileUploader } from "@/components/FileUploader";
import { useEffect, useState } from "react";
import { FormField } from "./FormField";
import { AutocompleteDropdown } from "./AutocompleteDropdown";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { getBankAccountsForCompany } from "@/features/bankAccount/api";
import { BankAccountWithMeta } from "@/features/bankAccount/types";
import { useCompany } from "@/domains/company/store";
import { maskDigits } from "@/shared/utils/formattingUtils";
import { AddBankAccountDialog } from "@/features/bankAccount/AddBankAccountDialog";
import { useIsMobile } from "@/hooks/use-mobile";

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
        <div className="grid grid-cols-2 grid-rows-[auto_1fr] ">
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
              />
            </FormField>
          </div>
          <div></div>
          <div className="col-span-2">
            <FileUploader
              accept={{ "text/csv": [] }}
              multiple={false}
              maxSize={2 * 1024 * 1024}
              maxFileCount={1}
              className=""
              disabled={!selectedBankAccount}
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
