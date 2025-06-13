import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BankTransactionImporter } from "@/features/bankConnection/manualUpload/BankTransactionImporter";

export const BankAccount = () => {
  return (
    <div>
      <Tabs>
        <TabsList>
          <TabsTrigger value="connect">Account</TabsTrigger>
          <TabsTrigger value="upload">Password</TabsTrigger>
        </TabsList>

        <TabsContent value="connect"></TabsContent>
        <TabsContent value="upload">
          <BankTransactionImporter />
        </TabsContent>
      </Tabs>
    </div>
  );
};
