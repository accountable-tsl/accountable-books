/**
 * Single journal entry line editor. Renders either a card (mobile) or a table row (desktop/hybrid).
 * Used by JournalDetailPane to avoid duplicating ~500 lines of entry UI.
 */

import type { RefObject } from 'react';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { AutocompleteDropdown } from '@/components/AutocompleteDropdown';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Trash2, X } from 'lucide-react';

export type EditableLine = {
  id: string;
  description: string;
  side: 'debit' | 'credit';
  amount: number;
  coaId: string;
  coaCode: string;
  coaName: string;
  projectId: string | null;
  projectName: string | null;
};

export type JournalEntryLineProps = {
  variant: 'card' | 'row';
  line: EditableLine;
  updateLine: (lineId: string, updates: Partial<EditableLine>) => void;
  removeLine: (lineId: string) => void;
  coaItems: { value: string; label: string }[];
  projectItems?: { value: string; label: string }[];
  projectAsync?: boolean;
  onProjectSearchChange?: (query: string) => void;
  onProjectLoadMore?: () => void;
  projectIsLoading?: boolean;
  projectHasMore?: boolean;
  onAddProject?: () => void;
  showProjectColumn?: boolean;
  descriptionPlaceholder: string;
  canRemove: boolean;
  isDesktop?: boolean;
  amountCurrencyCode?: string;
  formatAmount?: (n: number) => string;
  lastEntryRef?: RefObject<HTMLDivElement | null>;
  isLastLine?: boolean;
};

const defaultFormatAmount = (n: number) => String(n);

function roundTo2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function sanitizeAmountText(text: string): string {
  // Allow digits and a single dot. Keep partial states like "." or "0.".
  const cleaned = text.replace(/[^\d.]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot === -1) return cleaned;
  return (
    cleaned.slice(0, firstDot + 1) +
    cleaned.slice(firstDot + 1).replace(/\./g, '')
  );
}

function parseAmountText(text: string): number | null {
  if (text === '' || text === '.') return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function JournalEntryLineInner(props: JournalEntryLineProps) {
  const {
    variant,
    line,
    updateLine,
    removeLine,
    coaItems,
    projectItems,
    projectAsync = false,
    onProjectSearchChange,
    onProjectLoadMore,
    projectIsLoading = false,
    projectHasMore = false,
    onAddProject,
    showProjectColumn = false,
    descriptionPlaceholder,
    canRemove,
    amountCurrencyCode = '',
    formatAmount = defaultFormatAmount,
    lastEntryRef,
    isLastLine,
  } = props;

  const hasProjectsUi =
    Boolean(onAddProject) ||
    Boolean(projectItems?.length) ||
    Boolean(line.projectId);

  const projectActionItems = hasProjectsUi
    ? [
        ...(line.projectId
          ? [
              {
                id: 'clear-project',
                label: 'Clear project',
                className: 'whitespace-nowrap',
              },
            ]
          : []),
        ...(onAddProject
          ? [
              {
                id: 'add-project',
                label: 'Add new project',
                className: 'whitespace-nowrap',
              },
            ]
          : []),
      ]
    : [];

  const commitProjectId = useCallback(
    (value: string) => {
      const nextId = value || null;
      const nextName =
        nextId && projectItems?.length
          ? (projectItems.find((p) => p.value === nextId)?.label ?? null)
          : null;

      updateLine(line.id, {
        projectId: nextId,
        projectName: nextName,
      });
    },
    [line.id, projectItems, updateLine],
  );

  const effectiveProjectItems = useMemo(() => {
    const items = projectItems ?? [];
    if (line.projectId && line.projectName) {
      // Ensure selected item label is always renderable even if the query
      // doesn't include the selected project in its current pages.
      if (!items.some((i) => i.value === line.projectId)) {
        return [{ value: line.projectId, label: line.projectName }, ...items];
      }
    }
    return items;
  }, [line.projectId, line.projectName, projectItems]);

  // Production-grade amount editing:
  // - While focused, we keep the user's text (e.g. "0.", ".", "00.5") without fighting the cursor.
  // - We still update numeric `line.amount` for totals/balance as the user types (best-effort).
  // - On blur, we commit a rounded 2dp value.
  const [amountText, setAmountText] = useState<string>('');
  const [isEditingAmount, setIsEditingAmount] = useState(false);
  const editingFieldRef = useRef<'single' | 'debit' | 'credit' | null>(null);
  const didEditRef = useRef(false);

  const beginAmountEdit = useCallback(
    (field: 'single' | 'debit' | 'credit') => {
      editingFieldRef.current = field;
      didEditRef.current = false;
      setIsEditingAmount(true);

      // Initialize with the current amount only when the visible field matches current side.
      const shouldSeed =
        field === 'single' ||
        (field === 'debit' && line.side === 'debit') ||
        (field === 'credit' && line.side === 'credit');

      setAmountText(
        shouldSeed ? (line.amount === 0 ? '' : String(line.amount)) : '',
      );
    },
    [line.amount, line.side],
  );

  const changeAmountText = useCallback(
    (field: 'single' | 'debit' | 'credit', raw: string) => {
      didEditRef.current = true;
      const next = sanitizeAmountText(raw);
      setAmountText(next);

      const parsed = parseAmountText(next);
      const amount = parsed ?? 0;

      if (field === 'debit') {
        updateLine(line.id, { side: 'debit', amount });
      } else if (field === 'credit') {
        updateLine(line.id, { side: 'credit', amount });
      } else {
        updateLine(line.id, { amount });
      }
    },
    [line.id, updateLine],
  );

  const commitAmountEdit = useCallback(
    (field: 'single' | 'debit' | 'credit') => {
      // For desktop split inputs, if the user focused but didn't change anything,
      // do not overwrite the amount/side with zero.
      if ((field === 'debit' || field === 'credit') && !didEditRef.current) {
        editingFieldRef.current = null;
        setIsEditingAmount(false);
        setAmountText('');
        return;
      }

      const parsed = parseAmountText(amountText);
      const amount = parsed == null ? 0 : roundTo2(parsed);

      if (field === 'debit') {
        updateLine(line.id, { side: 'debit', amount });
      } else if (field === 'credit') {
        updateLine(line.id, { side: 'credit', amount });
      } else {
        updateLine(line.id, { amount });
      }

      editingFieldRef.current = null;
      setIsEditingAmount(false);
      setAmountText('');
    },
    [amountText, line.id, updateLine],
  );

  if (variant === 'card') {
    const cardValue = isEditingAmount ? amountText : formatAmount(line.amount);
    return (
      <div
        ref={
          isLastLine && lastEntryRef
            ? (lastEntryRef as RefObject<HTMLDivElement>)
            : undefined
        }
        className="bg-card border-border relative flex flex-col gap-3 rounded-xl border p-5 shadow-sm"
      >
        <div className="absolute top-2 right-2">
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-7 w-7 rounded-full"
            disabled={!canRemove}
            onClick={() => removeLine(line.id)}
            aria-label="Remove entry"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="w-full min-w-0 pr-8">
          <AutocompleteDropdown
            value={line.coaId}
            items={coaItems}
            onValueChange={(value) => updateLine(line.id, { coaId: value })}
            placeholder="Select account"
            className="border-input focus:border-primary h-auto w-full rounded-none border-0 border-b bg-transparent !px-0 py-1.5 text-sm shadow-none focus-visible:ring-0 dark:bg-transparent [&>span]:text-sm [&>span]:font-normal"
          />
        </div>

        <div>
          <Input
            className="placeholder:text-muted-foreground/50 border-input focus:border-primary h-auto rounded-none border-0 border-b px-0 py-1 text-sm shadow-none focus-visible:ring-0 dark:bg-transparent"
            value={line.description}
            onChange={(event) =>
              updateLine(line.id, { description: event.target.value })
            }
            placeholder={descriptionPlaceholder}
            maxLength={500}
          />
        </div>

        {hasProjectsUi && (
          <div className="w-full min-w-0">
            <AutocompleteDropdown
              value={line.projectId ?? ''}
              items={effectiveProjectItems}
              onValueChange={commitProjectId}
              placeholder="Project (optional)"
              variant="ghost"
              className="border-input focus:border-primary h-auto w-full rounded-none border-0 border-b bg-transparent !px-0 py-1.5 text-sm shadow-none focus-visible:ring-0 dark:bg-transparent [&>span]:text-sm [&>span]:font-normal"
              async={projectAsync}
              onSearchChange={onProjectSearchChange}
              onLoadMore={onProjectLoadMore}
              isLoading={projectIsLoading}
              hasMore={projectHasMore}
              actionItems={projectActionItems}
              onAction={(actionId) => {
                if (actionId === 'clear-project') {
                  updateLine(line.id, { projectId: null, projectName: null });
                  return;
                }
                if (actionId === 'add-project') {
                  onAddProject?.();
                }
              }}
            />
          </div>
        )}

        <div className="mt-2 grid grid-cols-[120px_1fr] items-end gap-4">
          <div>
            <Label className="text-muted-foreground mb-1.5 block text-[10px] font-medium uppercase">
              Side
            </Label>
            <div className="bg-muted flex rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => updateLine(line.id, { side: 'debit' })}
                className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-all ${line.side === 'debit' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
              >
                Debit
              </button>
              <button
                type="button"
                onClick={() => updateLine(line.id, { side: 'credit' })}
                className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-all ${line.side === 'credit' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
              >
                Credit
              </button>
            </div>
          </div>
          <div>
            <Label className="text-muted-foreground mb-1 block text-right text-[10px] font-medium uppercase">
              Amount
            </Label>
            <div className="relative">
              <span className="text-muted-foreground absolute top-1/2 left-0 -translate-y-1/2 text-sm font-medium">
                {amountCurrencyCode}
              </span>
              <Input
                className="border-input focus:border-primary h-auto rounded-none border-0 border-b px-0 py-1 pl-10 text-right font-mono text-lg font-semibold shadow-none focus-visible:ring-0 dark:bg-transparent"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={cardValue}
                onFocus={() => beginAmountEdit('single')}
                onChange={(event) => {
                  changeAmountText('single', event.target.value);
                }}
                onBlur={() => commitAmountEdit('single')}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // variant === 'row' (desktop/hybrid)
  const { isDesktop = false } = props;
  const gridCols = isDesktop
    ? showProjectColumn
      ? 'grid-cols-[250px_1fr_180px_120px_120px_32px]'
      : 'grid-cols-[250px_1fr_120px_120px_32px]'
    : 'grid-cols-[160px_1fr_80px_120px_32px]';

  return (
    <div
      className={`group border-border/50 grid items-start gap-2 border-b px-3 py-2 last:border-0 ${gridCols}`}
    >
      <div>
        <AutocompleteDropdown
          value={line.coaId}
          items={coaItems}
          onValueChange={(value) => updateLine(line.id, { coaId: value })}
          placeholder="Select account..."
          className="h-8 w-full text-xs"
        />
      </div>

      <div>
        <div className="relative">
          <Input
            className={`h-8 text-xs ${
              hasProjectsUi && !showProjectColumn
                ? line.projectId
                  ? 'pr-[calc(50%+1rem)]'
                  : 'group-focus-within:pr-[calc(50%+1rem)] group-hover:pr-[calc(50%+1rem)]'
                : ''
            }`}
            value={line.description}
            onChange={(event) =>
              updateLine(line.id, { description: event.target.value })
            }
            placeholder={descriptionPlaceholder}
            maxLength={500}
          />

          {hasProjectsUi && !showProjectColumn && (
            <div
              className={`absolute top-1/2 right-1 flex max-w-[50%] -translate-y-1/2 justify-end transition-opacity ${
                line.projectId
                  ? 'opacity-100'
                  : 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100'
              }`}
            >
              <AutocompleteDropdown
                value={line.projectId ?? ''}
                items={effectiveProjectItems}
                onValueChange={commitProjectId}
                placeholder="Project"
                variant="ghost"
                chevron="down"
                className="bg-muted/30 hover:bg-muted/50 h-7 w-full justify-start gap-1 truncate rounded-full px-2 text-[11px] font-medium shadow-none"
                async={projectAsync}
                onSearchChange={onProjectSearchChange}
                onLoadMore={onProjectLoadMore}
                isLoading={projectIsLoading}
                hasMore={projectHasMore}
                actionItems={projectActionItems}
                onAction={(actionId) => {
                  if (actionId === 'clear-project') {
                    updateLine(line.id, { projectId: null, projectName: null });
                    return;
                  }
                  if (actionId === 'add-project') {
                    onAddProject?.();
                  }
                }}
              />
            </div>
          )}
        </div>
      </div>

      {isDesktop && showProjectColumn && (
        <div>
          <AutocompleteDropdown
            value={line.projectId ?? ''}
            items={effectiveProjectItems}
            onValueChange={commitProjectId}
            placeholder="Project"
            className="h-8 w-full text-xs"
            async={projectAsync}
            onSearchChange={onProjectSearchChange}
            onLoadMore={onProjectLoadMore}
            isLoading={projectIsLoading}
            hasMore={projectHasMore}
            actionItems={projectActionItems}
            onAction={(actionId) => {
              if (actionId === 'clear-project') {
                updateLine(line.id, { projectId: null, projectName: null });
                return;
              }
              if (actionId === 'add-project') {
                onAddProject?.();
              }
            }}
          />
        </div>
      )}

      {isDesktop ? (
        <>
          <div>
            <Input
              className="h-8 text-right font-mono text-xs"
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={
                isEditingAmount && editingFieldRef.current === 'debit'
                  ? amountText
                  : line.side === 'debit'
                    ? line.amount === 0
                      ? ''
                      : formatAmount(line.amount)
                    : ''
              }
              onFocus={() => beginAmountEdit('debit')}
              onChange={(event) => {
                changeAmountText('debit', event.target.value);
              }}
              onBlur={() => commitAmountEdit('debit')}
            />
          </div>
          <div>
            <Input
              className="h-8 text-right font-mono text-xs"
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={
                isEditingAmount && editingFieldRef.current === 'credit'
                  ? amountText
                  : line.side === 'credit'
                    ? line.amount === 0
                      ? ''
                      : formatAmount(line.amount)
                    : ''
              }
              onFocus={() => beginAmountEdit('credit')}
              onChange={(event) => {
                changeAmountText('credit', event.target.value);
              }}
              onBlur={() => commitAmountEdit('credit')}
            />
          </div>
        </>
      ) : (
        <>
          <div className="bg-muted flex h-8 items-center rounded-md p-1">
            <button
              type="button"
              onClick={() => updateLine(line.id, { side: 'debit' })}
              className={`h-full flex-1 rounded-[4px] text-[10px] font-medium transition-all ${line.side === 'debit' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Dr
            </button>
            <button
              type="button"
              onClick={() => updateLine(line.id, { side: 'credit' })}
              className={`h-full flex-1 rounded-[4px] text-[10px] font-medium transition-all ${line.side === 'credit' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Cr
            </button>
          </div>
          <div>
            <Input
              className="h-8 text-right font-mono text-xs"
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={
                isEditingAmount
                  ? amountText
                  : line.amount === 0
                    ? ''
                    : formatAmount(line.amount)
              }
              onFocus={() => beginAmountEdit('single')}
              onChange={(event) => {
                changeAmountText('single', event.target.value);
              }}
              onBlur={() => commitAmountEdit('single')}
            />
          </div>
        </>
      )}

      <div className="flex justify-center">
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-destructive h-7 w-7"
          disabled={!canRemove}
          onClick={() => removeLine(line.id)}
          aria-label="Remove entry"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export const JournalEntryLine = memo(JournalEntryLineInner);
