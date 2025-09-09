import { SmallScreenMessage } from '@/components/SmallScreenMessage';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useIsMobile, useMediaQuery } from '@/shared/hooks/use-media-query';
import {
  Brain,
  Building,
  Building2,
  ChevronRight,
  ChevronRightCircle,
  Eye,
  Link,
  NotepadText,
  Upload,
} from 'lucide-react';
import { useSession } from '@session';
import { useNavigate } from 'react-router';
import { CenteredLoader } from '@/components/CenteredLoader';
import ErrorPage from '@/components/ErrorPage';

export function AccountingWorkspace() {
  const { tenantRoutes, loading } = useSession();
  const navigate = useNavigate();

  const isMobile = useIsMobile();
  const is1440 = useMediaQuery('(min-width: 1440px)');

  if (isMobile) {
    return <SmallScreenMessage />;
  }

  if (loading) {
    return <CenteredLoader />;
  }

  if (!tenantRoutes) {
    return <ErrorPage type="default" />;
  }

  const quickActionData: ActionCardProps[] = [
    {
      icon: <Building2 className="w-6 h-6 text-muted-foreground" />,
      title: 'Bank Transactions',
      actions: [
        {
          label: 'Upload',
          icon: <Upload className="w-4 h-4" />,
          onClick: () => navigate(tenantRoutes.accounting.uploadBankTxn()),
        },
        {
          label: 'Connect',
          icon: <Link className="w-4 h-4" />,
          onClick: () => navigate(tenantRoutes.banking.connect()),
        },
      ],
    },

    {
      icon: <Brain className="w-6 h-6 text-muted-foreground" />,
      title: 'Categorization Engine',
      actions: [{ label: 'Visit', icon: <ChevronRight className="w-4 h-4" /> }],
      classNames: { actionsBox: 'grid-cols-1' },
    },

    {
      icon: <NotepadText className="w-6 h-6 text-muted-foreground" />,
      title: 'Journals',
      actions: [
        { label: 'View', icon: <Eye className="w-4 h-4" /> },
        { label: 'Create new', icon: <ChevronRight className="w-4 h-4" /> },
      ],
      //   classNames: { actionsBox: "grid-cols-1" },
    },
  ];

  return (
    <div className="flex min-w-0 w-full min-h-0 h-full gap-4 p-4 divide-x">
      <div className="flex-1 w-full min-h-0">
        <div className="p-4 flex flex-col">
          <div className="text-sm text-muted-foreground">Quick Actions</div>
          <Separator className="mb-4" />
          <div className="grid grid-cols-3 gap-4 min-h-[5rem]">
            {quickActionData.map((data, index) => (
              <ActionCard key={index} {...data} />
            ))}
          </div>
        </div>

        <div className="p-4 flex flex-col">
          <div className="text-sm text-muted-foreground">Bank Account Insights</div>
          <Separator className="mb-4" />
          <div className="grid grid-cols-3 gap-4 min-h-[5rem]">
            <div className="h-full rounded-md border p-4 flex flex-col justify-between gap-2 divide-y overflow-clip">
              <div className="grid truncate grid-cols-2 gap-2">
                <div className="text-sm truncate">Cash in Bank</div>
                <div className="text-right truncate">$ 100,000.00</div>
              </div>
              <div className="grid truncate grid-cols-2 gap-2">
                <div className="text-sm truncate">Ledger Balances</div>
                <div className="text-right truncate">$ 70,000.00</div>
              </div>
              <div className="grid truncate grid-cols-2 gap-2">
                <div className="text-sm truncate">No of bank accounts</div>
                <div className="text-right truncate">5</div>
              </div>
              <div className="grid truncate grid-cols-2 gap-2">
                <div className="text-sm truncate">Needs action</div>
                <div className="text-right truncate">5</div>
              </div>
            </div>
            <div className="h-full shadow-sm rounded-md border flex flex-col overflow-clip">
              <div className="flex-shrink-0 p-4 pb-2 flex">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                  <Building className="w-6 h-6" />
                </div>
                <Separator orientation="vertical" className="mx-2" />
                <div className="overflow-hidden">
                  <div className="flex gap-1 items-baseline">
                    <span className="truncate text-[0.95rem]">Bank Account name</span>
                    <span className="text-[0.75rem] underline decoration-dotted text-muted-foreground">
                      USD
                    </span>
                  </div>
                  <div className="text-[0.85rem] font-light truncate text-muted-foreground">
                    Bank Name | Account Number
                  </div>
                </div>
              </div>
              <Separator />
              <div className="flex-1 p-2 px-4 space-y-2">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="truncate text-[0.9rem] font-medium">$ 100,000,000,000.00</div>
                    <div className="text-[0.80rem] font-light text-muted-foreground">
                      Statement Balance
                    </div>
                  </div>
                  <div>
                    <div className="truncate text-[0.9rem] font-medium">$ 100,000,000.00</div>
                    <div className="text-[0.80rem] font-light text-muted-foreground">
                      Ledger Balance
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="truncate text-[0.9rem] font-medium">205,600</div>
                    <div className="text-[0.80rem] font-light text-muted-foreground">
                      Unreconciled
                    </div>
                  </div>
                  <div>
                    <div className="truncate text-[0.9rem] font-medium">100,200</div>
                    <div className="text-[0.80rem] font-light text-muted-foreground">
                      Needs Review
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="h-full shadow-sm rounded-md border"></div>
          </div>
        </div>

        <div className="p-4 flex flex-col">
          <div className="text-sm text-muted-foreground">Other Navigation</div>
          <Separator className="mb-4" />
          <div className="grid grid-cols-3 gap-4 min-h-[5rem]">
            <div
              className="h-full shadow-sm rounded-md p-4 border flex items-center gap-2 opacity-50 cursor-not-allowed"

              //   onClick={() => navigate("/accounting-ws/transactions")}
            >
              <div>Account Transactions</div>
              <div>
                <ChevronRightCircle className="w-4 h-4" />
              </div>
            </div>
            <div
              className="h-full shadow-sm rounded-md p-4 border flex items-center gap-2 cursor-pointer"
              onClick={() => {
                localStorage.setItem('accSetupTab', 'chart-of-accounts');
                navigate(tenantRoutes?.accounting.setup());
              }}
            >
              <div>Chart of Accounts</div>
              <div>
                <ChevronRightCircle className="w-4 h-4" />
              </div>
            </div>
            <div
              className="h-full shadow-sm rounded-md p-4 border flex items-center gap-2 cursor-pointer"
              onClick={() => {
                localStorage.setItem('accSetupTab', 'financial-settings');
                navigate(tenantRoutes?.accounting.setup());
              }}
            >
              <div>Financial Settings</div>
              <div>
                <ChevronRightCircle className="w-4 h-4" />
              </div>
            </div>
          </div>
        </div>
      </div>
      {is1440 && (
        <div className="flex-shrink-0 min-w-sm w-sm ml-auto flex flex-col min-h-0">
          <div className="text-sm text-muted-foreground pt-4 flex-shrink-0">Bank Accounts</div>
          <Separator className="mb-4" />
          <div className="flex flex-col gap-4 overflow-y-auto min-h-0 h-full scrollbar-thin-2px">
            {/* One bank account sample */}
            {
              <div className="border rounded-md p-2 flex flex-col overflow-clip">
                <div className="flex-shrink-0 px-2 flex gap-2 items-center">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                    <Building className="w-6 h-6" />
                  </div>
                  <div className="overflow-hidden">
                    <div className="flex gap-1 items-baseline">
                      <span className="truncate text-[0.95rem]">Bank Name HEre</span>
                      <span className="text-[0.75rem] text-muted-foreground">{'(2)'}</span>
                    </div>
                    <div className="text-[0.85rem] font-light truncate text-muted-foreground">
                      Last updated 2 weeks ago
                    </div>
                  </div>
                </div>
                <Separator className="my-2" />
                <div className="overflow-y-auto flex flex-col gap-2.5 min-h-0 max-h-[175px] scrollbar-thin-2px overflow-hidden">
                  <MiniBankAccountCard
                    name={'This is the bank account name'}
                    balance="$ 100,000,000,000.00"
                    unreconciled="9000"
                    needsReview="5000"
                  />
                </div>
              </div>
            }{' '}
          </div>
        </div>
      )}
    </div>
  );
}

interface Action {
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
}

interface ActionCardProps {
  icon: React.ReactNode;
  title: string;
  actions: Action[];
  classNames?: {
    actionsBox?: string;
  };
}

function ActionCard({ icon, title, actions, classNames }: ActionCardProps) {
  return (
    <div className="h-full shadow-sm rounded-md border overflow-clip">
      <div className="flex-1 p-4 flex flex-col items-center justify-center gap-2">
        <div>{icon}</div>
        <div>{title}</div>
      </div>
      <Separator />
      <div className={cn('flex-shrink-0 grid grid-cols-2 divide-x', classNames?.actionsBox)}>
        {actions.map((action, index) => (
          <div
            key={index}
            onClick={action.onClick}
            className="flex items-center gap-2 justify-center p-2 cursor-pointer hover:bg-accent"
          >
            <div>{action.label}</div>
            <div>{action.icon}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface MiniBankAccountCardProps {
  name: string;
  balance: string;
  unreconciled: string;
  needsReview: string;
}

function MiniBankAccountCard({
  name,
  balance,
  unreconciled,
  needsReview,
}: MiniBankAccountCardProps) {
  return (
    <div className="bg-muted/60 rounded-md px-2 py-2 max-h-[55px]">
      <div className="grid grid-cols-2 gap-2 overflow-hidden">
        <span className="truncate">{name}</span>
        <span className="truncate text-right">{balance}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{unreconciled} unreconciled</span>
        <span className="text-sm text-muted-foreground">{needsReview} needs review</span>
      </div>
    </div>
  );
}
