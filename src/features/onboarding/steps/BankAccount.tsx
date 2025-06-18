import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ConnectBankAccount from "@/features/bankConnection/connectViaFeed/ConnectBankAccount";
import { BankTransactionImporter } from "@/features/bankConnection/manualUpload/BankTransactionImporter";
import { useMemo, useState } from "react";

export const BankAccount = () => {
  const [activeTab, setActiveTab] = useState("connect");

  const tabContent = useMemo(
    () => ({
      connect: <ConnectBankAccount key="connect" />,
      upload: <BankTransactionImporter key="upload" />,
    }),
    []
  );

  return (
    <div className="overflow-y-auto scrollbar-thin-2px">
      <div className="max-w-2xl mx-auto w-full">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full grid grid-cols-2 bg-transparent border">
            <TabsTrigger value="connect">Connect Bank Account</TabsTrigger>
            <TabsTrigger value="upload">Manually Add Bank Account</TabsTrigger>
          </TabsList>

          <TabsContent value="connect">{tabContent.connect}</TabsContent>
          <TabsContent value="upload">{tabContent.upload}</TabsContent>
        </Tabs>
      </div>
    </div>
  );
};
