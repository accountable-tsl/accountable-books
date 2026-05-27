import { memo, useCallback, useMemo, useState } from 'react';
import { FormattedAmount } from '@/components/FormattedAmount';
import { TooltipHelper } from '@/components/TooltipHelper';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { accordionItems } from '@/domains-pending-migration/cat-engine/cat-engine';
import { cn } from '@/lib/utils';
import { safeFormatDate } from '@/shared/utils/formatting-utils';
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

import {
  DEFAULT_ACCOUNT_TEXT,
  DEFAULT_CURRENCY,
  DEFAULT_EMPTY_VALUE,
  DEFAULT_FALLBACK_TEXT,
  DESCRIPTION_TRUNCATE_LENGTH,
  TOOLTIPS,
} from '../constants';
import { useTransactionForm } from '../hooks/use-transaction-form';
import {
  type CatEngineTxnViewProps,
  type TransactionData,
  type TransactionFormData,
} from '../types';
import { ErrorBoundary } from './error-boundary';
import { LoadingState, TransactionSkeleton } from './loading-state';

// Main component
export function CatEngineTxnView({
  transaction,
  accordionItemId,
  className,
  onEdit = () => {},
  onAccept = () => {},
  onMarkReviewed = () => {},
  // isEditable = false,
  isLoading = false,
  error = null,
}: CatEngineTxnViewProps) {
  const [isEditMode, setIsEditMode] = useState(false);

  // Use default data if no transaction provided (for development/scaffolding)
  const defaultTransaction: TransactionData = {
    id: 'default',
    amount: 100000000000,
    description: 'This is a description',
    payee: 'Payee Sample',
    project: 'Project Sample',
    bankLogo: 'https://cdn-icons-png.flaticon.com/512/25/25231.png',
    bankName: 'Bank Name',
    account: 'IT Software and Consumables',
    confidence: 0.95,
    explanation:
      'This is an explanation for why this transaction is categorized as whatever it is categorized as right now',
    date: new Date(),
    fsDate: new Date(),
    currency: 'USD',
  };

  const tx = transaction || defaultTransaction;

  // Centralized curr calculation - computed once and memoized
  const curr = useMemo(
    () =>
      accordionItems.find((item) => item.id === accordionItemId) ||
      accordionItems[0],
    [accordionItemId],
  );

  // Determine if transaction is high confidence based on actual data
  const isHighConfidence = useMemo(
    () => (tx.confidence || 0) >= 0.9,
    [tx.confidence],
  );

  // Handle edit mode toggle
  const handleEdit = useCallback(() => {
    setIsEditMode(true);
    onEdit?.();
  }, [onEdit]);

  // Handle form submission
  const handleFormSubmit = useCallback(async (data: TransactionFormData) => {
    console.log('Form submitted:', data);
    // Here you would typically update the transaction data
    // and call an API to save the changes
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsEditMode(false);
  }, []);

  // Handle form cancellation
  const handleFormCancel = useCallback(() => {
    setIsEditMode(false);
  }, []);

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

        {isEditMode ? (
          <TransactionForm
            transaction={tx}
            onSubmit={handleFormSubmit}
            onCancel={handleFormCancel}
            error={error}
          />
        ) : (
          <TransactionView
            transaction={tx}
            curr={curr}
            isHighConfidence={isHighConfidence}
            onEdit={handleEdit}
            onAccept={onAccept}
            onMarkReviewed={onMarkReviewed}
          />
        )}
      </div>
    </ErrorBoundary>
  );
}

// Transaction View Component - handles the display mode
const TransactionView = memo(
  ({
    transaction,
    curr,
    isHighConfidence,
    onEdit,
    onAccept,
    onMarkReviewed,
  }: {
    transaction: TransactionData;
    curr: any;
    isHighConfidence: boolean;
    onEdit: () => void;
    onAccept: () => void;
    onMarkReviewed: () => void;
  }) => (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="scrollbar-thin-2px flex-1 space-y-8 divide-y overflow-y-auto">
        {/* Transaction Details Section */}
        <div className="grid grid-cols-2 items-center gap-4 overflow-clip p-4 pt-0">
          <div className="col-span-2 flex items-center justify-between gap-4">
            <AmountDisplay
              amount={transaction.amount}
              currency={transaction.currency}
            />
            <BankLogo
              bankLogo={transaction.bankLogo}
              bankName={transaction.bankName}
            />
          </div>
          <DateField
            label="Date"
            date={transaction.date}
            tooltip={TOOLTIPS.BANK_TRANSACTION_DATE}
          />
          <DateField
            label="FS Date"
            date={transaction.fsDate}
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
            <TruncatedText text={transaction.description} />
          </div>
          <div>
            <div className="text-muted-foreground truncate text-xs">Payee</div>
            <TruncatedText
              text={transaction.payee}
              fallback={DEFAULT_EMPTY_VALUE}
            />
          </div>
          <div>
            <div className="text-muted-foreground truncate text-xs">
              Project
            </div>
            <TruncatedText
              text={transaction.project}
              fallback={DEFAULT_EMPTY_VALUE}
            />
          </div>
        </div>

        {/* Category and Explanation Section */}
        <div className="space-y-2 px-4 pb-6">
          <CategoryDisplay
            account={transaction.account}
            confidence={transaction.confidence}
            curr={curr}
          />
          <ExplanationSection explanation={transaction.explanation} />
        </div>

        {/* Journal Entries Section */}
        <JournalEntriesSection transaction={transaction} />
      </div>

      {/* Action Buttons - centralized at bottom */}
      <TransactionActions
        isHighConfidence={isHighConfidence}
        onEdit={onEdit}
        onAccept={onAccept}
        onMarkReviewed={onMarkReviewed}
      />
    </div>
  ),
);

// Journal Entries Section
const JournalEntriesSection = memo(
  ({ transaction }: { transaction: TransactionData }) => (
    <div className="px-4">
      <div className="flex items-center justify-between text-sm">
        <div className="text-muted-foreground">Entries</div>
        <div className="mr-2 flex cursor-pointer items-center gap-1 hover:underline">
          <Split className="h-3 w-3" />
          Split
        </div>
      </div>
      <div className="divide-y rounded border p-1 px-2">
        <div className="grid grid-cols-[2fr_1fr_2fr] p-1 text-sm">
          <div className="truncate">Account</div>
          <div className="truncate">Debit</div>
          <FormattedAmount
            amount={transaction.amount}
            currency={transaction.currency}
            showSymbol
            accountingNegatives={false}
            className="truncate text-right"
          />
        </div>
        <div className="grid grid-cols-[2fr_1fr_2fr] p-1 text-sm">
          <div className="truncate">Account</div>
          <div className="truncate">Credit</div>
          <FormattedAmount
            amount={transaction.amount}
            currency={transaction.currency}
            showSymbol
            accountingNegatives={false}
            className="truncate text-right"
          />
        </div>
      </div>
      <div className="text-muted-foreground grid grid-cols-[2fr_1fr_2fr] p-1 px-3 text-sm">
        <div className="truncate">Net Total</div>
        <div className="truncate">Credit</div>
        <FormattedAmount
          amount={0}
          currency={transaction.currency}
          showSymbol
          accountingNegatives={false}
          className="truncate text-right"
        />
      </div>
    </div>
  ),
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

// Form component for edit mode
const TransactionForm = memo(
  ({
    transaction,
    onSubmit,
    onCancel,
    error,
  }: {
    transaction: TransactionData;
    onSubmit: (data: TransactionFormData) => Promise<void>;
    onCancel: () => void;
    error?: string | null;
  }) => {
    const {
      register,
      handleSubmit,
      handleCancel,
      errors,
      isSubmitting,
      validationRules,
      retryCount,
    } = useTransactionForm({
      transaction,
      onSubmit,
      onCancel,
    });

    return (
      <form
        onSubmit={handleSubmit}
        className="flex h-full min-h-0 flex-col gap-4"
      >
        {/* Error Alert */}
        {error && (
          <Alert variant="destructive" className="mx-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {error}
              {retryCount > 0 && (
                <span className="mt-1 block text-xs">
                  Retrying... ({retryCount}/3)
                </span>
              )}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-1 flex-col gap-6">
          <div className="grid grid-cols-2 items-center gap-4 overflow-clip border-b p-4 pt-0 pb-6">
            {/* Amount - Read Only */}
            <div className="col-span-2 flex items-center justify-between gap-4">
              <div>
                <div className="text-muted-foreground truncate text-xs">
                  Amount
                </div>
                <FormattedAmount
                  amount={transaction.amount}
                  currency={transaction.currency || DEFAULT_CURRENCY}
                  showSymbol
                  accountingNegatives={false}
                  className={cn(
                    'truncate text-xl font-bold',
                    transaction.amount < 0
                      ? 'text-red-600 dark:text-red-500'
                      : transaction.amount > 0
                        ? 'text-green-700 dark:text-green-500'
                        : '',
                  )}
                />
              </div>
              <BankLogo
                bankLogo={transaction.bankLogo}
                bankName={transaction.bankName}
              />
            </div>
            {/* Date - Read Only */}
            <div>
              <div className="text-muted-foreground truncate text-xs">Date</div>
              <div className="text-muted-foreground truncate text-[0.9rem]">
                {safeFormatDate({
                  date: transaction.date,
                  formatString: 'dd MMM yyyy',
                })}
              </div>
            </div>
            {/* FS Date - Editable */}
            <div>
              <Label htmlFor="fsDate" className="text-muted-foreground text-xs">
                FS Date *
              </Label>
              <Input
                id="fsDate"
                type="date"
                {...register('fsDate', validationRules.fsDate)}
                className="h-8 text-[0.9rem]"
                aria-describedby={errors.fsDate ? 'fsDate-error' : undefined}
              />
              {errors.fsDate && (
                <div id="fsDate-error" className="mt-1 text-xs text-red-500">
                  {errors.fsDate.message}
                </div>
              )}
            </div>
            {/* Description - Editable */}
            <div className="col-span-2">
              <Label
                htmlFor="description"
                className="text-muted-foreground text-xs"
              >
                Description *
              </Label>
              <Input
                id="description"
                {...register('description', validationRules.description)}
                className="h-8 text-[0.9rem]"
                aria-describedby={
                  errors.description ? 'description-error' : undefined
                }
              />
              {errors.description && (
                <div
                  id="description-error"
                  className="mt-1 text-xs text-red-500"
                >
                  {errors.description.message}
                </div>
              )}
            </div>
            {/* Payee - Editable */}
            <div>
              <Label htmlFor="payee" className="text-muted-foreground text-xs">
                Payee
              </Label>
              <Input
                id="payee"
                {...register('payee', validationRules.payee)}
                className="h-8 text-[0.9rem]"
                aria-describedby={errors.payee ? 'payee-error' : undefined}
              />
              {errors.payee && (
                <div id="payee-error" className="mt-1 text-xs text-red-500">
                  {errors.payee.message}
                </div>
              )}
            </div>
            {/* Project - Editable */}
            <div>
              <Label
                htmlFor="project"
                className="text-muted-foreground text-xs"
              >
                Project
              </Label>
              <Input
                id="project"
                {...register('project', validationRules.project)}
                className="h-8 text-[0.9rem]"
                aria-describedby={errors.project ? 'project-error' : undefined}
              />
              {errors.project && (
                <div id="project-error" className="mt-1 text-xs text-red-500">
                  {errors.project.message}
                </div>
              )}
            </div>
          </div>
          <div className="space-y-2 px-4">
            {/* Account - Editable */}
            <div>
              <Label
                htmlFor="account"
                className="text-muted-foreground text-xs"
              >
                Account *
              </Label>
              <Input
                id="account"
                {...register('account', validationRules.account)}
                className="h-8 text-[0.9rem]"
                aria-describedby={errors.account ? 'account-error' : undefined}
              />
              {errors.account && (
                <div id="account-error" className="mt-1 text-xs text-red-500">
                  {errors.account.message}
                </div>
              )}
            </div>
          </div>
        </div>
        {/* Form Actions */}
        <div className="flex gap-2 p-4">
          <Button
            type="submit"
            size="sm"
            disabled={isSubmitting}
            className="flex-1"
          >
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCancel}
            className="flex-1"
          >
            Cancel
          </Button>
        </div>
      </form>
    );
  },
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

const BankLogo = memo(
  ({ bankLogo, bankName }: { bankLogo?: string; bankName?: string }) => (
    <TooltipHelper
      icon={false}
      content={bankName || TOOLTIPS.BANK_LOGO}
      contentStyle="w-fit"
      trigger={
        <div
          className="bg-muted flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border"
          role="img"
          aria-label={`${bankName || TOOLTIPS.BANK_LOGO} logo`}
        >
          {bankLogo ? (
            <img
              src={bankLogo}
              alt={`${bankName || 'Bank'} Logo`}
              className="h-8 w-8 object-contain"
              loading="lazy"
            />
          ) : (
            <Landmark className="h-4 w-4" />
          )}
        </div>
      }
    />
  ),
);

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
    text?: string;
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
      return <TooltipHelper content={text} icon={false} trigger={content} />;
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
    account?: string;
    confidence?: number;
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

const ExplanationSection = memo(({ explanation }: { explanation?: string }) => {
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
});

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
  TransactionForm,
  TransactionHeader,
  TransactionSkeleton,
  TransactionView,
  TruncatedText,
};
