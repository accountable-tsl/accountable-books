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
import { useCompanyBankAccounts } from '@/modules/banking/accounts/model/hooks';
import { toast } from 'sonner';
import { useManualTransactionSync } from '@/modules/transactions/sync';
import type { BankAccountWithMeta } from '@/modules/banking/accounts';
import { formatDistanceToNowStrict } from 'date-fns';
import { SimpleTooltip, TooltipHelper } from '@/components/TooltipHelper';
import { FormattedAmount } from '@/components/FormattedAmount';
import { formatAmount } from '@/shared/utils/formatting-utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface Group {
  bankName: string;
  bankId: string;
  logo: string;
  lastSync?: Date;
  accounts: BankAccountWithMeta[];
  // balance: number;
}
export function AccountingWorkspace() {
  const { tenantRoutes, loading, companyId } = useSession();
  const navigate = useNavigate();
  const syncTransactions = useManualTransactionSync();
  const { data: bankAccountsResp, isLoading: baLoading } =
    useCompanyBankAccounts(companyId ?? '');
  const bankAccounts = bankAccountsResp?.data ?? [];
  const isMobile = useIsMobile();
  const is1440 = useMediaQuery('(min-width: 1440px)');

  if (isMobile) {
    return <SmallScreenMessage />;
  }

  if (loading || baLoading) {
    return <CenteredLoader />;
  }

  if (!tenantRoutes) {
    return <ErrorPage type="default" />;
  }

  const handleTxnRefresh = async (credentialId: string) => {
    if (!credentialId) return;
    try {
      syncTransactions.mutate({ credentialId });
      toast.success('Transactions synced successfully');
    } catch (error) {
      toast.error('Failed to sync transactions');
    }
  };

  const grouped = bankAccounts.reduce((map, acc) => {
    if (!map.has(acc.bankId)) {
      map.set(acc.bankId, {
        bankName: acc.bankName,
        bankId: acc.bankId,
        logo: acc.bankLogo ?? '',
        lastSync: acc.lastSyncAt,
        accounts: [],
      });
    }

    const group = map.get(acc.bankId)!;
    group.accounts.push(acc);

    if (
      acc.lastSyncAt &&
      (!group.lastSync || acc.lastSyncAt > group.lastSync)
    ) {
      group.lastSync = acc.lastSyncAt;
    }

    return map;
  }, new Map<string, Group>());

  const groupedBankAccounts = Array.from(grouped.values());

  const reportingCurrencyCode = bankAccounts[0]?.reportingCurrencyCode || '';
  const {
    totalUncategorizedCount,
    totalNeedsReviewCount,
    totalLedgerBalance,
    totalBankBalanceRep,
    anyBankAccountWithoutExchangeRate,
  } = bankAccounts.reduce(
    (totals, acc) => {
      const uncat = acc.uncategorizedTxCount;
      const review = acc.needsReviewTxCount;
      const ledger = parseFloat(acc.ledgerBalance);
      const rate = parseFloat(acc.latestExchangeRate ?? '1');
      const statement = parseFloat(acc.statementBalance) * rate;

      return {
        totalUncategorizedCount: totals.totalUncategorizedCount + uncat,
        totalNeedsReviewCount: totals.totalNeedsReviewCount + review,
        totalLedgerBalance: totals.totalLedgerBalance + ledger,
        totalBankBalanceRep: totals.totalBankBalanceRep + statement,
        anyBankAccountWithoutExchangeRate:
          totals.anyBankAccountWithoutExchangeRate || !acc.latestExchangeRate,
      };
    },
    {
      totalUncategorizedCount: 0,
      totalNeedsReviewCount: 0,
      totalLedgerBalance: 0,
      totalBankBalanceRep: 0,
      anyBankAccountWithoutExchangeRate: false,
    },
  );

  const showNeedsReview = totalNeedsReviewCount !== 0;
  const showTotalUncategorized =
    anyBankAccountWithoutExchangeRate || !showNeedsReview;

  const quickActionData: ActionCardProps[] = [
    {
      icon: <Building2 className="w-6 h-6 text-muted-foreground" />,
      title: 'Bank Transactions',
      actions: [
        {
          label: 'Upload',
          icon: <Upload className="w-4 h-4" />,
          onClick: () => navigate(tenantRoutes.banking.upload()),
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
          <div className="text-sm text-muted-foreground">
            Bank Account Insights
          </div>
          <Separator className="mb-4" />
          <div className="grid grid-cols-3 gap-4 min-h-[5rem]">
            <div className="h-full rounded-md border p-4 flex flex-col justify-between gap-2 divide-y overflow-clip">
              {!anyBankAccountWithoutExchangeRate && (
                <SimpleTooltip
                  content="Total native balances from bank feeds converted into reporting currency with today’s rate. Use it to see what the bank statements translate to right now"
                  contentClassName="text-center"
                >
                  <div className="grid truncate grid-cols-2 gap-2">
                    <div className="text-sm truncate">Cash in Bank</div>
                    <div className="text-right truncate">
                      <FormattedAmount
                        amount={totalBankBalanceRep}
                        currency={reportingCurrencyCode}
                        showSymbol
                      />
                    </div>
                  </div>
                </SimpleTooltip>
              )}
              <SimpleTooltip
                content="Current balances from the GL, stored in your reporting currency. This is the amount that will flow into financial statements"
                contentClassName="text-center"
              >
                <div className="grid truncate grid-cols-2 gap-2">
                  <div className="text-sm truncate">Ledger Balances</div>
                  <div className="text-right truncate">
                    <FormattedAmount
                      amount={totalLedgerBalance}
                      currency={reportingCurrencyCode}
                      showSymbol
                    />
                  </div>
                </div>
              </SimpleTooltip>
              <div className="grid truncate grid-cols-2 gap-2">
                <div className="text-sm truncate">No of bank accounts</div>
                <div className="text-right truncate">{bankAccounts.length}</div>
              </div>
              {showNeedsReview && (
                <div className="grid truncate grid-cols-2 gap-2">
                  <div className="text-sm truncate">Needs review</div>
                  <div className="text-right truncate">
                    {totalNeedsReviewCount}
                  </div>
                </div>
              )}
              {showTotalUncategorized && (
                <div className="grid truncate grid-cols-2 gap-2">
                  <div className="text-sm truncate">Total Uncategorized</div>
                  <div className="text-right truncate">
                    {totalUncategorizedCount}
                  </div>
                </div>
              )}
            </div>
            {bankAccounts.slice(0, 2).map((acc) => (
              <div
                key={acc.id}
                className="h-full shadow-sm rounded-md border flex flex-col overflow-clip"
              >
                <div className="flex-shrink-0 p-4 pb-2 flex">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-muted dark:bg-white/80 flex items-center justify-center opacity-80 overflow-clip">
                    {acc.bankLogo ? (
                      <img
                        src={acc.bankLogo}
                        alt="bank logo"
                        className="w-8 h-8 object-contain"
                        style={{ imageRendering: 'auto' }}
                      />
                    ) : (
                      <Building className="w-8 h-8 text-muted-foreground" />
                    )}
                  </div>
                  <Separator orientation="vertical" className="mx-2" />
                  <div className="overflow-hidden">
                    <div className="flex gap-1 items-baseline">
                      <span className="truncate text-[0.95rem]">
                        {acc.displayName}
                      </span>
                      <span className="text-[0.75rem] underline decoration-dotted text-muted-foreground">
                        {acc.currencyCode}
                      </span>
                    </div>
                    <div className="text-[0.85rem] font-light truncate text-muted-foreground">
                      {acc.bankName} | **{acc.mask}
                    </div>
                  </div>
                </div>
                <Separator />
                <div className="flex-1 p-2 px-4 space-y-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="truncate text-[0.9rem] font-medium">
                        <FormattedAmount
                          amount={acc.statementBalance ?? 0}
                          currency={acc.currencyCode}
                          showSymbol={true}
                        />
                      </div>
                      <div className="text-[0.80rem] font-light text-muted-foreground">
                        Statement Balance
                      </div>
                    </div>
                    <div>
                      <div className="truncate text-[0.9rem] font-medium">
                        <FormattedAmount
                          amount={acc.ledgerBalance}
                          currency={acc.reportingCurrencyCode}
                          showSymbol={true}
                        />
                      </div>
                      <div className="text-[0.80rem] font-light text-muted-foreground">
                        Ledger Balance
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="truncate text-[0.9rem] font-medium">
                        {acc.uncategorizedTxCount}
                      </div>
                      <div className="text-[0.80rem] font-light text-muted-foreground">
                        Uncategorized
                      </div>
                    </div>
                    <div>
                      <div className="truncate text-[0.9rem] font-medium">
                        {acc.needsReviewTxCount}
                      </div>
                      <div className="text-[0.80rem] font-light text-muted-foreground">
                        Needs Review
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
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
          <div className="text-sm text-muted-foreground pt-4 flex-shrink-0">
            Bank Accounts
          </div>
          <Separator className="mb-4" />
          <div className="flex flex-col gap-4 overflow-y-auto min-h-0 h-full scrollbar-thin-2px">
            {(groupedBankAccounts ?? []).map((g) => (
              <div
                key={g.bankId}
                className="border rounded-md p-2 flex flex-col overflow-clip"
              >
                <div className="flex-shrink-0 px-2 flex gap-2 items-center">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-muted dark:bg-primary/80 flex items-center justify-center">
                    {g.logo ? (
                      <img
                        src={g.logo}
                        alt={g.bankName}
                        className="w-8 h-8 rounded-full object-cover"
                      />
                    ) : (
                      <Building className="w-8 h-8 rounded-full object-cover" />
                    )}
                  </div>
                  <div className="overflow-hidden flex-1">
                    <div className="flex gap-1 items-baseline">
                      <span className="truncate text-[0.95rem]">
                        {g.bankName}
                      </span>
                      <span className="text-[0.75rem] text-muted-foreground">
                        ({g.accounts.length})
                      </span>
                    </div>
                    {/* {g.lastSync && (
                      <div className="text-[0.85rem] font-light truncate text-muted-foreground">
                        Last updated {formatDistanceToNowStrict(new Date(g.lastSync))} ago
                      </div>
                    )} */}
                  </div>
                </div>
                <Separator className="my-2" />
                <div className="overflow-y-auto flex flex-col gap-2.5 min-h-0 max-h-[175px] scrollbar-thin-2px overflow-hidden">
                  {g.accounts.map((acc) => (
                    <MiniBankAccountCard
                      key={acc.id}
                      account={acc}
                      onRefreshClick={handleTxnRefresh}
                    />
                  ))}
                </div>
              </div>
            ))}
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
      <div
        className={cn(
          'flex-shrink-0 grid grid-cols-2 divide-x',
          classNames?.actionsBox,
        )}
      >
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
  account: BankAccountWithMeta;
  onRefreshClick?: (credentialId: string) => void;
}

function MiniBankAccountCard({
  account,
  onRefreshClick,
}: MiniBankAccountCardProps) {
  const needsReview = account.needsReviewTxCount ?? 0;
  const Uncategorized = account.uncategorizedTxCount ?? 0;
  const balance = formatAmount(account?.statementBalance ?? 0, {});
  const syncAt = account.lastSyncAt
    ? formatDistanceToNowStrict(new Date(account.lastSyncAt))
    : undefined;

  const items: { key: string; node: React.ReactNode }[] = [];

  if (needsReview)
    items.push({ key: 'needs', node: `${needsReview} needs review` });
  if (Uncategorized)
    items.push({ key: 'unrec', node: `${Uncategorized} Uncategorized` });
  if (syncAt)
    items.push({ key: 'updated', node: `Last updated ${syncAt} ago` });
  if (account?.connectionCredentialId && onRefreshClick) {
    items.push({
      key: 'refresh',
      node: (
        <span
          className="hover:underline cursor-pointer active:cursor-progress"
          onClick={() => onRefreshClick(account.connectionCredentialId!)}
        >
          Refresh feed
        </span>
      ),
    });
  }

  // take two by priority
  let picked = items.slice(0, 2);

  // force updated to left if present
  if (picked.length === 2 && picked[1].key === 'updated') {
    picked = [picked[1], picked[0]];
  }

  return (
    <div className="bg-muted/60 rounded-md px-2 py-2 max-h-[55px]">
      <div className="grid grid-cols-2 gap-2 overflow-hidden">
        <TooltipHelper
          content={account.displayName + ' **' + account.mask}
          trigger={
            <>
              <span className="truncate">{account.displayName} </span>
              <span className="text-muted-foreground flex-1">
                **{account.mask}
              </span>
            </>
          }
          icon={false}
          contentStyle="w-fit"
          triggerWrapperClassName="flex gap-1 truncate"
        />
        {balance ? (
          <TooltipHelper
            content={balance + ' ' + account.currencyCode}
            contentStyle="w-fit"
            trigger={
              <span className="truncate text-right text-sm">
                <span className="text-muted-foreground text-xs">
                  {account.currencyCode}
                </span>{' '}
                {balance}
              </span>
            }
            icon={false}
            triggerWrapperClassName="text-right truncate"
          />
        ) : (
          <span className="truncate text-right">
            <span className="text-muted-foreground text-sm">
              {account.reportingCurrencyCode}
            </span>{' '}
            {balance}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div>{picked[0]?.node}</div>
        {picked[1] && <div>{picked[1].node}</div>}
      </div>
    </div>
  );
}
