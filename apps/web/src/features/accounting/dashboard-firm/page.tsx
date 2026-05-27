import type {
  FirmAggregatePerformanceStats,
  FirmClientStatus,
  FirmClientSummary,
  FirmInviteStaffOption,
  FirmTaskQueueItem,
} from '@/modules/company/firm-practice';
import type { MouseEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AutocompleteDropdown } from '@/components/AutocompleteDropdown';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import {
  canInviteFirmClients,
  FIRM_NO_BOOK_ACCESS_SUMMARY_QUEUE,
  FIRM_NO_BOOK_ACCESS_SUMMARY_ROSTER,
  FirmNoBookAccessOverlay,
  firmShowsTeamFeatures,
  getFirmTransactionStatsLabel,
  InviteClientWizard,
  useFirmClientRoster,
  useFirmDashboardShell,
  useFirmTaskQueue,
  useOpenClientBook,
} from '@/modules/company/firm-practice';
import { useMediaQuery } from '@/shared/hooks/use-media-query';
import { formatRelativeDueDate } from '@/shared/utils/formatting-utils';
import { useSession } from '@session';
import {
  ArrowRight,
  ChevronRight,
  Filter,
  History,
  Lock,
  MoreVertical,
  Plus,
  Search,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const TRANSACTION_PERIODS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
] as const;

type TransactionPeriod = (typeof TRANSACTION_PERIODS)[number]['value'];

function getTransactionDelta(
  current: number,
  previous: number,
): { label: string; direction: 'up' | 'down' | 'flat' } {
  const diff = current - previous;
  if (diff === 0) return { label: 'Same as last period', direction: 'flat' };
  const pct = previous > 0 ? Math.round((Math.abs(diff) / previous) * 100) : 0;
  if (diff > 0) return { label: `+${pct}% vs last period`, direction: 'up' };
  return { label: `−${pct}% vs last period`, direction: 'down' };
}

function ActivityTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover text-popover-foreground rounded-md border px-3 py-1.5 text-xs shadow-sm">
      <span className="font-medium">{label}</span>: {payload[0].value}{' '}
      transactions
    </div>
  );
}

const STATUS_ORDER: FirmClientStatus[] = [
  'new',
  'overdue',
  'need_attention',
  'healthy',
];

function sortClientsByUrgency(
  clients: FirmClientSummary[],
): FirmClientSummary[] {
  return [...clients].sort(
    (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status),
  );
}

function getAvatarBorderClass(status: FirmClientStatus): string {
  switch (status) {
    case 'healthy':
      return 'border-emerald-500';
    case 'overdue':
      return 'border-destructive';
    case 'need_attention':
      return 'border-orange-500';
    case 'new':
      return 'border-blue-500';
    default:
      return 'border-border';
  }
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function getClientsUpToDateLabel(healthyCount: number, total: number): string {
  const ratio = total > 0 ? healthyCount / total : 0;
  if (ratio >= 0.8) return 'Excellent';
  if (ratio >= 0.5) return 'On track';
  return 'Needs attention';
}

function filterClientsByQuery(
  clients: FirmClientSummary[],
  query: string,
): FirmClientSummary[] {
  const q = query.trim().toLowerCase();
  if (q === '') return clients;
  return clients.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      (c.industry ?? '').toLowerCase().includes(q),
  );
}

function FirmClientRosterCells({
  client,
  showTeamFeatures,
  lastOpenedClientId,
}: {
  client: FirmClientSummary;
  showTeamFeatures: boolean;
  lastOpenedClientId: string | null;
}) {
  return (
    <>
      <Avatar
        className={cn(
          'size-8 shrink-0 border',
          getAvatarBorderClass(client.status),
        )}
      >
        <AvatarFallback className="text-xs">
          {getInitials(client.name)}
        </AvatarFallback>
      </Avatar>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <span className="truncate">{client.name}</span>
          {client.status === 'new' && (
            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-600 dark:bg-blue-950 dark:text-blue-400">
              New
            </span>
          )}
          {lastOpenedClientId === client.id && (
            <span className="text-muted-foreground text-xs">Last opened</span>
          )}
        </div>

        <div className="text-muted-foreground truncate text-xs">
          {[
            client.industry,
            `${client.openTaskCount} open`,
            client.lastActivityLabel,
          ]
            .filter(Boolean)
            .join(' • ')}
        </div>
      </div>

      {showTeamFeatures && client.assignee && (
        <Avatar className="size-6 shrink-0 border" title={client.assignee.name}>
          <AvatarFallback className="text-[10px]">
            {client.assignee.initials}
          </AvatarFallback>
        </Avatar>
      )}
    </>
  );
}

const ADD_CLIENT_DESCRIPTION =
  'Link or invite a new client company to your firm roster. Full onboarding will arrive in a later step.';

const NO_CLIENTS_NO_INVITE_PERMISSION_COPY =
  'No clients yet. Only firm admins and managers can add clients—ask someone with access if you need a new client on the roster.';

const THIS_WEEK_VISIBLE_KEY = 'firm-dashboard-this-week-visible';

/** Dev-only: set `true` to hide no-access overlays and show normal roster/queue chrome. */
const FIRM_DASHBOARD_DEV_BYPASS_BOOK_ACCESS_UI = import.meta.env.DEV && false;

const EMPTY_FIRM_PERF: FirmAggregatePerformanceStats = {
  transactionsToday: 0,
  transactionsWeek: 0,
  transactionsMonth: 0,
  transactionsTodayPrev: 0,
  transactionsWeekPrev: 0,
  transactionsMonthPrev: 0,
};

function firmQueueRowTitle(task: FirmTaskQueueItem): string {
  if (!task.description?.trim()) return task.title;
  return `${task.title} — ${task.description}`;
}

function firmQueueMetaLine(task: FirmTaskQueueItem): string {
  const assigneeLabel = task.assignedTo?.name ?? 'Unassigned';
  const duePart = task.dueDate ? formatRelativeDueDate(task.dueDate) : null;
  return [task.clientDisplayName, task.periodLabel, duePart, assigneeLabel]
    .filter(Boolean)
    .join(' · ');
}

function firmQueueMetaTitleAttr(task: FirmTaskQueueItem): string {
  const base = firmQueueMetaLine(task);
  if (!task.dueDate) return base;
  return `${base} (${task.dueDate})`;
}

function blockedBadgeLabel(task: FirmTaskQueueItem): string {
  switch (task.actionabilityState) {
    case 'blocked_by_client':
      return 'Needs client action';
    case 'blocked_by_dependency':
      return 'Blocked';
    case 'informational':
      return 'Waiting';
    case 'actionable_now':
      return 'Blocked';
  }
}

function FirmQueueStatusChips({ task }: { task: FirmTaskQueueItem }) {
  return (
    <div className="flex shrink-0 [scrollbar-width:none] flex-nowrap items-center gap-1.5 overflow-x-auto [-ms-overflow-style:none] max-lg:gap-1 [&::-webkit-scrollbar]:hidden max-lg:[&>*:nth-child(n+3)]:hidden">
      {task.isOverdue && (
        <Badge
          variant="destructive"
          className="shrink-0 px-1.5 py-0 text-[10px] font-normal"
        >
          Overdue
        </Badge>
      )}
      {task.isBlocked && (
        <Badge
          variant="outline"
          className="shrink-0 border-amber-500/60 px-1.5 py-0 text-[10px] font-normal text-amber-950 dark:text-amber-100"
          title={
            task.actionabilityState === 'blocked_by_client'
              ? 'Reminders to the client are sent automatically.'
              : undefined
          }
        >
          {blockedBadgeLabel(task)}
        </Badge>
      )}
      {task.priority === 'urgent' && (
        <Badge
          variant="destructive"
          className="shrink-0 px-1.5 py-0 text-[10px] font-normal"
        >
          Urgent
        </Badge>
      )}
      {task.priority === 'high' && (
        <Badge
          variant="outline"
          className="shrink-0 px-1.5 py-0 text-[10px] font-normal"
        >
          High priority
        </Badge>
      )}
      {task.hasWarnings && !task.isBlocked && (
        <Badge
          variant="secondary"
          className="shrink-0 px-1.5 py-0 text-[10px] font-normal"
        >
          Needs review
        </Badge>
      )}
      {task.status === 'in_progress' && (
        <Badge
          variant="outline"
          className="shrink-0 px-1.5 py-0 text-[10px] font-normal"
        >
          In progress
        </Badge>
      )}
    </div>
  );
}

function FirmQueueRowInner({ task }: { task: FirmTaskQueueItem }) {
  const metaLine = firmQueueMetaLine(task);
  return (
    <>
      <Avatar className="border-border size-7 shrink-0 border">
        <AvatarFallback className="text-[10px]">
          {getInitials(task.clientDisplayName)}
        </AvatarFallback>
      </Avatar>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 flex-nowrap items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {task.title}
          </span>
          <FirmQueueStatusChips task={task} />
        </div>

        <div className="contents min-w-0 sm:flex sm:items-start sm:justify-between sm:gap-3">
          <p
            className="text-muted-foreground min-w-0 truncate text-xs max-lg:whitespace-nowrap sm:flex-1"
            title={firmQueueMetaTitleAttr(task)}
          >
            {metaLine}
          </p>

          {task.isBlocked && task.primaryBlockerLabel && (
            <div className="text-muted-foreground flex min-w-0 shrink-0 items-start gap-1 text-xs sm:max-w-[min(100%,20rem)]">
              <Lock className="mt-0.5 size-3 shrink-0 opacity-70" aria-hidden />
              <span
                className="min-w-0 truncate"
                title={task.primaryBlockerLabel}
              >
                {task.primaryBlockerLabel}
              </span>
            </div>
          )}
        </div>
      </div>

      <ChevronRight
        className="text-muted-foreground group-hover:text-foreground mt-px hidden size-4 shrink-0 self-center opacity-50 transition-colors group-hover:opacity-70 lg:block"
        aria-hidden
      />
    </>
  );
}

function FirmQueueRow({
  task,
  selectedClientId,
  onActivateClient,
  canOpenBook,
  onOpenBook,
}: {
  task: FirmTaskQueueItem;
  selectedClientId: string | null;
  onActivateClient: (clientCompanyId: string) => void;
  canOpenBook: boolean;
  onOpenBook: () => void;
}) {
  const isClientSelected = selectedClientId === task.clientCompanyId;

  const handleRowActivate = () => {
    onActivateClient(task.clientCompanyId);
    onOpenBook();
  };

  return (
    <li
      className={cn(
        'border-border/50 border-b transition-colors last:border-b-0',
        isClientSelected
          ? 'bg-primary/5 dark:bg-primary/10'
          : canOpenBook && 'hover:bg-muted/35',
      )}
      aria-label={
        canOpenBook
          ? undefined
          : `${firmQueueRowTitle(task)}. ${FIRM_NO_BOOK_ACCESS_SUMMARY_QUEUE}.`
      }
    >
      {canOpenBook ? (
        <button
          type="button"
          title={firmQueueRowTitle(task)}
          onClick={handleRowActivate}
          className="text-foreground focus-visible:ring-ring/50 group flex w-full min-w-0 cursor-pointer items-start gap-2.5 px-3 py-2.5 text-left transition-colors outline-none focus-visible:ring-2 lg:gap-3 lg:pr-2"
        >
          <FirmQueueRowInner task={task} />
        </button>
      ) : (
        <div className="relative w-full min-w-0">
          <div
            className="text-foreground pointer-events-none flex w-full min-w-0 items-start gap-2.5 px-3 py-2.5 opacity-45 select-none lg:gap-3 lg:pr-2"
            aria-hidden
          >
            <FirmQueueRowInner task={task} />
          </div>
          <FirmNoBookAccessOverlay context="queue" />
        </div>
      )}
    </li>
  );
}

type FirmAssignee = NonNullable<FirmClientSummary['assignee']>;

function FirmClientRowActions({
  client,
  canOpenBook,
  onOpenBook,
  isSwitching,
}: {
  client: FirmClientSummary;
  canOpenBook: boolean;
  onOpenBook: () => void;
  isSwitching: boolean;
}) {
  const handleOpenBook = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (!canOpenBook) return;
    onOpenBook();
  };

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <button
        type="button"
        onClick={handleOpenBook}
        disabled={!canOpenBook || isSwitching}
        aria-label={`Open ${client.name} book`}
        title={!canOpenBook ? FIRM_NO_BOOK_ACCESS_SUMMARY_ROSTER : undefined}
        className={cn(
          'border-border bg-background text-foreground hover:bg-muted flex shrink-0 cursor-pointer items-center gap-1 rounded border px-2 py-1 text-xs transition-colors',
          'disabled:pointer-events-none disabled:opacity-50',
        )}
      >
        <span className="hidden lg:inline">Open</span>
        <ArrowRight className="size-3 shrink-0" />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            className="text-muted-foreground hover:text-foreground shrink-0 rounded p-1.5 transition-colors"
            aria-label={`More actions for ${client.name}`}
          >
            <MoreVertical className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem disabled>Client details</DropdownMenuItem>
          <DropdownMenuItem disabled>View tasks</DropdownMenuItem>
          <DropdownMenuItem disabled>Reassign on roster</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function AssigneeFilterPopover({
  assigneeInputId,
  teamMembers,
  rosterClients,
  teamMemberFilter,
  onClear,
  onValueChange,
}: {
  assigneeInputId: string;
  teamMembers: FirmAssignee[];
  rosterClients: FirmClientSummary[];
  teamMemberFilter: string | null;
  onClear: () => void;
  onValueChange: (initials: string | null) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground relative shrink-0 rounded p-1 transition-colors"
          aria-label={
            teamMemberFilter
              ? 'Assignee filter active'
              : 'Filter queue by assignee'
          }
        >
          <Filter className="size-4" />
          {teamMemberFilter && (
            <span className="bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] leading-none">
              1
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-foreground text-sm font-medium">Filters</p>
          <button
            type="button"
            onClick={onClear}
            className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
          >
            Clear
          </button>
        </div>
        <div className="space-y-1 text-xs">
          <p className="text-muted-foreground">Assignee</p>
          <AutocompleteDropdown
            id={assigneeInputId}
            items={teamMembers.map((member) => {
              const clientCount = rosterClients.filter(
                (c) => c.assignee?.initials === member.initials,
              ).length;
              return {
                value: member.initials,
                label: `${member.initials} ${member.name} ${clientCount}`,
              };
            })}
            value={teamMemberFilter ?? ''}
            onValueChange={(value) => onValueChange(value || null)}
            placeholder="All team"
            searchPlaceholder="Search team…"
            className="h-8 w-full text-xs"
            width="w-full"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function FirmDashboardPage({
  initialMobileTab = 'queue',
}: {
  initialMobileTab?: 'queue' | 'clients';
}) {
  const [isClientSearchOpen, setIsClientSearchOpen] = useState(false);
  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const clientSearchInputRef = useRef<HTMLInputElement>(null);

  const [isThisWeekExpanded, setIsThisWeekExpanded] = useState(() => {
    if (typeof window === 'undefined') return false;
    const stored = localStorage.getItem(THIS_WEEK_VISIBLE_KEY);
    return stored === 'true';
  });

  const [transactionsPeriod, setTransactionsPeriod] =
    useState<TransactionPeriod>('today');

  const [showOnlyUnhealthy, setShowOnlyUnhealthy] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [teamMemberFilter, setTeamMemberFilter] = useState<string | null>(null);
  const [myTasksOnly, setMyTasksOnly] = useState(false);
  const [mobileFirmTab, setMobileFirmTab] = useState<'queue' | 'clients'>(
    initialMobileTab,
  );

  const [addClientOpen, setAddClientOpen] = useState(false);
  const addClientDesktop = useMediaQuery('(min-width: 1024px)');

  const [lastOpenedClientId] = useState<string | null>(null);

  const staffMyTasksDefaultApplied = useRef(false);
  const { data: shell } = useFirmDashboardShell();
  const invitePermissionResolved = shell !== undefined;
  const viewerRole = shell?.viewerRole;
  const canInvite =
    invitePermissionResolved &&
    canInviteFirmClients(viewerRole, shell.inviteClientRolesAllowed);
  const firmUserCount = shell?.firmUserCount ?? 0;
  const showTeamFeatures = viewerRole
    ? firmShowsTeamFeatures(viewerRole, firmUserCount)
    : false;
  const firmPerf = shell?.firmPerformanceStats ?? EMPTY_FIRM_PERF;
  const weeklyActivity = shell?.weeklyActivity ?? [];

  useEffect(() => {
    if (!shell || staffMyTasksDefaultApplied.current) return;
    staffMyTasksDefaultApplied.current = true;
    if (shell.viewerRole === 'staff') setMyTasksOnly(true);
  }, [shell]);

  useEffect(() => {
    if (!canInvite && addClientOpen) setAddClientOpen(false);
  }, [canInvite, addClientOpen]);

  const {
    clients: rosterClients,
    firmCompanyId: rosterFirmCompanyId,
    isLoading: rosterLoading,
  } = useFirmClientRoster();

  const { openClientBook, canOpenClientBook, isSwitching } =
    useOpenClientBook();

  const canAccessCompany = useCallback(
    (clientCompanyId: string) =>
      FIRM_DASHBOARD_DEV_BYPASS_BOOK_ACCESS_UI ||
      canOpenClientBook(clientCompanyId),
    [canOpenClientBook],
  );

  const teamMembers = useMemo(
    () =>
      showTeamFeatures
        ? Array.from(
            new Map(
              rosterClients
                .filter((c) => c.assignee)
                .map((c) => [c.assignee!.initials, c.assignee!]),
            ).values(),
          )
        : [],
    [rosterClients, showTeamFeatures],
  );

  const { user } = useSession();

  const firmInviteAssigneeOptions = useMemo((): FirmInviteStaffOption[] => {
    const map = new Map<string, FirmInviteStaffOption>();
    if (user?.id) {
      const name =
        [user.firstname, user.lastname].filter(Boolean).join(' ') || user.email;
      const initials = (
        (user.firstname?.charAt(0) ?? '') + (user.lastname?.charAt(0) ?? '')
      ).toUpperCase();
      map.set(user.id, {
        userId: user.id,
        name,
        initials: initials || user.email.slice(0, 2).toUpperCase(),
      });
    }
    for (const m of teamMembers) {
      if (m.userId) {
        map.set(m.userId, {
          userId: m.userId,
          name: m.name,
          initials: m.initials,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [user, teamMembers]);

  const assigneeFilterLabel = useMemo(() => {
    if (!teamMemberFilter) return null;
    const m = teamMembers.find((x) => x.initials === teamMemberFilter);
    return m ? `${m.name} (${m.initials})` : teamMemberFilter;
  }, [teamMemberFilter, teamMembers]);

  const queueViewIsFiltered =
    selectedClientId !== null || teamMemberFilter !== null || myTasksOnly;

  useEffect(() => {
    localStorage.setItem(THIS_WEEK_VISIBLE_KEY, String(isThisWeekExpanded));
  }, [isThisWeekExpanded]);

  useEffect(() => {
    if (isClientSearchOpen) {
      clientSearchInputRef.current?.focus();
    }
  }, [isClientSearchOpen]);

  const filteredClients = useMemo(() => {
    let clients = sortClientsByUrgency(rosterClients);
    if (showOnlyUnhealthy) {
      clients = clients.filter((c) => c.status !== 'healthy');
    }
    if (teamMemberFilter) {
      clients = clients.filter(
        (c) => c.assignee?.initials === teamMemberFilter,
      );
    }
    return filterClientsByQuery(clients, clientSearchQuery);
  }, [clientSearchQuery, rosterClients, showOnlyUnhealthy, teamMemberFilter]);

  const selectedClient = selectedClientId
    ? (filteredClients.find((c) => c.id === selectedClientId) ??
      rosterClients.find((c) => c.id === selectedClientId) ??
      null)
    : null;

  useEffect(() => {
    if (
      selectedClientId &&
      !filteredClients.some((c) => c.id === selectedClientId)
    ) {
      setSelectedClientId(null);
    }
  }, [filteredClients, selectedClientId]);

  const {
    actionableItems,
    waitingItems,
    summary: queueSummary,
    isLoading: queueLoading,
    isError: queueError,
    refetch: refetchTaskQueue,
  } = useFirmTaskQueue({
    viewerRole,
    clients: rosterClients,
    clientCompanyId: selectedClientId,
    teamMemberInitials: teamMemberFilter,
    myTasksOnly,
    enabled: !rosterLoading && !!shell,
  });

  const openTasksSubtitle = useMemo(() => {
    const filterParts: string[] = [];
    if (selectedClient) {
      const label = selectedClient.shortCode?.trim() || selectedClient.name;
      if (label) filterParts.push(label);
    } else if (selectedClientId) {
      filterParts.push('Client');
    }
    if (myTasksOnly) filterParts.push('My tasks');
    if (assigneeFilterLabel) filterParts.push(assigneeFilterLabel);

    const filteredLead =
      filterParts.length > 0 ? ` · ${filterParts.join(' · ')}` : '';

    if (!queueViewIsFiltered) {
      if (queueLoading) return { muted: ' · Loading…', title: undefined };
      if (queueSummary.totalTasks > 0) {
        return {
          muted: ` · ${queueSummary.actionableCount} ready · ${queueSummary.waitingCount} blocked · ${queueSummary.clientCompanyCount} ${queueSummary.clientCompanyCount === 1 ? 'client' : 'clients'}`,
          title: undefined,
        };
      }
      return { muted: ' · None open', title: undefined };
    }

    const tail = queueLoading
      ? ' · Loading…'
      : queueSummary.totalTasks === 0
        ? ' · None open'
        : '';
    return {
      muted: `${filteredLead}${tail}`,
      title:
        filterParts.length > 0
          ? `Filtered: ${filterParts.join(' · ')}`
          : undefined,
    };
  }, [
    assigneeFilterLabel,
    myTasksOnly,
    queueLoading,
    queueSummary.actionableCount,
    queueSummary.clientCompanyCount,
    queueSummary.totalTasks,
    queueSummary.waitingCount,
    queueViewIsFiltered,
    selectedClient,
    selectedClientId,
  ]);

  const showAssigneeQueueFilter = showTeamFeatures && teamMembers.length > 1;

  const rosterListFiltersActive = Boolean(
    clientSearchQuery.trim() || showOnlyUnhealthy || teamMemberFilter,
  );

  const clearRosterListFilters = () => {
    setClientSearchQuery('');
    setShowOnlyUnhealthy(false);
    setTeamMemberFilter(null);
    setIsClientSearchOpen(false);
  };

  const overdueCount = rosterClients.filter(
    (c) => c.status === 'overdue',
  ).length;
  const needAttentionCount = rosterClients.filter(
    (c) => c.status === 'need_attention',
  ).length;
  const healthyCount = rosterClients.filter(
    (c) => c.status === 'healthy',
  ).length;
  const totalClients = rosterClients.length;
  const clientsUpToDateLabel = getClientsUpToDateLabel(
    healthyCount,
    totalClients,
  );

  const todayIndex = (new Date().getDay() + 6) % 7;

  const clientStats = selectedClient?.transactionStats;
  const transactionValues = clientStats
    ? {
        today: clientStats.today,
        week: clientStats.week,
        month: clientStats.month,
      }
    : {
        today: firmPerf.transactionsToday,
        week: firmPerf.transactionsWeek,
        month: firmPerf.transactionsMonth,
      };
  const transactionPrevValues = clientStats
    ? {
        today: clientStats.todayPrev,
        week: clientStats.weekPrev,
        month: clientStats.monthPrev,
      }
    : {
        today: firmPerf.transactionsTodayPrev,
        week: firmPerf.transactionsWeekPrev,
        month: firmPerf.transactionsMonthPrev,
      };
  const currentTransactions = transactionValues[transactionsPeriod];
  const delta = getTransactionDelta(
    currentTransactions,
    transactionPrevValues[transactionsPeriod],
  );

  return (
    <div className="bg-muted dark:bg-background flex h-full min-h-0 w-full">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-480 flex-1 flex-col gap-4 p-4 xl:px-8">
        <div className="flex justify-between">
          <div className="flex flex-col">
            <div className="text-xl font-medium">
              {shell?.heroGreetingLine ?? '\u00a0'}
            </div>
            <div className="text-muted-foreground line-clamp-2 text-sm">
              {shell?.heroSubline ?? '\u00a0'}
            </div>
          </div>

          <div>
            <div></div>
            <div></div>

            <button
              type="button"
              className="hover:bg-border dark:hover:bg-muted rounded-lg p-2 transition-colors"
              aria-label="Activity history"
            >
              <div className="relative flex size-5.5 items-center justify-center">
                <History className="size-5" />
                <div className="bg-primary absolute top-0 right-0 size-2 rounded-full" />
              </div>
            </button>
          </div>
        </div>

        <div
          className="flex min-h-0 w-full flex-1 flex-col gap-3 lg:gap-6"
          role="presentation"
        >
          <div className="bg-muted/95 dark:bg-background/95 supports-backdrop-filter:bg-muted/80 dark:supports-backdrop-filter:bg-background/80 sticky top-0 z-50 mb-2 backdrop-blur lg:static lg:mb-0 lg:hidden">
            <div
              className="grid grid-cols-2 gap-1 rounded-[10px] bg-black/5 p-1 dark:bg-white/5"
              role="tablist"
              aria-label="Firm dashboard section"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mobileFirmTab === 'queue'}
                className={cn(
                  'min-w-0 flex-1 rounded-md px-3 py-1.5 text-center text-[13px] font-medium whitespace-nowrap transition-colors sm:px-4 sm:py-2 sm:text-sm',
                  mobileFirmTab === 'queue'
                    ? 'bg-background text-foreground ring-border shadow-sm ring-1'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                onClick={() => setMobileFirmTab('queue')}
              >
                Queue
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mobileFirmTab === 'clients'}
                className={cn(
                  'min-w-0 flex-1 rounded-md px-3 py-1.5 text-center text-[13px] font-medium whitespace-nowrap transition-colors sm:px-4 sm:py-2 sm:text-sm',
                  mobileFirmTab === 'clients'
                    ? 'bg-background text-foreground ring-border shadow-sm ring-1'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                onClick={() => setMobileFirmTab('clients')}
              >
                {showTeamFeatures ? 'Clients' : 'Your clients'}
              </button>
            </div>
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 lg:flex-row lg:gap-6">
            <div
              className={cn(
                'flex min-h-0 min-w-0 flex-1 flex-col gap-4 text-sm lg:flex-2',
                mobileFirmTab !== 'queue' ? 'hidden lg:flex' : 'flex',
              )}
            >
              <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-4">
                <div className="bg-background dark:bg-muted/30 dark:border-border/50 rounded-md p-4 dark:border">
                  {overdueCount + needAttentionCount > 0 ? (
                    <>
                      {overdueCount + needAttentionCount} client
                      {overdueCount + needAttentionCount === 1 ? '' : 's'} need
                      attention —{' '}
                      <span className="lg:hidden">
                        open the Clients tab to review.
                      </span>
                      <span className="max-lg:hidden">
                        review the list on the right.
                      </span>
                    </>
                  ) : (
                    <>All tracked clients look healthy this week.</>
                  )}
                </div>
                <div className="ring-border/50 flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden rounded-md shadow-sm ring-1 *:w-full">
                  <div className="bg-background dark:bg-muted/30 flex flex-nowrap items-center justify-between gap-2 border-b px-3 py-2 sm:px-4 sm:py-2.5">
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <p
                        className="truncate text-sm"
                        title={openTasksSubtitle.title}
                      >
                        <span className="text-foreground font-medium">
                          Open tasks
                        </span>
                        <span className="text-muted-foreground">
                          {openTasksSubtitle.muted}
                        </span>
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant={myTasksOnly ? 'secondary' : 'outline'}
                        size="sm"
                        className="h-8 shrink-0 px-2.5 text-xs sm:px-3"
                        onClick={() => setMyTasksOnly((v) => !v)}
                      >
                        My tasks
                      </Button>
                      {showAssigneeQueueFilter && (
                        <div className="lg:hidden">
                          <AssigneeFilterPopover
                            assigneeInputId="firm-queue-assignee-filter"
                            teamMembers={teamMembers}
                            rosterClients={rosterClients}
                            teamMemberFilter={teamMemberFilter}
                            onClear={() => setTeamMemberFilter(null)}
                            onValueChange={setTeamMemberFilter}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-background min-h-0 flex-1 overflow-y-auto overscroll-contain">
                    {queueLoading ? (
                      <p className="text-muted-foreground m-auto px-4 py-8 text-center text-xs">
                        Loading tasks…
                      </p>
                    ) : queueError ? (
                      <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                        <p className="text-muted-foreground text-xs">
                          Couldn’t load the task queue.
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={() => void refetchTaskQueue()}
                        >
                          Retry
                        </Button>
                      </div>
                    ) : queueSummary.totalTasks === 0 ? (
                      <p className="text-muted-foreground m-auto px-4 py-8 text-center text-xs">
                        {selectedClientId
                          ? 'No open tasks for this client with the current filters.'
                          : teamMemberFilter
                            ? 'No open tasks for this assignee with the current filters.'
                            : myTasksOnly
                              ? 'No tasks assigned to you — turn off “My tasks” to see the client pool.'
                              : 'No open tasks match the current filters.'}
                      </p>
                    ) : (
                      <div className="flex flex-col">
                        {queueSummary.actionableCount === 0 &&
                          queueSummary.waitingCount > 0 && (
                            <p className="text-muted-foreground border-border/50 border-b px-3 py-2.5 text-center text-xs">
                              Nothing ready to work on with these filters — open
                              items are waiting or blocked below.
                            </p>
                          )}
                        {actionableItems.length > 0 && (
                          <>
                            <h3 className="text-muted-foreground bg-muted/35 border-border/50 border-b px-3 py-1.5 text-[11px] font-semibold tracking-wide uppercase">
                              Ready to work
                            </h3>
                            <ul
                              className="flex flex-col"
                              aria-label="Tasks ready to work"
                            >
                              {actionableItems.map((task) => (
                                <FirmQueueRow
                                  key={task.id}
                                  task={task}
                                  selectedClientId={selectedClientId}
                                  canOpenBook={canAccessCompany(
                                    task.clientCompanyId,
                                  )}
                                  onOpenBook={() =>
                                    void openClientBook(task.clientCompanyId)
                                  }
                                  onActivateClient={(clientCompanyId) => {
                                    setSelectedClientId(clientCompanyId);
                                    setIsThisWeekExpanded(true);
                                  }}
                                />
                              ))}
                            </ul>
                          </>
                        )}
                        {waitingItems.length > 0 && (
                          <>
                            <h3 className="text-muted-foreground bg-muted/35 border-border/50 border-b px-3 py-1.5 text-[11px] font-semibold tracking-wide uppercase">
                              Waiting / blocked
                            </h3>
                            <ul
                              className="flex flex-col"
                              aria-label="Tasks waiting or blocked"
                            >
                              {waitingItems.map((task) => (
                                <FirmQueueRow
                                  key={task.id}
                                  task={task}
                                  selectedClientId={selectedClientId}
                                  canOpenBook={canAccessCompany(
                                    task.clientCompanyId,
                                  )}
                                  onOpenBook={() =>
                                    void openClientBook(task.clientCompanyId)
                                  }
                                  onActivateClient={(clientCompanyId) => {
                                    setSelectedClientId(clientCompanyId);
                                    setIsThisWeekExpanded(true);
                                  }}
                                />
                              ))}
                            </ul>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div
              className={cn(
                'border-border flex min-h-0 min-w-0 flex-col gap-3 overflow-y-auto text-sm max-lg:flex-1 lg:w-[min(100%,380px)] lg:max-w-[380px] lg:shrink-0 xl:w-[400px]',
                mobileFirmTab === 'clients' ? 'flex' : 'hidden lg:flex',
              )}
            >
              <section className="bg-background dark:bg-muted/30 flex min-h-0 flex-1 flex-col overflow-hidden rounded-md shadow-sm">
                <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b px-4 py-0.5">
                  <div className="min-w-30">
                    {showTeamFeatures ? 'Clients' : 'Your Clients'}{' '}
                    <span className="text-muted-foreground text-xs">
                      {clientSearchQuery.trim() || showOnlyUnhealthy
                        ? `${filteredClients.length} of ${totalClients}`
                        : totalClients}
                    </span>
                  </div>
                  <div className="flex min-w-0 flex-1 items-center justify-end gap-1">
                    {isClientSearchOpen ? (
                      <>
                        <input
                          ref={clientSearchInputRef}
                          type="search"
                          placeholder="Search clients…"
                          value={clientSearchQuery}
                          onChange={(e) => setClientSearchQuery(e.target.value)}
                          onBlur={() => {
                            if (!clientSearchQuery.trim())
                              setIsClientSearchOpen(false);
                          }}
                          className="h-7 min-w-0 flex-1 rounded-md border px-2 text-sm"
                          aria-label="Search clients by name or industry"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setClientSearchQuery('');
                            setIsClientSearchOpen(false);
                          }}
                          className="text-muted-foreground hover:text-foreground shrink-0 rounded p-1 transition-colors"
                          aria-label="Close search"
                        >
                          <X className="size-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="text-muted-foreground hidden items-center gap-1 text-[10px] whitespace-nowrap sm:flex">
                          {overdueCount > 0 && (
                            <span
                              title={`${overdueCount} overdue`}
                              className="text-destructive truncate"
                            >
                              {overdueCount} overdue
                            </span>
                          )}
                          {overdueCount > 0 && needAttentionCount > 0 && (
                            <span>•</span>
                          )}
                          {needAttentionCount > 0 && (
                            <span
                              title={`${needAttentionCount} need attention`}
                              className="truncate text-orange-500"
                            >
                              {needAttentionCount} need attention
                            </span>
                          )}
                        </p>
                        <button
                          type="button"
                          onClick={() => setIsClientSearchOpen(true)}
                          className="text-muted-foreground hover:text-foreground shrink-0 rounded p-1 transition-colors"
                          aria-label="Search clients"
                        >
                          <Search className="size-4" />
                        </button>
                      </>
                    )}

                    {canInvite ? (
                      <button
                        type="button"
                        onClick={() => setAddClientOpen(true)}
                        className="text-muted-foreground hover:text-foreground shrink-0 rounded p-1 transition-colors"
                        aria-label="Add client"
                      >
                        <Plus className="size-4" />
                      </button>
                    ) : null}

                    {showAssigneeQueueFilter && (
                      <AssigneeFilterPopover
                        assigneeInputId="firm-clients-assignee-filter"
                        teamMembers={teamMembers}
                        rosterClients={rosterClients}
                        teamMemberFilter={teamMemberFilter}
                        onClear={() => setTeamMemberFilter(null)}
                        onValueChange={setTeamMemberFilter}
                      />
                    )}
                  </div>
                </div>

                <div
                  className={cn(
                    'min-h-0 flex-1 overflow-y-auto pb-2',
                    filteredClients.length === 0 &&
                      'flex items-center justify-center',
                  )}
                >
                  {filteredClients.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
                      {totalClients === 0 ? (
                        <>
                          <p className="text-foreground text-sm font-medium">
                            No clients yet
                          </p>
                          <p className="text-muted-foreground max-w-xs text-xs">
                            {invitePermissionResolved && !canInvite
                              ? NO_CLIENTS_NO_INVITE_PERMISSION_COPY
                              : ADD_CLIENT_DESCRIPTION}
                          </p>
                          {canInvite ? (
                            <Button
                              type="button"
                              size="sm"
                              className="text-xs"
                              onClick={() => setAddClientOpen(true)}
                            >
                              Add client
                            </Button>
                          ) : null}
                        </>
                      ) : (
                        <>
                          <p className="text-foreground text-sm font-medium">
                            No clients match
                          </p>
                          <p className="text-muted-foreground max-w-xs text-xs">
                            {invitePermissionResolved && !canInvite
                              ? 'Try clearing filters.'
                              : 'Try clearing filters or add another client to your roster.'}
                          </p>
                          <div className="flex flex-wrap items-center justify-center gap-2">
                            {rosterListFiltersActive && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="text-xs"
                                onClick={clearRosterListFilters}
                              >
                                Clear filters
                              </Button>
                            )}
                            {canInvite ? (
                              <Button
                                type="button"
                                size="sm"
                                className="text-xs"
                                onClick={() => setAddClientOpen(true)}
                              >
                                Add client
                              </Button>
                            ) : null}
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <ul className="flex flex-col">
                      {filteredClients.map((client) => {
                        const canOpen = canAccessCompany(client.id);
                        const isRosterSelected = selectedClientId === client.id;
                        const isRosterLastOpened =
                          lastOpenedClientId === client.id;
                        const rosterRowBg = isRosterSelected
                          ? 'bg-primary/5 dark:bg-primary/10'
                          : isRosterLastOpened
                            ? 'bg-muted/30 dark:bg-muted/10'
                            : '';

                        if (!canOpen) {
                          return (
                            <li
                              key={client.id}
                              className={cn(
                                'border-border/50 relative border-b transition-colors last:border-b-0',
                                rosterRowBg,
                              )}
                              aria-label={`${client.name}. ${FIRM_NO_BOOK_ACCESS_SUMMARY_ROSTER}.`}
                            >
                              <div className="relative flex min-h-14 w-full min-w-0 items-stretch">
                                <div className="text-foreground pointer-events-none flex min-w-0 flex-1 items-center gap-2 px-4 py-3 opacity-45">
                                  <FirmClientRosterCells
                                    client={client}
                                    showTeamFeatures={showTeamFeatures}
                                    lastOpenedClientId={lastOpenedClientId}
                                  />
                                </div>
                                <FirmNoBookAccessOverlay context="roster" />
                              </div>
                            </li>
                          );
                        }

                        return (
                          <li
                            key={client.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              const newId =
                                selectedClientId === client.id
                                  ? null
                                  : client.id;
                              setSelectedClientId(newId);
                              if (newId) setIsThisWeekExpanded(true);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                const newId =
                                  selectedClientId === client.id
                                    ? null
                                    : client.id;
                                setSelectedClientId(newId);
                                if (newId) setIsThisWeekExpanded(true);
                              }
                            }}
                            className={cn(
                              'border-border/50 flex cursor-pointer items-center gap-2 border-b px-4 py-3 transition-colors last:border-b-0',
                              isRosterSelected &&
                                'bg-primary/5 dark:bg-primary/10',
                              !isRosterSelected &&
                                isRosterLastOpened &&
                                'bg-muted/30 dark:bg-muted/10',
                              !isRosterSelected &&
                                !isRosterLastOpened &&
                                'hover:bg-muted/40',
                            )}
                          >
                            <FirmClientRosterCells
                              client={client}
                              showTeamFeatures={showTeamFeatures}
                              lastOpenedClientId={lastOpenedClientId}
                            />
                            <FirmClientRowActions
                              client={client}
                              canOpenBook
                              onOpenBook={() => void openClientBook(client.id)}
                              isSwitching={isSwitching}
                            />
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </section>

              <section className="bg-background dark:bg-muted/30 mt-auto hidden shrink-0 flex-col gap-2.5 rounded-md p-4 shadow-sm sm:flex">
                <div className="flex items-center justify-between">
                  <p className="text-foreground text-sm">
                    {selectedClient ? selectedClient.name : 'This week'}
                  </p>
                  <div className="flex items-center gap-2">
                    {selectedClient && (
                      <button
                        type="button"
                        onClick={() => setSelectedClientId(null)}
                        className="text-muted-foreground hover:text-foreground text-xs transition-colors"
                        aria-label="Clear client selection"
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsThisWeekExpanded((v) => !v)}
                      className="text-muted-foreground hover:text-foreground cursor-pointer text-xs hover:underline"
                      aria-expanded={isThisWeekExpanded}
                    >
                      {isThisWeekExpanded ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>

                {isThisWeekExpanded && (
                  <>
                    <div>
                      <ResponsiveContainer width="100%" height={100}>
                        <BarChart data={weeklyActivity} barCategoryGap="25%">
                          <XAxis
                            dataKey="day"
                            axisLine={false}
                            tickLine={false}
                            tick={{
                              fontSize: 11,
                              fill: 'var(--muted-foreground)',
                            }}
                          />
                          <YAxis hide />
                          <Tooltip
                            content={<ActivityTooltip />}
                            cursor={false}
                          />
                          <Bar dataKey="transactions" radius={[4, 4, 0, 0]}>
                            {weeklyActivity.map((entry, index) => (
                              <Cell
                                key={entry.day}
                                fill={
                                  index === todayIndex
                                    ? 'var(--primary)'
                                    : entry.transactions === 0
                                      ? 'var(--border)'
                                      : 'var(--muted)'
                                }
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="grid grid-cols-[2fr_1fr] gap-2.5">
                      <div className="bg-muted flex flex-1 items-center gap-2 overflow-hidden rounded-lg px-3 py-2.5">
                        <div className="flex shrink-0 flex-col justify-center gap-0.5">
                          {TRANSACTION_PERIODS.map((period) => (
                            <button
                              key={period.value}
                              type="button"
                              onClick={() =>
                                setTransactionsPeriod(period.value)
                              }
                              className={cn(
                                'cursor-pointer rounded-full px-1.5 py-0.5 text-left text-xs font-light whitespace-nowrap transition-colors',
                                transactionsPeriod === period.value
                                  ? 'bg-border text-foreground font-normal'
                                  : 'text-muted-foreground hover:text-foreground',
                              )}
                            >
                              {period.label}
                            </button>
                          ))}
                        </div>
                        <Separator
                          orientation="vertical"
                          className="h-[90%]!"
                        />
                        <div className="flex-1">
                          <p className="text-muted-foreground text-xs">
                            {getFirmTransactionStatsLabel(
                              viewerRole,
                              firmUserCount,
                            )}
                          </p>
                          <p className="text-foreground mt-0.5 text-xl leading-tight">
                            {currentTransactions}
                          </p>
                          <p
                            className={cn(
                              'flex items-center gap-1 text-xs',
                              delta.direction === 'up' &&
                                'text-emerald-600 dark:text-emerald-500',
                              delta.direction === 'down' && 'text-destructive',
                              delta.direction === 'flat' &&
                                'text-muted-foreground',
                            )}
                          >
                            {delta.direction === 'up' && (
                              <TrendingUp className="size-3" />
                            )}
                            {delta.direction === 'down' && (
                              <TrendingDown className="size-3" />
                            )}
                            {delta.label}
                          </p>
                        </div>
                      </div>

                      {selectedClient ? (
                        <div className="bg-muted rounded-lg px-3 py-2.5">
                          <p className="text-muted-foreground text-xs">
                            Status
                          </p>
                          <p className="text-foreground mt-0.5 text-xl leading-tight">
                            {selectedClient.openTaskCount}
                            <span className="text-muted-foreground ml-1 text-xs">
                              open
                            </span>
                          </p>
                          <p className="text-muted-foreground text-xs">
                            {selectedClient.lastActivityLabel}
                          </p>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowOnlyUnhealthy((v) => !v)}
                          className={cn(
                            'bg-muted cursor-pointer rounded-lg px-3 py-2.5 text-left transition-colors',
                            showOnlyUnhealthy && 'ring-primary/50 ring-1',
                          )}
                          title="Click to filter client list"
                        >
                          <p className="text-muted-foreground text-xs">
                            Clients up to date
                          </p>
                          <p className="text-foreground mt-0.5 text-xl leading-tight">
                            {healthyCount}/{totalClients}
                          </p>
                          <p
                            className={cn(
                              'text-xs',
                              clientsUpToDateLabel === 'Excellent' &&
                                'text-emerald-600 dark:text-emerald-500',
                              clientsUpToDateLabel === 'On track' &&
                                'text-muted-foreground',
                              clientsUpToDateLabel === 'Needs attention' &&
                                'text-orange-600 dark:text-orange-500',
                            )}
                          >
                            {showOnlyUnhealthy
                              ? 'Showing unhealthy'
                              : clientsUpToDateLabel}
                          </p>
                        </button>
                      )}
                    </div>
                  </>
                )}
              </section>
            </div>
          </div>
        </div>
      </div>

      {canInvite ? (
        addClientDesktop ? (
          <Dialog open={addClientOpen} onOpenChange={setAddClientOpen}>
            <DialogContent className="flex max-h-[min(90vh,800px)] flex-col gap-0 overflow-hidden sm:max-w-lg">
              <DialogHeader className="shrink-0 pr-8">
                <DialogTitle>Add client</DialogTitle>
                <DialogDescription>{ADD_CLIENT_DESCRIPTION}</DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-y-auto py-2">
                <InviteClientWizard
                  open={addClientOpen}
                  layout="dialog"
                  assigneeOptions={firmInviteAssigneeOptions}
                  defaultAssigneeUserId={user?.id}
                  firmCompanyId={rosterFirmCompanyId}
                  onRequestClose={() => setAddClientOpen(false)}
                />
              </div>
            </DialogContent>
          </Dialog>
        ) : (
          <Sheet open={addClientOpen} onOpenChange={setAddClientOpen}>
            <SheetContent
              side="bottom"
              className="flex h-[min(92dvh,44rem)] max-h-[92dvh] flex-col gap-0 overflow-hidden rounded-t-2xl border-t p-0 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-lg"
            >
              <div
                className="flex shrink-0 justify-center pt-2 pb-1"
                aria-hidden
              >
                <div className="bg-muted-foreground/25 h-1 w-10 rounded-full" />
              </div>
              <SheetHeader className="border-border shrink-0 space-y-1 border-b px-4 pt-0 pr-12 pb-3 text-left">
                <SheetTitle className="text-lg">Add client</SheetTitle>
                <SheetDescription className="text-pretty">
                  {ADD_CLIENT_DESCRIPTION}
                </SheetDescription>
              </SheetHeader>
              <div className="flex min-h-0 flex-1 flex-col px-4 pt-3">
                <InviteClientWizard
                  open={addClientOpen}
                  layout="sheet"
                  assigneeOptions={firmInviteAssigneeOptions}
                  defaultAssigneeUserId={user?.id}
                  firmCompanyId={rosterFirmCompanyId}
                  onRequestClose={() => setAddClientOpen(false)}
                />
              </div>
            </SheetContent>
          </Sheet>
        )
      ) : null}
    </div>
  );
}
