import { useState } from 'react';
import clsx from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronRight,
  History,
  Sparkles,
  X,
} from 'lucide-react';

import { AISuggestion, Transaction, transactions } from '../data/mock';

type FilterStatus = 'all' | 'ai_suggested' | 'uncategorized' | 'posted';

export function Transactions() {
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [localTransactions, setLocalTransactions] = useState(transactions);

  const filteredTransactions = localTransactions.filter((tx) => {
    if (filter === 'all') return true;
    return tx.status === filter;
  });

  const handleApprove = (txId: string) => {
    setLocalTransactions((prev) =>
      prev.map((tx) =>
        tx.id === txId
          ? {
              ...tx,
              status: 'posted' as const,
              approvedCategory: tx.aiSuggestion?.category,
            }
          : tx,
      ),
    );
    setSelectedTx(null);
  };

  const handleBulkApprove = () => {
    const highConfidenceIds = localTransactions
      .filter((tx) => tx.aiSuggestion && tx.aiSuggestion.confidence >= 90)
      .map((tx) => tx.id);

    setLocalTransactions((prev) =>
      prev.map((tx) =>
        highConfidenceIds.includes(tx.id)
          ? {
              ...tx,
              status: 'posted' as const,
              approvedCategory: tx.aiSuggestion?.category,
            }
          : tx,
      ),
    );
  };

  const counts = {
    all: localTransactions.length,
    ai_suggested: localTransactions.filter((t) => t.status === 'ai_suggested')
      .length,
    uncategorized: localTransactions.filter((t) => t.status === 'uncategorized')
      .length,
    posted: localTransactions.filter((t) => t.status === 'posted').length,
  };

  return (
    <div className="flex h-screen">
      {/* Transaction List */}
      <div className="flex flex-1 flex-col border-r border-gray-200">
        {/* Header */}
        <div className="border-b border-gray-200 bg-white p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Transactions</h1>
              <p className="text-sm text-gray-500">
                Sunrise Coffee Co. • January 2024
              </p>
            </div>
            <button
              onClick={handleBulkApprove}
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
            >
              <Sparkles size={16} />
              Approve All High Confidence
            </button>
          </div>

          {/* Filter Tabs */}
          <div className="flex w-fit gap-1 rounded-lg bg-gray-100 p-1">
            {[
              { key: 'all', label: 'All' },
              { key: 'ai_suggested', label: 'AI Suggested' },
              { key: 'uncategorized', label: 'Needs Review' },
              { key: 'posted', label: 'Posted' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key as FilterStatus)}
                className={clsx(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  filter === tab.key
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900',
                )}
              >
                {tab.label}
                <span className="ml-1.5 text-xs text-gray-400">
                  {counts[tab.key as FilterStatus]}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Transaction List */}
        <div className="flex-1 overflow-auto">
          {filteredTransactions.map((tx) => (
            <TransactionRow
              key={tx.id}
              transaction={tx}
              isSelected={selectedTx?.id === tx.id}
              onClick={() => setSelectedTx(tx)}
            />
          ))}
        </div>
      </div>

      {/* Detail Panel */}
      <AnimatePresence>
        {selectedTx && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 480, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-l border-gray-200 bg-white"
          >
            <TransactionDetail
              transaction={selectedTx}
              onClose={() => setSelectedTx(null)}
              onApprove={() => handleApprove(selectedTx.id)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TransactionRow({
  transaction,
  isSelected,
  onClick,
}: {
  transaction: Transaction;
  isSelected: boolean;
  onClick: () => void;
}) {
  const statusConfig = {
    uncategorized: {
      icon: AlertCircle,
      color: 'text-amber-500',
      bg: 'bg-amber-50',
      label: 'Needs Review',
    },
    ai_suggested: {
      icon: Sparkles,
      color: 'text-brand-500',
      bg: 'bg-brand-50',
      label: 'AI Suggested',
    },
    approved: {
      icon: Check,
      color: 'text-blue-500',
      bg: 'bg-blue-50',
      label: 'Approved',
    },
    posted: {
      icon: CheckCircle2,
      color: 'text-green-500',
      bg: 'bg-green-50',
      label: 'Posted',
    },
  };

  const status = statusConfig[transaction.status];
  const StatusIcon = status.icon;

  return (
    <div
      onClick={onClick}
      className={clsx(
        'cursor-pointer border-b border-gray-100 p-4 transition-colors',
        isSelected ? 'bg-brand-50' : 'hover:bg-gray-50',
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-sm text-gray-500">{transaction.date}</span>
            <span className={clsx('rounded p-1', status.bg)}>
              <StatusIcon size={14} className={status.color} />
            </span>
          </div>
          <div className="mb-1 truncate font-medium text-gray-900">
            {transaction.description}
          </div>
          {transaction.aiSuggestion && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">
                → {transaction.aiSuggestion.category}
              </span>
              <span
                className={clsx(
                  'rounded px-1.5 py-0.5 text-xs font-medium',
                  transaction.aiSuggestion.confidence >= 90
                    ? 'bg-green-100 text-green-700'
                    : transaction.aiSuggestion.confidence >= 70
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-red-100 text-red-700',
                )}
              >
                {transaction.aiSuggestion.confidence}%
              </span>
            </div>
          )}
          {transaction.approvedCategory && (
            <div className="text-sm text-green-600">
              ✓ {transaction.approvedCategory}
            </div>
          )}
        </div>
        <div className="text-right">
          <div
            className={clsx(
              'font-semibold',
              transaction.type === 'credit'
                ? 'text-green-600'
                : 'text-gray-900',
            )}
          >
            {transaction.type === 'credit' ? '+' : '-'}$
            {transaction.amount.toLocaleString('en-US', {
              minimumFractionDigits: 2,
            })}
          </div>
          <div className="text-xs text-gray-400">{transaction.bankAccount}</div>
        </div>
      </div>
    </div>
  );
}

function TransactionDetail({
  transaction,
  onClose,
  onApprove,
}: {
  transaction: Transaction;
  onClose: () => void;
  onApprove: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 p-4">
        <h2 className="font-semibold text-gray-900">Transaction Details</h2>
        <button
          onClick={onClose}
          className="rounded p-1 transition-colors hover:bg-gray-100"
        >
          <X size={20} className="text-gray-500" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {/* Basic Info */}
        <div className="mb-6">
          <div className="mb-1 text-sm text-gray-500">{transaction.date}</div>
          <div className="mb-2 text-lg font-semibold text-gray-900">
            {transaction.description}
          </div>
          <div
            className={clsx(
              'text-2xl font-bold',
              transaction.type === 'credit'
                ? 'text-green-600'
                : 'text-gray-900',
            )}
          >
            {transaction.type === 'credit' ? '+' : '-'}$
            {transaction.amount.toLocaleString('en-US', {
              minimumFractionDigits: 2,
            })}
          </div>
          <div className="text-sm text-gray-500">{transaction.bankAccount}</div>
        </div>

        {/* AI Suggestion */}
        {transaction.aiSuggestion && (
          <AIExplanation
            suggestion={transaction.aiSuggestion}
            isPosted={transaction.status === 'posted'}
          />
        )}

        {transaction.status === 'uncategorized' && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 text-amber-500" size={20} />
              <div>
                <div className="font-medium text-amber-800">
                  Manual Review Required
                </div>
                <div className="mt-1 text-sm text-amber-700">
                  AI couldn't confidently categorize this transaction. Please
                  review and assign a category manually.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      {transaction.status === 'ai_suggested' && (
        <div className="border-t border-gray-200 bg-gray-50 p-4">
          <button
            onClick={onApprove}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-3 font-medium text-white transition-colors hover:bg-brand-700"
          >
            <Check size={20} />
            Approve & Post
          </button>
          <div className="mt-2 text-center text-xs text-gray-500">
            This will post the journal entry to the ledger
          </div>
        </div>
      )}
    </div>
  );
}

function AIExplanation({
  suggestion,
  isPosted,
}: {
  suggestion: AISuggestion;
  isPosted: boolean;
}) {
  return (
    <div className="space-y-4">
      {/* Main Suggestion */}
      <div
        className={clsx(
          'rounded-lg border p-4',
          isPosted
            ? 'border-green-200 bg-green-50'
            : 'border-brand-200 bg-brand-50',
        )}
      >
        <div className="mb-3 flex items-start justify-between">
          <div className="flex items-center gap-2">
            {isPosted ? (
              <CheckCircle2 className="text-green-600" size={20} />
            ) : (
              <Sparkles className="text-brand-600" size={20} />
            )}
            <span className="font-medium text-gray-900">
              {isPosted ? 'Posted as' : 'AI Suggestion'}
            </span>
          </div>
          <span
            className={clsx(
              'rounded px-2 py-1 text-sm font-semibold',
              suggestion.confidence >= 90
                ? 'bg-green-100 text-green-700'
                : suggestion.confidence >= 70
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-red-100 text-red-700',
            )}
          >
            {suggestion.confidence}% confident
          </span>
        </div>

        <div className="mb-3">
          <div className="text-lg font-semibold text-gray-900">
            {suggestion.category}
          </div>
          <div className="text-sm text-gray-500">
            Account {suggestion.accountCode}
          </div>
        </div>

        {/* The Key Differentiator: Reasoning */}
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700">
            <Sparkles size={14} className="text-brand-500" />
            Why this category?
          </div>
          <p className="text-sm leading-relaxed text-gray-600">
            {suggestion.reasoning}
          </p>
        </div>
      </div>

      {/* Similar Transactions */}
      {suggestion.similarTransactions.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700">
            <History size={14} />
            Similar Past Transactions
          </div>
          <div className="space-y-2">
            {suggestion.similarTransactions.map((tx, i) => (
              <div
                key={i}
                className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="flex-1 truncate text-gray-600">
                    {tx.description}
                  </span>
                  <span className="ml-2 font-medium text-gray-900">
                    ${tx.amount.toLocaleString()}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
                  <span>{tx.date}</span>
                  <span className="text-green-600">→ {tx.category}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Alternative Suggestions */}
      {suggestion.alternativeSuggestions.length > 0 && (
        <div>
          <div className="mb-2 text-sm font-medium text-gray-700">
            Alternative Categories
          </div>
          <div className="space-y-1">
            {suggestion.alternativeSuggestions.map((alt, i) => (
              <div
                key={i}
                className="flex cursor-pointer items-center justify-between rounded p-2 transition-colors hover:bg-gray-50"
              >
                <div className="flex items-center gap-2">
                  <ChevronRight size={14} className="text-gray-400" />
                  <span className="text-sm text-gray-700">{alt.category}</span>
                </div>
                <span className="text-xs text-gray-400">{alt.confidence}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
