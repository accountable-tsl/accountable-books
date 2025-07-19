import { BodyHead } from "@/components/AppHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calculator, FolderOpen, Settings, Users } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChartOfAccounts } from "@/features/chart-of-accounts/ChartOfAccounts";
import { Contacts } from "@/features/contacts/Contacts";
import { FinancialSettings } from "@/features/financial-settings/FinancialSettings";
import { Projects } from "@/features/projects/Projects";
import { cn } from "@/lib/utils";

const tabsConfig = [
  {
    value: "chart-of-accounts",
    icon: Calculator,
    label: { sm: "Chart of Accounts", xs: "Accounts" },
    content: <ChartOfAccounts />,
  },
  {
    value: "financial-settings",
    icon: Settings,
    label: { sm: "Financial Settings", xs: "Settings" },
    content: <FinancialSettings />,
  },
  {
    value: "contacts",
    icon: Users,
    label: { sm: "Contacts" },
    content: <Contacts />,
  },
  {
    value: "projects",
    icon: FolderOpen,
    label: { sm: "Projects" },
    content: <Projects />,
  },
];

export const AccountingWorkspaceSetup = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("chart-of-accounts");

  return (
    <div className="max-w-7xl mx-auto px-4 py-2 space-y-2 h-full flex flex-col">
      <BodyHead
        title="Accounting Setup"
        titleClass="hidden"
        description="Configure your workspace accounting settings"
        descriptionClass="text-background"
      />

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="gap-0 flex-1 h-full min-h-0"
      >
        <TabsList className="flex w-full grid-cols-4 rounded-md rounded-b-none bg-background p-0">
          {tabsConfig.map(({ value, icon: Icon, label }) => (
            <TabsTrigger
              key={value}
              value={value}
              className={cn(
                "flex flex-1 items-center gap-2 text-muted-foreground rounded-none bg-background h-full rounded-t font-light hover:text-foreground",
                "data-[state=active]:shadow-none data-[state=active]:text-foreground data-[state=active]:font-medium -mb-[2px] opacity-50",
                "border-b-border data-[state=active]:border-border data-[state=active]:border-b-background data-[state=active]:opacity-100"
              )}
            >
              <Icon className="h-4 w-4" />
              {label.sm && <span className="hidden sm:inline">{label.sm}</span>}
              {label.xs && <span className="sm:hidden">{label.xs}</span>}
            </TabsTrigger>
          ))}
        </TabsList>

        {tabsConfig.map(({ value, content }) => (
          <TabsContent
            key={value}
            value={value}
            className="flex-1 flex flex-col min-h-0 border border-t-0"
          >
            {content}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};
