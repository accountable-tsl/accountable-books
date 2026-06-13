import type { GetJournalResponse } from '@accountable-books/contracts/schema';
import { useMemo } from 'react';
import { CenteredLoader } from '@/components/CenteredLoader';
import ErrorPage from '@/components/ErrorPage';
import { FormattedAmount } from '@/components/FormattedAmount';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useJournal } from '@/modules/accounting/journals';

import { getJournalStatusBadgeVariant } from '../lib/journal-ui';

export function JournalViewerSheet({
  companyId,
  journalId,
  open,
  onOpenChange,
  mockDetail,
}: {
  companyId: string;
  journalId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mockDetail?: GetJournalResponse | null;
}) {
  const query = useJournal({
    companyId,
    journalId: journalId ?? '',
    includeFiles: true,
    enabled: open && !!journalId && !mockDetail,
  });

  const detail = useMemo(() => {
    if (mockDetail) return mockDetail;
    return query.data ?? null;
  }, [mockDetail, query.data]);

  const journal = detail?.journal ?? null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <span className="truncate">{journal?.title ?? 'Journal'}</span>
            {journal?.status && (
              <Badge variant={getJournalStatusBadgeVariant(journal.status)}>
                {journal.status}
              </Badge>
            )}
          </SheetTitle>
          <SheetDescription>
            {journal?.systemReference ? `${journal.systemReference} • ` : ''}
            {journal?.date ?? ''}
          </SheetDescription>
        </SheetHeader>

        {!mockDetail && query.isLoading && <CenteredLoader />}
        {!mockDetail && query.isError && <ErrorPage type="default" />}

        {journal && (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-4 pb-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-muted-foreground text-xs">Currency</div>
                <div className="text-sm">{journal.currencyCode}</div>
              </div>
              <div className="text-right">
                <div className="text-muted-foreground text-xs">Total</div>
                <div className="text-sm tabular-nums">
                  <FormattedAmount
                    amount={journal.totalDebit}
                    currency={journal.currencyCode}
                    showSymbol
                  />
                </div>
              </div>
            </div>

            <div>
              <div className="text-muted-foreground text-xs">Entries</div>
              <div className="mt-2 flex flex-col gap-2">
                {(detail?.entries ?? []).map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center justify-between gap-3 rounded-md border p-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm">{e.description}</div>
                      <div className="text-muted-foreground truncate text-xs">
                        {e.coaCode} • {e.coaName}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="outline">{e.side}</Badge>
                      <div className="text-sm tabular-nums">
                        <FormattedAmount
                          amount={e.amount}
                          currency={journal.currencyCode}
                          showSymbol
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
