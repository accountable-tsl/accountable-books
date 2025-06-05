import { FileUploader } from "@/components/FileUploader";

import { getBankAccounts } from "@/domains/bankAccounts/services";
import { BankAccount, BankAccounts } from "@/domains/bankAccounts/types";
import { useState } from "react";
import { FormField } from "./FormField";
import { AutocompleteDropdown } from "./AutocompleteDropdown";
import { Plus } from "lucide-react";

interface BankAccountImporterProps {
  bankAccounts?: BankAccounts;
}
export const BankAccountImporter = ({
  bankAccounts: initialBankAccounts = [],
}: BankAccountImporterProps) => {
  // By default show bank accounts for the current company unless overridden by props
  const [bankAccounts, setBankAccounts] =
    useState<BankAccounts>(initialBankAccounts);
  const [selectedBankAccount, setSelectedBankAccount] =
    useState<BankAccount | null>(null);

  //   const fetchBankAccounts = async (companyId: string) => {
  //     const response = await getBankAccounts(companyId);
  //     if (response.success) {
  //       setBankAccounts(response.data.bankAccounts);
  //     } else {
  //       console.error("Failed to fetch bank accounts:", response);
  //       setError("Failed to fetch bank accounts. Please try again later.");
  //     }
  //   };

  return (
    <>
      <div className="w-full max-w-4xl mx-auto rounded-lg overflow-hidden shadow-md p-6">
        <div className="grid grid-cols-2 grid-rows-[auto_1fr] ">
          <div className="">
            <FormField
              //   id="industry"
              //   label="Industry"
              //   error={errors.industry?.message}
              //   helpTooltip={TOOLTIP.industry || ""}
              className="w-full"
              //   required
            >
              <AutocompleteDropdown
                id="bank-account"
                items={bankAccounts || []}
                mapItem={(item) => ({
                  value: item.id,
                  label: item.displayName,
                })}
                // onValueChange={(value) => {
                //   setSelectedBankAccount(value);
                // }}
                actionItems={[
                  {
                    id: "add-new",
                    label: "Add New Bank Account",
                    icon: <Plus className="mr-2 h-4 w-4" />,
                  },
                ]}
                // onAction={(actionId) => {
                //   if (actionId === "add-new") {
                //     // Open your add bank account modal/form
                //     openAddBankAccountModal();
                //     // Optionally close the dropdown
                //     // setOpen(false); // if you had access to setOpen
                //   }
                // }}
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
            />
          </div>
        </div>
      </div>
    </>
  );
};
