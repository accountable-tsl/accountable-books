import { Calculator, FolderOpen, Settings, Users } from 'lucide-react';
import { useState } from 'react';

import { BodyHead } from '@/components/AppHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FinancialSettings } from '@/domains-pending-migration/financial-settings/FinancialSettings';
import { ChartOfAccounts } from '@/features/chart-of-accounts';
import { Contacts } from '@/features/manage-contacts';
import { Projects } from '@/features/manage-projects';
import { cn } from '@/lib/utils';

const tabsConfig = [
  {
    value: 'chart-of-accounts',
    icon: Calculator,
    label: { sm: 'Chart of Accounts', xs: 'Accounts' },
    content: <ChartOfAccounts />,
  },
  {
    value: 'contacts',
    icon: Users,
    label: { sm: 'Contacts' },
    content: <Contacts />,
  },
  {
    value: 'projects',
    icon: FolderOpen,
    label: { sm: 'Projects' },
    content: <Projects />,
  },
  {
    value: 'financial-settings',
    icon: Settings,
    label: { sm: 'Financial Settings', xs: 'Settings' },
    content: <FinancialSettings />,
  },
];

export const AccountingWorkspaceSetup = () => {
  const [activeTab, setActiveTab] = useState(
    localStorage.getItem('accSetupTab') || 'chart-of-accounts',
  );

  // Save active tab to local storage
  const handleActiveTabChange = (tab: string) => {
    setActiveTab(tab);
    localStorage.setItem('accSetupTab', tab);
  };

  return (
    <div className="mx-auto flex h-full max-w-7xl flex-col space-y-2 px-4 py-2">
      <BodyHead
        title="Accounting Setup"
        titleClass="hidden"
        description="Configure your workspace accounting settings"
        descriptionClass="text-background"
      />

      <Tabs
        value={activeTab}
        onValueChange={handleActiveTabChange}
        className="h-full min-h-0 flex-1 gap-0"
      >
        <TabsList className="bg-background flex w-full grid-cols-4 rounded-md rounded-b-none p-0">
          {tabsConfig.map(({ value, icon: Icon, label }) => (
            <TabsTrigger
              key={value}
              value={value}
              className={cn(
                'text-muted-foreground bg-background hover:text-foreground flex h-full flex-1 items-center gap-2 rounded-none rounded-t font-light',
                'data-[state=active]:text-foreground -mb-[2px] opacity-50 data-[state=active]:font-medium data-[state=active]:shadow-none',
                'border-b-border data-[state=active]:border-border data-[state=active]:border-b-background data-[state=active]:opacity-100',
                'data-[state=active]:dark:bg-background data-[state=active]:dark:border-b-0',
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
            className="flex min-h-0 flex-1 flex-col border border-t-0"
          >
            {content}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};
