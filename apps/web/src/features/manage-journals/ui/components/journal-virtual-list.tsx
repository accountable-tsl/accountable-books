import type { JournalListRow } from '@accountable-books/contracts/schema';
import { useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

import { JournalListItem } from './journal-list-item';

export function JournalVirtualList({
  journals,
  selectedJournalId,
  onSelect,
  onReachEnd,
  hasNextPage,
  isFetchingNextPage,
}: {
  journals: JournalListRow[];
  selectedJournalId: string | null;
  onSelect: (journal: JournalListRow) => void;
  onReachEnd: () => void | Promise<void>;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const fetchLockRef = useRef(false);
  const rowHeight = 60;
  const thresholdRows = 18;
  const virtualizationThreshold = 120;

  const shouldVirtualize = journals.length > virtualizationThreshold;

  const virtualizer = useVirtualizer({
    count: journals.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
  });

  const virtualItems = virtualizer.getVirtualItems();

  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage || journals.length === 0) return;
    if (fetchLockRef.current) return;

    const lastVirtual = virtualItems[virtualItems.length - 1];
    if (!lastVirtual) return;

    if (lastVirtual.index >= journals.length - 1 - thresholdRows) {
      fetchLockRef.current = true;
      Promise.resolve()
        .then(() => onReachEnd())
        .finally(() => {
          fetchLockRef.current = false;
        });
    }
  }, [
    hasNextPage,
    isFetchingNextPage,
    journals.length,
    onReachEnd,
    virtualItems,
  ]);

  return (
    <div ref={scrollRef} className="h-full overflow-auto">
      {shouldVirtualize ? (
        <div
          className="relative w-full"
          style={{ height: `${virtualizer.getTotalSize()}px` }}
        >
          {virtualItems.map((virtualRow) => {
            const journal = journals[virtualRow.index];
            if (!journal) return null;

            return (
              <div
                key={journal.id}
                className="absolute top-0 left-0 w-full"
                style={{
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <JournalListItem
                  journal={journal}
                  selected={selectedJournalId === journal.id}
                  onClick={() => onSelect(journal)}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="w-full">
          {journals.map((journal) => (
            <JournalListItem
              key={journal.id}
              journal={journal}
              selected={selectedJournalId === journal.id}
              onClick={() => onSelect(journal)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
