import type { GroupedTransaction } from '@modules/accounting/categorization';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Edit,
  Eye,
  Landmark,
  Lightbulb,
  Split,
} from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';

import { FormattedAmount } from '@/components/FormattedAmount';
import { TooltipHelper } from '@/components/TooltipHelper';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { safeFormatDate } from '@/shared/utils/formatting-utils';

import { accordionItems } from '../cat-engine';
import {
  DEFAULT_ACCOUNT_TEXT,
  DEFAULT_CURRENCY,
  DEFAULT_EMPTY_VALUE,
  DEFAULT_FALLBACK_TEXT,
  DESCRIPTION_TRUNCATE_LENGTH,
  TOOLTIPS,
} from '../constants';
import type { CatEngineTxnViewProps } from '../types';
import { ErrorBoundary } from './error-boundary';
import { LoadingState, TransactionSkeleton } from './loading-state';

// Main component
export function CatEngineTxnView({
  transactionGroup,
  accordionItemId,
  className,
  onEdit = () => {},
  onAccept = () => {},
  onMarkReviewed = () => {},
  isLoading = false,
  error = null,
}: CatEngineTxnViewProps) {
  // Centralized curr calculation - computed once and memoized
  const curr = useMemo(
    () =>
      accordionItems.find((item) => item.id === accordionItemId) ||
      accordionItems[0],
    [accordionItemId],
  );

  // Determine if transaction is high confidence based on actual data
  const isHighConfidence = useMemo(() => {
    if (!transactionGroup) return false;
    const firstLine = transactionGroup.lines[0];
    return (firstLine.confidence || 0) >= 0.9;
  }, [transactionGroup]);

  // Show loading state
  if (isLoading) {
    return (
      <div
        className={cn(
          'scale-in-hor-right flex h-full flex-col gap-4 overflow-clip rounded-md border',
          curr.borderClass || '',
          className,
        )}
      >
        <TransactionHeader
          title="Transaction Details"
          badge={curr.title}
          backgroundClass={curr.backgroundClass}
        />
        <TransactionSkeleton />
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div
        className={cn(
          'scale-in-hor-right flex h-full flex-col gap-4 overflow-clip rounded-md border',
          curr.borderClass || '',
          className,
        )}
      >
        <TransactionHeader
          title="Transaction Details"
          badge={curr.title}
          backgroundClass={curr.backgroundClass}
        />
        <Alert variant="destructive" className="m-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {error}
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.location.reload()}
              className="mt-2"
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Show empty state if no transaction selected
  if (!transactionGroup) {
    return (
      <div
        className={cn(
          'scale-in-hor-right flex h-full flex-col gap-4 overflow-clip rounded-md border',
          curr.borderClass || '',
          className,
        )}
      >
        <TransactionHeader
          title="Transaction Details"
          badge={curr.title}
          backgroundClass={curr.backgroundClass}
        />
        <div className="flex flex-1 items-center justify-center p-4">
          <div className="text-muted-foreground text-center text-sm">
            Select a transaction to view details
          </div>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div
        className={cn(
          'scale-in-hor-right flex h-full min-h-0 flex-col gap-4 overflow-clip rounded-md border',
          curr.borderClass || '',
          className,
        )}
        role="region"
        aria-label="Transaction details"
      >
        <TransactionHeader
          title="Transaction Details"
          badge={curr.title}
          backgroundClass={curr.backgroundClass}
        />

        <TransactionView
          transactionGroup={transactionGroup}
          curr={curr}
          isHighConfidence={isHighConfidence}
          onEdit={onEdit}
          onAccept={onAccept}
          onMarkReviewed={onMarkReviewed}
        />
      </div>
    </ErrorBoundary>
  );
}

// Transaction View Component - handles the display mode
const TransactionView = memo(
  ({
    transactionGroup,
    curr,
    isHighConfidence,
    onEdit,
    onAccept,
    onMarkReviewed,
  }: {
    transactionGroup: GroupedTransaction;
    curr: any;
    isHighConfidence: boolean;
    onEdit: () => void;
    onAccept: () => void;
    onMarkReviewed: () => void;
  }) => {
    const firstLine = transactionGroup.lines[0];
    const isSplit = transactionGroup.summary.isSplit;

    return (
      <div className="flex h-full min-h-0 flex-col gap-4">
        <div className="scrollbar-thin-2px flex-1 space-y-8 divide-y overflow-y-auto">
          {/* Transaction Details Section */}
          <div className="grid grid-cols-2 items-center gap-4 overflow-clip p-4 pt-0">
            <div className="col-span-2 flex items-center justify-between gap-4">
              <AmountDisplay
                amount={transactionGroup.bank_amount}
                currency={transactionGroup.bank_currency_code}
              />
              <BankLogo bankName={transactionGroup.bank_currency_code} />
            </div>
            <DateField
              label="Date"
              date={transactionGroup.date}
              tooltip={TOOLTIPS.BANK_TRANSACTION_DATE}
            />
            <DateField
              label="FS Date"
              date={transactionGroup.fs_date}
              tooltip={TOOLTIPS.FS_DATE}
            />
            <div className="col-span-2">
              <TooltipHelper
                content={TOOLTIPS.DESCRIPTION}
                contentStyle="w-fit"
                icon={false}
                trigger={
                  <div className="text-muted-foreground truncate text-xs">
                    Description
                  </div>
                }
                triggerWrapperClassName="w-fit"
              />
              <TruncatedText text={firstLine.description} />
            </div>
            <div>
              <div className="text-muted-foreground truncate text-xs">
                Contact
              </div>
              <TruncatedText
                text={firstLine.contact_name}
                fallback={DEFAULT_EMPTY_VALUE}
              />
            </div>
            <div>
              <div className="text-muted-foreground truncate text-xs">
                Reference
              </div>
              <TruncatedText
                text={firstLine.reference}
                fallback={DEFAULT_EMPTY_VALUE}
              />
            </div>
          </div>

          {/* Split Indicator */}
          {isSplit && (
            <div className="px-4 pb-2">
              <Badge variant="outline" className="text-xs">
                <Split className="mr-1 h-3 w-3" />
                Split Transaction ({transactionGroup.summary.splitCount} lines)
              </Badge>
            </div>
          )}

          {/* Category and Explanation Section */}
          <div className="space-y-2 px-4 pb-6">
            {isSplit ? (
              <div className="flex flex-col gap-1">
                <div className="text-muted-foreground text-xs">
                  {curr.id === 'reviewed' ? 'Accounts' : 'Predicted Categories'}
                </div>
                <div className="space-y-2">
                  {transactionGroup.lines.map((line, index) => (
                    <div
                      key={line.id || index}
                      className={cn(
                        'flex items-center gap-1 rounded border p-1 px-2',
                        curr.borderClass || '',
                      )}
                    >
                      <div className="flex-1 truncate">
                        {line.coa_name || DEFAULT_ACCOUNT_TEXT}
                      </div>
                      {line.confidence !== null && (
                        <div
                          className={cn(
                            'flex items-center justify-center rounded-xl px-2 text-sm',
                            curr.backgroundClass,
                            curr.textClass,
                          )}
                        >
                          {Math.round(line.confidence * 100)}%
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <CategoryDisplay
                account={transactionGroup.summary.primaryAccountName}
                confidence={firstLine.confidence}
                curr={curr}
              />
            )}
            <ExplanationSection explanation={firstLine.explanation} />
          </div>

          {/* Journal Entries Section */}
          <JournalEntriesSection transactionGroup={transactionGroup} />
        </div>

        {/* Action Buttons - centralized at bottom */}
        <TransactionActions
          isHighConfidence={isHighConfidence}
          onEdit={onEdit}
          onAccept={onAccept}
          onMarkReviewed={onMarkReviewed}
        />
      </div>
    );
  },
);

// Journal Entries Section - Updated to show all lines for splits
const JournalEntriesSection = memo(
  ({ transactionGroup }: { transactionGroup: GroupedTransaction }) => {
    const isSplit = transactionGroup.summary.isSplit;

    return (
      <div className="px-4">
        <div className="mb-2 flex items-center justify-between text-sm">
          <div className="text-muted-foreground">Entries</div>
          {isSplit && (
            <div className="text-muted-foreground flex items-center gap-1">
              <Split className="h-3 w-3" />
              <span className="text-xs">Split</span>
            </div>
          )}
        </div>
        <div className="divide-y rounded border p-1 px-2">
          {/* Bank Leg */}
          <div className="grid grid-cols-[2fr_1fr_2fr] p-1 text-sm">
            <div className="truncate font-medium">Bank Account</div>
            <div className="truncate">
              {transactionGroup.bank_amount > 0 ? 'Debit' : 'Credit'}
            </div>
            <FormattedAmount
              amount={Math.abs(transactionGroup.bank_amount)}
              currency={transactionGroup.bank_currency_code}
              showSymbol
              accountingNegatives={false}
              className="truncate text-right"
            />
          </div>

          {/* Non-Bank Legs */}
          {transactionGroup.lines.map((line, index) => {
            const isDebit = line.reporting_amount > 0;
            return (
              <div
                key={line.id || index}
                className="grid grid-cols-[2fr_1fr_2fr] p-1 text-sm"
              >
                <div className="truncate">
                  {line.coa_name || DEFAULT_ACCOUNT_TEXT}
                </div>
                <div className="truncate">{isDebit ? 'Debit' : 'Credit'}</div>
                <FormattedAmount
                  amount={Math.abs(line.reporting_amount)}
                  currency={transactionGroup.bank_currency_code}
                  showSymbol
                  accountingNegatives={false}
                  className="truncate text-right"
                />
              </div>
            );
          })}
        </div>

        {/* Totals */}
        <div className="text-muted-foreground mt-2 grid grid-cols-[2fr_1fr_2fr] border-t p-1 px-3 text-sm">
          <div className="truncate">Net Total</div>
          <div className="truncate">-</div>
          <FormattedAmount
            amount={0}
            currency={transactionGroup.bank_currency_code}
            showSymbol
            accountingNegatives={false}
            className="truncate text-right"
          />
        </div>
      </div>
    );
  },
);

// Transaction Actions Component
const TransactionActions = memo(
  ({
    isHighConfidence,
    onEdit,
    onAccept,
    onMarkReviewed,
  }: {
    isHighConfidence: boolean;
    onEdit: () => void;
    onAccept: () => void;
    onMarkReviewed: () => void;
  }) => (
    <div className="flex flex-col gap-2 px-4 pb-4">
      <div className="flex gap-4">
        <Button
          variant="outline"
          className="flex flex-1 items-center"
          onClick={onEdit}
        >
          <Edit className="mr-2 h-4 w-4" /> Edit
        </Button>
        <Button variant="outline" className="flex flex-1 items-center">
          <Split className="mr-2 h-4 w-4" /> Split
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        {!isHighConfidence && (
          <Button variant="outline" onClick={onAccept}>
            <Check className="mr-2 h-4 w-4" /> Accept Category
          </Button>
        )}
        {isHighConfidence && (
          <Button variant="outline" onClick={onMarkReviewed}>
            <Eye className="mr-2 h-4 w-4" /> Mark as Reviewed
          </Button>
        )}
      </div>
    </div>
  ),
);

// Simplified Header Component
const TransactionHeader = memo(
  ({
    title,
    badge,
    backgroundClass,
  }: {
    title: string;
    badge: string;
    backgroundClass: string;
  }) => (
    <div
      className={cn(
        'flex h-10 min-h-10 items-center justify-between border-b px-4 py-1',
        backgroundClass,
      )}
    >
      <div>{title}</div>
      <div className="flex items-center gap-2">
        <Badge variant="outline">{badge}</Badge>
      </div>
    </div>
  ),
);

// Sub-components for better modularity
const AmountDisplay = memo(
  ({
    amount,
    currency = DEFAULT_CURRENCY,
  }: {
    amount: number;
    currency?: string;
  }) => (
    <div>
      <div className="text-muted-foreground truncate text-xs">Amount</div>
      <FormattedAmount
        amount={amount}
        currency={currency}
        showSymbol
        accountingNegatives={false}
        className={cn(
          'truncate text-xl font-bold',
          amount < 0
            ? 'text-red-600 dark:text-red-500'
            : amount > 0
              ? 'text-green-700 dark:text-green-500'
              : '',
        )}
      />
    </div>
  ),
);

const BankLogo = memo(({ bankName }: { bankName?: string }) => (
  <TooltipHelper
    icon={false}
    content={bankName || TOOLTIPS.BANK_LOGO}
    contentStyle="w-fit"
    trigger={
      <div
        className="bg-muted flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border"
        role="img"
        aria-label={`${bankName || TOOLTIPS.BANK_LOGO} logo`}
      >
        <Landmark className="h-4 w-4" />
      </div>
    }
  />
));

const DateField = memo(
  ({
    label,
    date,
    tooltip,
  }: {
    label: string;
    date: Date;
    tooltip: string;
  }) => (
    <div>
      <TooltipHelper
        content={tooltip}
        contentStyle="w-fit"
        icon={false}
        trigger={
          <div className="text-muted-foreground truncate text-xs">{label}</div>
        }
        triggerWrapperClassName="w-fit"
      />
      <div className="truncate text-[0.9rem]">
        {safeFormatDate({
          date,
          formatString: 'dd MMM yyyy',
        })}
      </div>
    </div>
  ),
);

const TruncatedText = memo(
  ({
    text,
    maxLength = DESCRIPTION_TRUNCATE_LENGTH,
    fallback = DEFAULT_FALLBACK_TEXT,
  }: {
    text?: string | null;
    maxLength?: number;
    fallback?: string;
  }) => {
    const displayText = text || fallback;
    const shouldTruncate = displayText.length > maxLength;

    const content = (
      <div
        className={cn(
          'truncate text-[0.9rem]',
          text ? '' : 'text-muted-foreground',
        )}
      >
        {displayText}
      </div>
    );

    if (shouldTruncate) {
      return (
        <TooltipHelper content={text || ''} icon={false} trigger={content} />
      );
    }

    return content;
  },
);

const CategoryDisplay = memo(
  ({
    account,
    confidence,
    curr,
  }: {
    account: string | null;
    confidence: number | null;
    curr: any;
  }) => {
    const confidencePercent = confidence
      ? `${Math.round(confidence * 100)}%`
      : null;

    return (
      <div className="flex flex-col gap-1">
        <div className="text-muted-foreground text-xs">
          {curr.id === 'reviewed' ? 'Account' : 'Predicted Category'}
        </div>
        <div
          className={cn(
            'flex items-center gap-1 rounded border p-1 px-2',
            curr.borderClass || '',
          )}
        >
          <div className="truncate">{account || DEFAULT_ACCOUNT_TEXT}</div>
          {confidencePercent && (
            <div
              className={cn(
                'flex items-center justify-center rounded-xl px-2 text-sm',
                curr.backgroundClass,
                curr.textClass,
              )}
            >
              {confidencePercent}
            </div>
          )}
        </div>
      </div>
    );
  },
);

const ExplanationSection = memo(
  ({ explanation }: { explanation?: string | null }) => {
    const [showExplanation, setShowExplanation] = useState(false);

    if (!explanation) return null;

    return (
      <div
        className={cn(
          'flex flex-col gap-1 rounded px-2 transition-all duration-300 ease-in-out',
          showExplanation ? 'border p-2' : '',
        )}
      >
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground flex cursor-pointer items-center text-xs hover:underline"
          onClick={() => setShowExplanation(!showExplanation)}
          aria-expanded={showExplanation}
          aria-controls="explanation-content"
        >
          <Lightbulb className="inline-flex h-3 w-3" />
          <span>Explanation</span>
          <ChevronDown
            className={cn(
              'inline-flex h-4 w-4 transition-transform duration-200',
              showExplanation && 'rotate-180',
            )}
          />
        </button>

        <div
          className={cn(
            'overflow-hidden transition-all duration-300 ease-in-out',
            showExplanation ? 'max-h-20 opacity-100' : 'max-h-0 opacity-0',
          )}
        >
          <div id="explanation-content" className="overflow-y-auto text-sm">
            {explanation}
          </div>
        </div>
      </div>
    );
  },
);

// Export sub-components for potential reuse
export {
  AmountDisplay,
  BankLogo,
  CategoryDisplay,
  DateField,
  ErrorBoundary,
  ExplanationSection,
  JournalEntriesSection,
  LoadingState,
  TransactionActions,
  TransactionHeader,
  TransactionSkeleton,
  TransactionView,
  TruncatedText,
};
