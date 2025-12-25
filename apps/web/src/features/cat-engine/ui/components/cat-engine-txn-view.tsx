import {
  AlertTriangle,
  Check,
  ChevronDown,
  Edit,
  Eye,
  Landmark,
  Lightbulb,
  Pencil,
  Split,
  X,
} from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';

import { FormattedAmount } from '@/components/FormattedAmount';
import { TooltipHelper } from '@/components/TooltipHelper';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { GroupedTransaction } from '@/modules/accounting/categorization';
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
import { useTransactionForm } from '../hooks/use-transaction-form';
import {
  type CatEngineTxnViewProps,
  type TransactionData,
  type TransactionFormData,
} from '../types';
import { ErrorBoundary } from './error-boundary';
import { LoadingState, TransactionSkeleton } from './loading-state';

/**
 * Maps GroupedTransaction to TransactionData format
 */
function mapGroupedTransactionToTransactionData(
  txn: GroupedTransaction | undefined,
): TransactionData | null {
  if (!txn) return null;

  // Parse dates - handle string dates from API
  const parseDate = (dateStr: string | null | undefined): Date => {
    if (!dateStr) return new Date();
    if (dateStr instanceof Date) return dateStr;
    const parsed = new Date(dateStr);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
  };

  return {
    id: txn.id,
    amount: txn.reportingAmount,
    description: txn.description || '',
    payee: txn.contactName || undefined,
    project: txn.projectName || undefined,
    bankLogo: txn.bankLogo || undefined,
    bankName: txn.bankName,
    account: txn.coaName || undefined,
    confidence: txn.confidence ?? undefined,
    explanation: undefined, // GroupedTransaction doesn't have explanation field
    date: parseDate(txn.date),
    fsDate: parseDate(txn.fsDate),
    currency: txn.bankAccountCurrencyCode || DEFAULT_CURRENCY,
    bankAccountName: txn.bankAccountName,
    bankAccountCurrencyCode: txn.bankAccountCurrencyCode,
  };
}

// Default transaction data for development/scaffolding
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

  // Map GroupedTransaction to TransactionData format
  const mappedTransaction = useMemo(() => {
    if (!transaction) return defaultTransaction;
    const mapped = mapGroupedTransactionToTransactionData(transaction);
    return mapped || defaultTransaction;
  }, [transaction]);

  const tx = mappedTransaction;

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
          'h-full rounded-md flex flex-col gap-4 border scale-in-hor-right overflow-clip',
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
          'h-full rounded-md flex flex-col gap-4 border scale-in-hor-right overflow-clip',
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
          'min-h-0 h-full rounded-md flex flex-col gap-4 border scale-in-hor-right overflow-clip',
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
    transaction: txn,
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
    <div className="flex flex-col min-h-0 h-full gap-4">
      <div className="space-y-8 divide-y flex-1 overflow-y-auto scrollbar-thin-2px">
        {/* Transaction Details Section */}
        <div className="grid grid-cols-2 gap-4 p-4 pt-0 items-center overflow-clip">
          {/* Amount */}
          <div>
            <div className="text-xs text-muted-foreground truncate">
              Bank amount
            </div>
            <FormattedAmount
              amount={txn.amount}
              currency={txn.currency}
              showSymbol
              accountingNegatives={false}
              className={cn(
                'text-xl font-bold truncate',
                txn.amount < 0
                  ? 'text-red-600 dark:text-red-500'
                  : txn.amount > 0
                    ? 'text-green-700 dark:text-green-500'
                    : '',
              )}
            />
          </div>

          {/* Bank Logo */}
          <TooltipHelper
            icon={false}
            content={
              `${txn.bankName} - ${txn.bankAccountName}` || TOOLTIPS.BANK_LOGO
            }
            contentStyle="w-fit max-w-xs text-center"
            trigger={
              <div className="flex gap-2 items-center overflow-hidden">
                <div
                  className="flex-shrink-0 w-8 h-8 overflow-hidden rounded-full bg-muted dark:bg-foreground/70 flex items-center justify-center border"
                  role="img"
                  aria-label={`${txn.bankName || TOOLTIPS.BANK_LOGO} logo`}
                >
                  {txn.bankLogo ? (
                    <img
                      src={txn.bankLogo}
                      alt={`${txn.bankName || 'Bank'} Logo`}
                      className="w-8 h-8 object-contain"
                      loading="lazy"
                    />
                  ) : (
                    <Landmark className="w-4 h-4" />
                  )}
                </div>
                <p className="text-muted-foreground text-xs line-clamp-2">
                  {txn.bankAccountName}
                </p>
              </div>
            }
          />

          <DateField
            label="Date"
            date={txn.date}
            tooltip={TOOLTIPS.BANK_TRANSACTION_DATE}
          />
          <DateField
            label="FS Date"
            date={txn.fsDate}
            tooltip={TOOLTIPS.FS_DATE}
          />
          <div className="col-span-2">
            <TooltipHelper
              content={TOOLTIPS.DESCRIPTION}
              contentStyle="w-fit"
              icon={false}
              trigger={
                <div className="text-xs text-muted-foreground truncate">
                  Description
                </div>
              }
              triggerWrapperClassName="w-fit"
            />
            <TruncatedText text={txn.description} />
          </div>
          <div>
            <div className="text-xs text-muted-foreground truncate">Payee</div>
            <TruncatedText text={txn.payee} fallback={DEFAULT_EMPTY_VALUE} />
          </div>
          <div>
            <div className="text-xs text-muted-foreground truncate">
              Project
            </div>
            <TruncatedText text={txn.project} fallback={DEFAULT_EMPTY_VALUE} />
          </div>
        </div>

        {/* Category and Explanation Section */}
        <div className="px-4 pb-6 space-y-2">
          <CategoryDisplay
            account={txn.account}
            confidence={txn.confidence}
            curr={curr}
          />
          <ExplanationSection explanation={txn.explanation} />
        </div>

        {/* Journal Entries Section */}
        <JournalEntriesSection transaction={txn} />
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
        <div className="flex items-center gap-1 hover:underline cursor-pointer mr-2">
          <Split className="w-3 h-3" />
          Split
        </div>
      </div>
      <div className="border rounded p-1 px-2 divide-y">
        <div className="grid grid-cols-[2fr_1fr_2fr] text-sm p-1">
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
        <div className="grid grid-cols-[2fr_1fr_2fr] text-sm p-1">
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
      <div className="grid grid-cols-[2fr_1fr_2fr] text-sm p-1 px-3 text-muted-foreground">
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
          className="flex items-center flex-1"
          onClick={onEdit}
        >
          <Edit className="w-4 h-4 mr-2" /> Edit
        </Button>
        <Button variant="outline" className="flex items-center flex-1">
          <Split className="w-4 h-4 mr-2" /> Split
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        {!isHighConfidence && (
          <Button variant="outline" onClick={onAccept}>
            <Check className="w-4 h-4 mr-2" /> Accept Category
          </Button>
        )}
        {isHighConfidence && (
          <Button variant="outline" onClick={onMarkReviewed}>
            <Eye className="w-4 h-4 mr-2" /> Mark as Reviewed
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
        'flex items-center justify-between px-4 py-1 h-10 min-h-10 border-b',
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
        className="flex flex-col gap-4 h-full min-h-0"
      >
        {/* Error Alert */}
        {error && (
          <Alert variant="destructive" className="mx-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {error}
              {retryCount > 0 && (
                <span className="block text-xs mt-1">
                  Retrying... ({retryCount}/3)
                </span>
              )}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex-1 flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-4 p-4 pb-6 pt-0 border-b items-center overflow-clip">
            {/* Amount - Read Only */}
            <div className="col-span-2 flex items-center gap-4 justify-between">
              <div>
                <div className="text-xs text-muted-foreground truncate">
                  Amount
                </div>
                <FormattedAmount
                  amount={transaction.amount}
                  currency={transaction.currency || DEFAULT_CURRENCY}
                  showSymbol
                  accountingNegatives={false}
                  className={cn(
                    'text-xl font-bold truncate',
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
              <div className="text-xs text-muted-foreground truncate">Date</div>
              <div className="truncate text-[0.9rem] text-muted-foreground">
                {safeFormatDate({
                  date: transaction.date,
                  formatString: 'dd MMM yyyy',
                })}
              </div>
            </div>
            {/* FS Date - Editable */}
            <div>
              <Label htmlFor="fsDate" className="text-xs text-muted-foreground">
                FS Date *
              </Label>
              <Input
                id="fsDate"
                type="date"
                {...register('fsDate', validationRules.fsDate)}
                className="text-[0.9rem] h-8"
                aria-describedby={errors.fsDate ? 'fsDate-error' : undefined}
              />
              {errors.fsDate && (
                <div id="fsDate-error" className="text-xs text-red-500 mt-1">
                  {errors.fsDate.message}
                </div>
              )}
            </div>
            {/* Description - Editable */}
            <div className="col-span-2">
              <Label
                htmlFor="description"
                className="text-xs text-muted-foreground"
              >
                Description *
              </Label>
              <Input
                id="description"
                {...register('description', validationRules.description)}
                className="text-[0.9rem] h-8"
                aria-describedby={
                  errors.description ? 'description-error' : undefined
                }
              />
              {errors.description && (
                <div
                  id="description-error"
                  className="text-xs text-red-500 mt-1"
                >
                  {errors.description.message}
                </div>
              )}
            </div>
            {/* Payee - Editable */}
            <div>
              <Label htmlFor="payee" className="text-xs text-muted-foreground">
                Payee
              </Label>
              <Input
                id="payee"
                {...register('payee', validationRules.payee)}
                className="text-[0.9rem] h-8"
                aria-describedby={errors.payee ? 'payee-error' : undefined}
              />
              {errors.payee && (
                <div id="payee-error" className="text-xs text-red-500 mt-1">
                  {errors.payee.message}
                </div>
              )}
            </div>
            {/* Project - Editable */}
            <div>
              <Label
                htmlFor="project"
                className="text-xs text-muted-foreground"
              >
                Project
              </Label>
              <Input
                id="project"
                {...register('project', validationRules.project)}
                className="text-[0.9rem] h-8"
                aria-describedby={errors.project ? 'project-error' : undefined}
              />
              {errors.project && (
                <div id="project-error" className="text-xs text-red-500 mt-1">
                  {errors.project.message}
                </div>
              )}
            </div>
          </div>
          <div className="px-4 space-y-2">
            {/* Account - Editable */}
            <div>
              <Label
                htmlFor="account"
                className="text-xs text-muted-foreground"
              >
                Account *
              </Label>
              <Input
                id="account"
                {...register('account', validationRules.account)}
                className="text-[0.9rem] h-8"
                aria-describedby={errors.account ? 'account-error' : undefined}
              />
              {errors.account && (
                <div id="account-error" className="text-xs text-red-500 mt-1">
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
      <div className="text-xs text-muted-foreground truncate">Amount</div>
      <FormattedAmount
        amount={amount}
        currency={currency}
        showSymbol
        accountingNegatives={false}
        className={cn(
          'text-xl font-bold truncate',
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
          className="flex-shrink-0 w-8 h-8 overflow-hidden rounded-full bg-muted flex items-center justify-center border"
          role="img"
          aria-label={`${bankName || TOOLTIPS.BANK_LOGO} logo`}
        >
          {bankLogo ? (
            <img
              src={bankLogo}
              alt={`${bankName || 'Bank'} Logo`}
              className="w-8 h-8 object-contain"
              loading="lazy"
            />
          ) : (
            <Landmark className="w-4 h-4" />
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
          <div className="text-xs text-muted-foreground truncate">{label}</div>
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
        <div className="text-xs text-muted-foreground">
          {curr.id === 'reviewed' ? 'Account' : 'Predicted Category'}
        </div>
        <div
          className={cn(
            'flex gap-1 p-1 px-2 border items-center rounded',
            curr.borderClass || '',
          )}
        >
          <div className="truncate">{account || DEFAULT_ACCOUNT_TEXT}</div>
          {confidencePercent && (
            <div
              className={cn(
                'rounded-xl px-2 text-sm flex items-center justify-center',
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
        'flex flex-col gap-1 px-2 rounded transition-all duration-300 ease-in-out',
        showExplanation ? 'border p-2' : '',
      )}
    >
      <button
        type="button"
        className="flex items-center text-xs text-muted-foreground hover:underline cursor-pointer hover:text-foreground"
        onClick={() => setShowExplanation(!showExplanation)}
        aria-expanded={showExplanation}
        aria-controls="explanation-content"
      >
        <Lightbulb className="w-3 h-3 inline-flex" />
        <span>Explanation</span>
        <ChevronDown
          className={cn(
            'w-4 h-4 inline-flex transition-transform duration-200',
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
        <div id="explanation-content" className="text-sm overflow-y-auto">
          {explanation}
        </div>
      </div>
    </div>
  );
});

// const renderEditableField = (label: string, field: string, value: string, multiline = false) => {
//   const isEditing = editingField === field;

//   return (
//     <div className="space-y-1">
//       <label className="text-xs text-muted-foreground">{label}</label>
//       {isEditing ? (
//         <div className="flex items-center gap-2">
//           {multiline ? (
//             <textarea
//               value={tempValue}
//               onChange={(e) => setTempValue(e.target.value)}
//               className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
//               rows={3}
//               autoFocus
//             />
//           ) : (
//             <input
//               type="text"
//               value={tempValue}
//               onChange={(e) => setTempValue(e.target.value)}
//               className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
//               autoFocus
//             />
//           )}
//           <button
//             onClick={() => handleSave(field)}
//             className="p-2 hover:bg-white/10 rounded transition-colors"
//           >
//             <Check className="w-4 h-4 text-green-400" />
//           </button>
//           <button
//             onClick={handleCancel}
//             className="p-2 hover:bg-white/10 rounded transition-colors"
//           >
//             <X className="w-4 h-4 text-red-400" />
//           </button>
//         </div>
//       ) : (
//         <div
//           onClick={() => handleEdit(field, value)}
//           className="bg-white/5 border border-white/10 rounded px-3 py-2 text-sm cursor-pointer hover:bg-white/10 transition-colors group flex items-center justify-between"
//         >
//           <span>{value || 'Not set'}</span>
//           <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground" />
//         </div>
//       )}
//     </div>
//   );
// };

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
