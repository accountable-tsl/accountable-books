import type { BankAccountWithMeta } from '@/modules/banking/accounts';
import { CenteredLoader } from '@/components/CenteredLoader';
import ErrorPage from '@/components/ErrorPage';
import { FormattedAmount } from '@/components/FormattedAmount';
import { SmallScreenMessage } from '@/components/SmallScreenMessage';
import { SimpleTooltip, TooltipHelper } from '@/components/TooltipHelper';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useCompanyBankAccounts } from '@/modules/banking/accounts/model/hooks';
import { useManualTransactionSync } from '@/modules/transactions/sync';
import { useIsMobile, useMediaQuery } from '@/shared/hooks/use-media-query';
import { formatAmount } from '@/shared/utils/formatting-utils';
import { useSession } from '@session';
import { formatDistanceToNowStrict } from 'date-fns';
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
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

interface Group {
  bankName: string;
  bankId: string;
  logo: string;
  lastSync?: string | null;
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
    return <ErrorPage showHeader type="default" />;
  }

  const handleTxnRefresh = (bankAccountId: string) => {
    if (!bankAccountId || !companyId) return;
    syncTransactions.mutate(
      { companyId, bankAccountId },
      {
        onSuccess: () => toast.success('Transaction sync queued'),
        onError: () => toast.error('Failed to sync transactions'),
      },
    );
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
      const recordedRep = parseFloat(acc.recordedBankBalance) * rate;

      return {
        totalUncategorizedCount: totals.totalUncategorizedCount + uncat,
        totalNeedsReviewCount: totals.totalNeedsReviewCount + review,
        totalLedgerBalance: totals.totalLedgerBalance + ledger,
        totalBankBalanceRep: totals.totalBankBalanceRep + recordedRep,
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
      icon: <Building2 className="text-muted-foreground h-6 w-6" />,
      title: 'Bank Transactions',
      actions: [
        {
          label: 'Upload',
          icon: <Upload className="h-4 w-4" />,
          onClick: () => navigate(tenantRoutes.banking.upload()),
        },
        {
          label: 'Connect',
          icon: <Link className="h-4 w-4" />,
          onClick: () => navigate(tenantRoutes.banking.connect()),
        },
      ],
    },

    {
      icon: <Brain className="text-muted-foreground h-6 w-6" />,
      title: 'Categorization Engine',
      actions: [
        {
          label: 'Visit',
          icon: <ChevronRight className="h-4 w-4" />,
          onClick: () => navigate(tenantRoutes.accounting.catEngine()),
        },
      ],
      classNames: { actionsBox: 'grid-cols-1' },
    },

    {
      icon: <NotepadText className="text-muted-foreground h-6 w-6" />,
      title: 'Journals',
      actions: [
        {
          label: 'View',
          icon: <Eye className="h-4 w-4" />,
          onClick: () => navigate(tenantRoutes.accounting.journals()),
        },
        { label: 'Create new', icon: <ChevronRight className="h-4 w-4" /> },
      ],
      //   classNames: { actionsBox: "grid-cols-1" },
    },
  ];

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 gap-4 divide-x p-4">
      <div className="min-h-0 w-full flex-1">
        <div className="flex flex-col p-4">
          <div className="text-muted-foreground text-sm">Quick Actions</div>
          <Separator className="mb-4" />
          <div className="grid min-h-[5rem] grid-cols-3 gap-4">
            {quickActionData.map((data, index) => (
              <ActionCard key={index} {...data} />
            ))}
          </div>
        </div>

        <div className="flex flex-col p-4">
          <div className="text-muted-foreground text-sm">
            Bank Account Insights
          </div>
          <Separator className="mb-4" />
          <div className="grid min-h-[5rem] grid-cols-3 gap-4">
            <div className="flex h-full flex-col justify-between gap-2 divide-y overflow-clip rounded-md border p-4">
              {!anyBankAccountWithoutExchangeRate &&
                bankAccounts.length > 0 && (
                  <SimpleTooltip
                    content="Bank balance per our records (provider statement, opening balance, or imported bank transactions), converted to reporting currency. Compare with ledger to see the gap."
                    contentClassName="text-center"
                  >
                    <div className="grid grid-cols-2 gap-2 truncate">
                      <div className="truncate text-sm">Cash in Bank</div>
                      <div className="truncate text-right">
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
                <div className="grid grid-cols-2 gap-2 truncate">
                  <div className="truncate text-sm">Ledger Balances</div>
                  <div className="truncate text-right">
                    <FormattedAmount
                      amount={totalLedgerBalance}
                      currency={reportingCurrencyCode}
                      showSymbol
                    />
                  </div>
                </div>
              </SimpleTooltip>
              <div className="grid grid-cols-2 gap-2 truncate">
                <div className="truncate text-sm">No of bank accounts</div>
                <div className="truncate text-right">{bankAccounts.length}</div>
              </div>
              {showNeedsReview && (
                <div className="grid grid-cols-2 gap-2 truncate">
                  <div className="truncate text-sm">Needs review</div>
                  <div className="truncate text-right">
                    {totalNeedsReviewCount}
                  </div>
                </div>
              )}
              {showTotalUncategorized && (
                <div className="grid grid-cols-2 gap-2 truncate">
                  <div className="truncate text-sm">Total Uncategorized</div>
                  <div className="truncate text-right">
                    {totalUncategorizedCount}
                  </div>
                </div>
              )}
            </div>
            {bankAccounts.slice(0, 2).map((acc) => (
              <div
                key={acc.id}
                className="flex h-full flex-col overflow-clip rounded-md border shadow-sm"
              >
                <div className="flex shrink-0 p-4 pb-2">
                  <div className="bg-muted flex h-12 w-12 shrink-0 items-center justify-center overflow-clip rounded-full opacity-80 dark:bg-white/80">
                    {acc.bankLogo ? (
                      <img
                        src={acc.bankLogo}
                        alt="bank logo"
                        className="h-8 w-8 object-contain"
                        style={{ imageRendering: 'auto' }}
                      />
                    ) : (
                      <Building className="text-muted-foreground h-8 w-8" />
                    )}
                  </div>
                  <Separator orientation="vertical" className="mx-2" />
                  <div className="overflow-hidden">
                    <div className="flex items-baseline gap-1">
                      <span className="truncate text-[0.95rem]">
                        {acc.displayName}
                      </span>
                      <span className="text-muted-foreground text-[0.75rem] underline decoration-dotted">
                        {acc.currencyCode}
                      </span>
                    </div>
                    <div className="text-muted-foreground truncate text-[0.85rem] font-light">
                      {acc.bankName} | **{acc.mask}
                    </div>
                  </div>
                </div>
                <Separator />
                <div className="flex-1 space-y-2 p-2 px-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="truncate text-[0.9rem] font-medium">
                        <FormattedAmount
                          amount={acc.recordedBankBalance}
                          currency={acc.currencyCode}
                          showSymbol={true}
                        />
                      </div>
                      <div className="text-muted-foreground text-[0.80rem] font-light">
                        Bank (our records)
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
                      <div className="text-muted-foreground text-[0.80rem] font-light">
                        Ledger Balance
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="truncate text-[0.9rem] font-medium">
                        {acc.uncategorizedTxCount}
                      </div>
                      <div className="text-muted-foreground text-[0.80rem] font-light">
                        Uncategorized
                      </div>
                    </div>
                    <div>
                      <div className="truncate text-[0.9rem] font-medium">
                        {acc.needsReviewTxCount}
                      </div>
                      <div className="text-muted-foreground text-[0.80rem] font-light">
                        Needs Review
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col p-4">
          <div className="text-muted-foreground text-sm">Other Navigation</div>
          <Separator className="mb-4" />
          <div className="grid min-h-[5rem] grid-cols-3 gap-4">
            <div
              className="flex h-full cursor-not-allowed items-center gap-2 rounded-md border p-4 opacity-50 shadow-sm"

              //   onClick={() => navigate("/accounting-ws/transactions")}
            >
              <div>Account Transactions</div>
              <div>
                <ChevronRightCircle className="h-4 w-4" />
              </div>
            </div>
            <div
              className="flex h-full cursor-pointer items-center gap-2 rounded-md border p-4 shadow-sm"
              onClick={() => {
                localStorage.setItem('accSetupTab', 'chart-of-accounts');
                navigate(tenantRoutes?.accounting.setup());
              }}
            >
              <div>Chart of Accounts</div>
              <div>
                <ChevronRightCircle className="h-4 w-4" />
              </div>
            </div>
            <div
              className="flex h-full cursor-pointer items-center gap-2 rounded-md border p-4 shadow-sm"
              onClick={() => {
                localStorage.setItem('accSetupTab', 'financial-settings');
                navigate(tenantRoutes?.accounting.setup());
              }}
            >
              <div>Financial Settings</div>
              <div>
                <ChevronRightCircle className="h-4 w-4" />
              </div>
            </div>
          </div>
        </div>
      </div>
      {is1440 && (
        <div className="ml-auto flex min-h-0 w-sm min-w-sm shrink-0 flex-col">
          <div className="text-muted-foreground shrink-0 pt-4 text-sm">
            Bank Accounts
          </div>
          <Separator className="mb-4" />
          <div className="scrollbar-thin-2px flex h-full min-h-0 flex-col gap-4 overflow-y-auto">
            {(groupedBankAccounts ?? []).map((g) => (
              <div
                key={g.bankId}
                className="flex flex-col overflow-clip rounded-md border p-2"
              >
                <div className="flex shrink-0 items-center gap-2 px-2">
                  <div className="bg-muted dark:bg-primary/80 flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
                    {g.logo ? (
                      <img
                        src={g.logo}
                        alt={g.bankName}
                        className="h-8 w-8 rounded-full object-cover"
                      />
                    ) : (
                      <Building className="h-8 w-8 rounded-full object-cover" />
                    )}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <div className="flex items-baseline gap-1">
                      <span className="truncate text-[0.95rem]">
                        {g.bankName}
                      </span>
                      <span className="text-muted-foreground text-[0.75rem]">
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
                <div className="scrollbar-thin-2px flex max-h-[175px] min-h-0 flex-col gap-2.5 overflow-hidden overflow-y-auto">
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
    <div className="h-full overflow-clip rounded-md border shadow-sm">
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4">
        <div>{icon}</div>
        <div>{title}</div>
      </div>
      <Separator />
      <div
        className={cn(
          'grid shrink-0 grid-cols-2 divide-x',
          classNames?.actionsBox,
        )}
      >
        {actions.map((action, index) => (
          <div
            key={index}
            onClick={action.onClick}
            className="hover:bg-accent flex cursor-pointer items-center justify-center gap-2 p-2"
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
  onRefreshClick?: (bankAccountId: string) => void;
}

function MiniBankAccountCard({
  account,
  onRefreshClick,
}: MiniBankAccountCardProps) {
  const needsReview = account.needsReviewTxCount ?? 0;
  const Uncategorized = account.uncategorizedTxCount ?? 0;
  const balance = formatAmount(account.recordedBankBalance, {});
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
  if (account?.bankConnectionId && onRefreshClick) {
    items.push({
      key: 'refresh',
      node: (
        <span
          className="cursor-pointer hover:underline active:cursor-progress"
          onClick={() => onRefreshClick(account.id)}
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
    <div className="bg-muted/60 max-h-[55px] rounded-md px-2 py-2">
      <div className="grid grid-cols-2 gap-2 overflow-hidden">
        <TooltipHelper
          content={account.displayName + ' **' + account.mask}
          trigger={
            <>
              <span className="truncate">{account.displayName} </span>
              <span className="text-muted-foreground shrink-0">
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
      <div className="text-muted-foreground flex items-center justify-between text-sm">
        <div>{picked[0]?.node}</div>
        {picked[1] && <div>{picked[1].node}</div>}
      </div>
    </div>
  );
}
