import type { CustomTable } from '@/components/data-table/types/data-table';
import type {
  CoaLifecycleOperation,
  CoaLifecyclePreflightResponse,
  CoaResponse,
} from '@/modules/accounting/chart-of-accounts';
import type { Row } from '@tanstack/react-table';
import { useCallback, useMemo, useState } from 'react';
import {
  DataTableActionBar,
  DataTableActionBarAction,
  DataTableActionBarSelection,
} from '@/components/data-table/action-bar/data-table-action-bar';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  analyzeSelectedAccounts,
  useExecuteCoaLifecycle,
  usePreflightCoaLifecycle,
} from '@/modules/accounting/chart-of-accounts';
import { Archive, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { CoaLifecycleDialog } from './coa-lifecycle-dialog';

// TODO: BULK EXPORT

interface CoaActionBarProps {
  companyId: string;
  table: CustomTable<CoaResponse>;
  className?: string;
}
export function CoaActionBar({
  table,
  className,
  companyId,
}: CoaActionBarProps) {
  const preflightMutation = usePreflightCoaLifecycle();
  const executeMutation = useExecuteCoaLifecycle();
  const [preflight, setPreflight] =
    useState<CoaLifecyclePreflightResponse | null>(null);

  const rows = table.getFilteredSelectedRowModel().rows;
  const originalRows = useMemo(
    () => rows.map((r: Row<CoaResponse>) => r.original),
    [rows],
  );

  const selectedRowsIds = useMemo(
    () => originalRows.map((row) => row.id),
    [originalRows],
  );
  const allAccounts = useMemo(
    () => table.getCoreRowModel().rows.map((row) => row.original),
    [table],
  );

  const {
    canArchive,
    canDelete,
    canExport: _canExport,
    summary,
  } = analyzeSelectedAccounts(originalRows);
  const { total, locked, archived } = summary;

  const parts = [
    `${total} selected`,
    locked > 0 && `${locked} locked`,
    archived > 0 && `${archived} archived`,
  ].filter(Boolean);
  const meta = parts.join(' | ');

  const startLifecycle = useCallback(
    (operation: CoaLifecycleOperation) => {
      if (rows.length === 0) return;
      preflightMutation.mutate(
        {
          companyId,
          operation,
          accountIds: selectedRowsIds,
        },
        {
          onSuccess: (result) => {
            if (!result.success || !result.data) {
              toast.error(result.message);
              return;
            }
            setPreflight(result.data);
          },
          onError: () => toast.error('Unable to inspect account references'),
        },
      );
    },
    [companyId, preflightMutation, rows.length, selectedRowsIds],
  );

  const onTaskDelete = useCallback(() => {
    if (!canDelete) return;
    startLifecycle('delete');
  }, [canDelete, startLifecycle]);

  const onTaskArchive = useCallback(() => {
    if (!canArchive) return;
    startLifecycle('archive');
  }, [canArchive, startLifecycle]);

  const executeLifecycle = useCallback(
    ({
      resolutions,
      acknowledgeUnresolvedArchiveReferences,
    }: Parameters<typeof CoaLifecycleDialog>[0]['onConfirm'] extends (
      input: infer T,
    ) => void
      ? T
      : never) => {
      if (!preflight) return;
      executeMutation.mutate(
        {
          companyId,
          data: {
            operation: preflight.operation,
            accountIds: selectedRowsIds,
            impactFingerprint: preflight.impactFingerprint,
            resolutions,
            acknowledgeUnresolvedArchiveReferences,
          },
        },
        {
          onSuccess: (result) => {
            if (!result.success) {
              toast.error(result.message);
              return;
            }
            toast.success(
              `Successfully ${preflight.operation === 'archive' ? 'archived' : 'deleted'} ${selectedRowsIds.length} account${
                selectedRowsIds.length > 1 ? 's' : ''
              }`,
            );
            setPreflight(null);
            table.resetRowSelection();
          },
          onError: () => toast.error('Failed to update accounts'),
        },
      );
    },
    [companyId, executeMutation, preflight, selectedRowsIds, table],
  );

  return (
    <>
      <DataTableActionBar
        table={table}
        visible={rows.length > 0}
        className={cn('', className)}
      >
        <DataTableActionBarSelection table={table} />
        <Separator
          orientation="vertical"
          className="hidden data-[orientation=vertical]:h-5 sm:block"
        />

        {canArchive && onTaskArchive && (
          <DataTableActionBarAction
            size="icon"
            tooltip="Archive accounts"
            onClick={onTaskArchive}
          >
            <Archive />
          </DataTableActionBarAction>
        )}

        {/* Delete */}
        {canDelete && onTaskDelete && (
          <DataTableActionBarAction
            size="icon"
            tooltip="Delete accounts"
            onClick={onTaskDelete}
          >
            <Trash2 />
          </DataTableActionBarAction>
        )}

        {/* Export */}
        {/* {canExport && onTaskExport && (
        <DataTableActionBarAction
          size="icon"
          tooltip="Export accounts"
          // isPending={getIsActionPending("export")}
          onClick={onTaskExport}
        >
          <Download />
        </DataTableActionBarAction>
      )} */}

        <DataTableActionBarAction
          size="sm"
          className="border text-sm font-light"
        >
          {meta}
        </DataTableActionBarAction>
      </DataTableActionBar>
      <CoaLifecycleDialog
        open={!!preflight}
        preflight={preflight}
        accounts={allAccounts}
        pending={executeMutation.isPending}
        onOpenChange={(open) => {
          if (!open) setPreflight(null);
        }}
        onConfirm={executeLifecycle}
      />
    </>
  );
}
