import type {
  TeamMember,
  TeamMemberRole,
  TeamMemberStatus,
} from '@/features/settings/team';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  formatMemberActivityLabel,
  useTeamMembers,
} from '@/features/settings/team';
import { TEAM_SETTINGS_UI_ACTIONS_ENABLED } from '@/modules/company/team-settings';
import {
  ChevronDown,
  ChevronUp,
  MoreHorizontal,
  Plus,
  Search,
  Users,
} from 'lucide-react';

function getRoleLabel(role: TeamMemberRole): string {
  switch (role) {
    case 'owner':
      return 'Owner';
    case 'admin':
      return 'Admin';
    case 'accountant':
      return 'Accountant';
    case 'bookkeeper':
      return 'Bookkeeper';
    case 'viewer':
      return 'Viewer';
    default:
      return role;
  }
}

function getStatusBadgeVariant(status: TeamMemberStatus) {
  switch (status) {
    case 'active':
      return 'secondary' as const;
    case 'invited':
      return 'outline' as const;
    default:
      return 'outline' as const;
  }
}

function getStatusLabel(status: TeamMemberStatus): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'invited':
      return 'Invited';
    default:
      return status;
  }
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function getTeamMemberRowKey(member: TeamMember): string {
  if (member.status === 'invited') {
    return member.inviteId;
  }
  return member.membershipId;
}

function SummaryCard({
  label,
  value,
  helper,
  className,
}: {
  label: string;
  value: ReactNode;
  helper: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`border-border/60 bg-background flex flex-col gap-1 rounded-md border p-3 ${className ?? ''}`}
    >
      <span className="text-muted-foreground text-xs">{label}</span>
      <div className="text-base font-semibold">{value}</div>
      <div className="text-muted-foreground text-xs">{helper}</div>
    </div>
  );
}

export function SettingsTeamPage() {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<TeamMemberStatus | 'all'>(
    'all',
  );
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);

  const { members, isLoading, summary, isError, error, refetch, companyId } =
    useTeamMembers();

  const actionsEnabled = TEAM_SETTINGS_UI_ACTIONS_ENABLED;
  const needsCompanyContext = !companyId;
  const summaryLoading = Boolean(companyId) && isLoading && !isError;
  const summaryReady = Boolean(companyId) && !isLoading && !isError;

  const showMemberRows = !needsCompanyContext && !isError;

  const filteredMembers = useMemo(() => {
    const q = query.trim().toLowerCase();

    return members.filter((member) => {
      const matchesSearch =
        q.length === 0 ||
        member.name.toLowerCase().includes(q) ||
        member.email.toLowerCase().includes(q);
      const matchesStatus =
        statusFilter === 'all' || member.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [members, query, statusFilter]);

  return (
    <div
      data-slot="settings-team-page"
      className="flex min-h-0 flex-col gap-5 pb-4"
    >
      <section className="border-border/60 flex shrink-0 flex-col gap-4 rounded-md border p-4 transition-all duration-200">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h2 className="text-sm font-medium">Team Settings</h2>
            <p className="text-muted-foreground text-xs">
              Manage workspace members, roles, and access controls.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-36 justify-between xl:hidden"
              onClick={() => setIsSummaryExpanded(!isSummaryExpanded)}
            >
              {isSummaryExpanded ? 'Hide summary' : 'Show summary'}
              {isSummaryExpanded ? (
                <ChevronUp className="size-4 shrink-0" />
              ) : (
                <ChevronDown className="size-4 shrink-0" />
              )}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!actionsEnabled || needsCompanyContext}
              title={
                !actionsEnabled
                  ? 'Invites will be available when team actions are connected.'
                  : needsCompanyContext
                    ? 'Select a workspace to invite members.'
                    : undefined
              }
            >
              <Plus className="mr-1.5 size-4" />
              Invite member
            </Button>
          </div>
        </div>

        <div
          className={`${isSummaryExpanded ? 'grid' : 'hidden'} grid-cols-2 gap-2 lg:grid-cols-3 xl:grid xl:grid-cols-4`}
        >
          {summaryLoading ? (
            Array.from({ length: 4 }).map((_, index) => (
              <div
                key={`summary-skeleton-${index}`}
                className="border-border/60 bg-background flex flex-col gap-2 rounded-md border p-3"
              >
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-6 w-12" />
                <Skeleton className="h-3 w-24" />
              </div>
            ))
          ) : (
            <>
              <SummaryCard
                label="Total members"
                value={summaryReady ? String(summary.total) : '—'}
                helper={
                  summaryReady
                    ? `${summary.active} active`
                    : needsCompanyContext
                      ? 'Choose a workspace to load team data.'
                      : 'Could not load team summary.'
                }
              />
              <SummaryCard
                label="Pending invites"
                value={summaryReady ? String(summary.invited) : '—'}
                helper={
                  summaryReady
                    ? 'Awaiting acceptance'
                    : needsCompanyContext
                      ? 'Choose a workspace to load team data.'
                      : 'Could not load team summary.'
                }
              />
              <SummaryCard
                label="Admins"
                value={summaryReady ? String(summary.admins) : '—'}
                helper={
                  summaryReady
                    ? 'Owner + admin roles'
                    : needsCompanyContext
                      ? 'Choose a workspace to load team data.'
                      : 'Could not load team summary.'
                }
              />
              <SummaryCard
                label="Pending access updates"
                value={summaryReady ? String(summary.invited) : '—'}
                helper={
                  summaryReady
                    ? 'Invites awaiting acceptance'
                    : needsCompanyContext
                      ? 'Choose a workspace to load team data.'
                      : 'Could not load team summary.'
                }
                className="lg:hidden xl:flex"
              />
            </>
          )}
        </div>
      </section>

      <section className="border-border/60 flex min-h-0 flex-1 flex-col gap-4 overflow-visible rounded-md border p-4 xl:overflow-hidden">
        {needsCompanyContext ? (
          <Alert>
            <AlertTitle>No workspace selected</AlertTitle>
            <AlertDescription>
              Choose a company in the workspace switcher to load team members.
            </AlertDescription>
          </Alert>
        ) : null}
        {isError ? (
          <Alert variant="destructive">
            <AlertTitle>Could not load team members</AlertTitle>
            <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span>
                {error instanceof Error
                  ? error.message
                  : 'Something went wrong.'}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-destructive/40 shrink-0"
                onClick={() => void refetch()}
              >
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="flex shrink-0 flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0 flex-1 pr-4">
            <h3 className="text-sm font-medium">Members</h3>
            <p className="text-muted-foreground hidden text-xs xl:block">
              Search members, review access, and prepare role updates.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row xl:w-auto xl:shrink-0 xl:items-center">
            <div className="relative w-full sm:min-w-[220px] sm:flex-1 xl:w-64 xl:min-w-[16rem] xl:flex-none">
              <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by name or email"
                className="h-8 pl-8 text-xs"
                disabled={needsCompanyContext}
              />
            </div>
            <div className="grid grid-cols-3 gap-2 sm:flex sm:gap-1.5">
              <Button
                type="button"
                size="sm"
                className="px-3"
                variant={statusFilter === 'all' ? 'default' : 'outline'}
                onClick={() => setStatusFilter('all')}
                disabled={needsCompanyContext}
              >
                All
              </Button>
              <Button
                type="button"
                size="sm"
                className="px-3"
                variant={statusFilter === 'active' ? 'default' : 'outline'}
                onClick={() => setStatusFilter('active')}
                disabled={needsCompanyContext}
              >
                Active
              </Button>
              <Button
                type="button"
                size="sm"
                className="px-3"
                variant={statusFilter === 'invited' ? 'default' : 'outline'}
                onClick={() => setStatusFilter('invited')}
                disabled={needsCompanyContext}
              >
                Invited
              </Button>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto xl:hidden">
          {needsCompanyContext ? (
            <div className="text-muted-foreground py-10 text-center text-sm">
              Select a workspace to see members here.
            </div>
          ) : showMemberRows && isLoading ? (
            Array.from({ length: 4 }).map((_, index) => (
              <div
                key={`mobile-skeleton-${index}`}
                className="border-border/60 rounded-md border p-3"
              >
                <div className="flex items-center gap-2">
                  <Skeleton className="size-9 rounded-full" />
                  <div className="space-y-1">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              </div>
            ))
          ) : showMemberRows && filteredMembers.length === 0 ? (
            <div className="border-border/60 rounded-md border p-8">
              <div className="flex flex-col items-center gap-2 text-center">
                <div className="bg-muted/70 rounded-full p-2">
                  <Users className="text-muted-foreground size-4" />
                </div>
                <p className="text-sm font-medium">No team members found</p>
                <p className="text-muted-foreground text-xs">
                  Adjust your filters or invite a new member.
                </p>
              </div>
            </div>
          ) : showMemberRows ? (
            filteredMembers.map((member) => (
              <article
                key={`mobile-${getTeamMemberRowKey(member)}`}
                className="border-border/60 rounded-md border p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Avatar className="size-9">
                      <AvatarFallback className="text-xs">
                        {getInitials(member.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {member.name}
                      </p>
                      <p className="text-muted-foreground truncate text-xs">
                        {member.email}
                      </p>
                    </div>
                  </div>
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        type="button"
                        disabled={!actionsEnabled}
                        title={
                          !actionsEnabled
                            ? 'Member actions will be available when connected.'
                            : undefined
                        }
                      >
                        <MoreHorizontal className="size-4" />
                        <span className="sr-only">Open member actions</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem disabled={!actionsEnabled}>
                        Edit role
                      </DropdownMenuItem>
                      <DropdownMenuItem disabled={!actionsEnabled}>
                        Assign clients
                      </DropdownMenuItem>
                      {member.status === 'invited' ? (
                        <DropdownMenuItem disabled={!actionsEnabled}>
                          Resend invite
                        </DropdownMenuItem>
                      ) : null}
                      <DropdownMenuItem
                        variant="destructive"
                        disabled={!actionsEnabled}
                      >
                        Remove member
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-muted/30 flex items-center gap-1.5 overflow-hidden rounded-md px-2.5 py-2">
                    <p className="text-muted-foreground shrink-0">Role</p>
                    <Badge variant="outline" className="ml-auto truncate">
                      {getRoleLabel(member.role)}
                    </Badge>
                  </div>
                  <div className="bg-muted/30 flex items-center gap-1.5 overflow-hidden rounded-md px-2.5 py-2">
                    <p className="text-muted-foreground shrink-0">Status</p>
                    <Badge
                      variant={getStatusBadgeVariant(member.status)}
                      className="ml-auto truncate"
                    >
                      {getStatusLabel(member.status)}
                    </Badge>
                  </div>
                  <div className="bg-muted/30 flex items-center gap-1.5 overflow-hidden rounded-md px-2.5 py-2">
                    <p className="text-muted-foreground shrink-0">Clients</p>
                    <p className="ml-auto truncate font-medium">
                      {member.assignedClientsCount}
                    </p>
                  </div>
                  <div className="bg-muted/30 flex items-center gap-1.5 overflow-hidden rounded-md px-2.5 py-2">
                    <p className="text-muted-foreground shrink-0">
                      Last active
                    </p>
                    <p className="ml-auto truncate font-medium">
                      {formatMemberActivityLabel(
                        member.status,
                        member.lastActiveAt,
                        member.inviteSentAt,
                      )}
                    </p>
                  </div>
                </div>
              </article>
            ))
          ) : null}
        </div>

        <div className="border-border/60 hidden min-h-0 flex-1 overflow-hidden rounded-md border xl:block">
          <div className="size-full overflow-x-auto overflow-y-auto">
            <Table className="min-w-[700px] table-fixed">
              <TableHeader className="bg-background/95 sticky top-0 z-10 backdrop-blur">
                <TableRow>
                  <TableHead className="w-[42%] pl-3">Member</TableHead>
                  <TableHead className="w-[13%]">Role</TableHead>
                  <TableHead className="w-[13%]">Status</TableHead>
                  <TableHead className="w-[10%]">Clients</TableHead>
                  <TableHead className="w-[14%]">Last active</TableHead>
                  <TableHead className="w-10 pr-3 text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {needsCompanyContext ? (
                  <TableRow>
                    <TableCell colSpan={6} className="p-8">
                      <p className="text-muted-foreground text-center text-sm">
                        Select a workspace to see members here.
                      </p>
                    </TableCell>
                  </TableRow>
                ) : showMemberRows && isLoading ? (
                  Array.from({ length: 4 }).map((_, index) => (
                    <TableRow key={`skeleton-${index}`}>
                      <TableCell className="pl-3">
                        <div className="flex items-center gap-2">
                          <Skeleton className="size-8 rounded-full" />
                          <div className="space-y-1">
                            <Skeleton className="h-3 w-24" />
                            <Skeleton className="h-3 w-36" />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-20" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-16" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-3 w-10" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-3 w-20" />
                      </TableCell>
                      <TableCell className="pr-3">
                        <Skeleton className="ml-auto h-7 w-7 rounded-md" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : showMemberRows && filteredMembers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="p-8">
                      <div className="flex flex-col items-center gap-2 text-center">
                        <div className="bg-muted/70 rounded-full p-2">
                          <Users className="text-muted-foreground size-4" />
                        </div>
                        <p className="text-sm font-medium">
                          No team members found
                        </p>
                        <p className="text-muted-foreground text-xs">
                          Adjust your filters or invite a new member.
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : showMemberRows ? (
                  filteredMembers.map((member) => (
                    <TableRow key={getTeamMemberRowKey(member)}>
                      <TableCell className="max-w-0 pl-3">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <Avatar className="size-8">
                            <AvatarFallback className="text-xs">
                              {getInitials(member.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">
                              {member.name}
                            </p>
                            <p className="text-muted-foreground truncate text-xs">
                              {member.email}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {getRoleLabel(member.role)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(member.status)}>
                          {getStatusLabel(member.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {member.assignedClientsCount}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {formatMemberActivityLabel(
                          member.status,
                          member.lastActiveAt,
                          member.inviteSentAt,
                        )}
                      </TableCell>
                      <TableCell className="pr-3 text-right">
                        <DropdownMenu modal={false}>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              type="button"
                              disabled={!actionsEnabled}
                              title={
                                !actionsEnabled
                                  ? 'Member actions will be available when connected.'
                                  : undefined
                              }
                            >
                              <MoreHorizontal className="size-4" />
                              <span className="sr-only">
                                Open member actions
                              </span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem disabled={!actionsEnabled}>
                              Edit role
                            </DropdownMenuItem>
                            <DropdownMenuItem disabled={!actionsEnabled}>
                              Assign clients
                            </DropdownMenuItem>
                            {member.status === 'invited' ? (
                              <DropdownMenuItem disabled={!actionsEnabled}>
                                Resend invite
                              </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuItem
                              variant="destructive"
                              disabled={!actionsEnabled}
                            >
                              Remove member
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                ) : null}
              </TableBody>
            </Table>
          </div>
        </div>
      </section>
    </div>
  );
}
