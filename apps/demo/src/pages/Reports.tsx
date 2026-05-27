import { useState } from 'react';
import clsx from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, ChevronRight, FileText, X } from 'lucide-react';

import { profitAndLoss } from '../data/mock';

interface LineItem {
  account: string;
  code: string;
  amount: number;
  count: number;
}

export function Reports() {
  const [expandedSection, setExpandedSection] = useState<string | null>(
    'revenue',
  );
  const [selectedLine, setSelectedLine] = useState<LineItem | null>(null);

  const totalRevenue = profitAndLoss.revenue.reduce(
    (sum, item) => sum + item.amount,
    0,
  );
  const totalCogs = profitAndLoss.cogs.reduce(
    (sum, item) => sum + item.amount,
    0,
  );
  const totalExpenses = profitAndLoss.expenses.reduce(
    (sum, item) => sum + item.amount,
    0,
  );
  const grossProfit = totalRevenue - totalCogs;
  const netIncome = grossProfit - totalExpenses;

  return (
    <div className="flex h-screen">
      <div className="flex-1 overflow-auto p-8">
        {/* Header */}
        <div className="mb-8">
          <div className="mb-2 flex items-center gap-2 text-sm text-gray-500">
            <FileText size={16} />
            Financial Report
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            Profit & Loss Statement
          </h1>
          <p className="text-gray-500">
            Sunrise Coffee Co. • {profitAndLoss.period}
          </p>
        </div>

        {/* P&L Table */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          {/* Revenue Section */}
          <Section
            title="Revenue"
            items={profitAndLoss.revenue}
            total={totalRevenue}
            isExpanded={expandedSection === 'revenue'}
            onToggle={() =>
              setExpandedSection(
                expandedSection === 'revenue' ? null : 'revenue',
              )
            }
            onSelectLine={setSelectedLine}
            selectedLine={selectedLine}
            totalColor="text-green-600"
          />

          {/* COGS Section */}
          <Section
            title="Cost of Goods Sold"
            items={profitAndLoss.cogs}
            total={totalCogs}
            isExpanded={expandedSection === 'cogs'}
            onToggle={() =>
              setExpandedSection(expandedSection === 'cogs' ? null : 'cogs')
            }
            onSelectLine={setSelectedLine}
            selectedLine={selectedLine}
            isNegative
          />

          {/* Gross Profit */}
          <div className="border-y border-gray-200 bg-gray-50 p-4">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-gray-900">Gross Profit</span>
              <span className="text-lg font-bold text-gray-900">
                $
                {grossProfit.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                })}
              </span>
            </div>
            <div className="mt-1 text-sm text-gray-500">
              Gross Margin: {((grossProfit / totalRevenue) * 100).toFixed(1)}%
            </div>
          </div>

          {/* Expenses Section */}
          <Section
            title="Operating Expenses"
            items={profitAndLoss.expenses}
            total={totalExpenses}
            isExpanded={expandedSection === 'expenses'}
            onToggle={() =>
              setExpandedSection(
                expandedSection === 'expenses' ? null : 'expenses',
              )
            }
            onSelectLine={setSelectedLine}
            selectedLine={selectedLine}
            isNegative
          />

          {/* Net Income */}
          <div className="border-t border-brand-200 bg-brand-50 p-4">
            <div className="flex items-center justify-between">
              <span className="font-bold text-brand-900">Net Income</span>
              <span
                className={clsx(
                  'text-xl font-bold',
                  netIncome >= 0 ? 'text-green-600' : 'text-red-600',
                )}
              >
                $
                {netIncome.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                })}
              </span>
            </div>
            <div className="mt-1 text-sm text-brand-700">
              Net Margin: {((netIncome / totalRevenue) * 100).toFixed(1)}%
            </div>
          </div>
        </div>

        {/* Info Card */}
        <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-brand-100 p-2">
              <FileText size={20} className="text-brand-600" />
            </div>
            <div>
              <div className="font-medium text-gray-900">
                Click any line to drill down
              </div>
              <div className="text-sm text-gray-500">
                Every number on this report links back to the underlying
                transactions. Click any account to see exactly which
                transactions make up that total.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Drill-down Panel */}
      <AnimatePresence>
        {selectedLine && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 400, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-l border-gray-200 bg-white"
          >
            <DrilldownPanel
              line={selectedLine}
              onClose={() => setSelectedLine(null)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Section({
  title,
  items,
  total,
  isExpanded,
  onToggle,
  onSelectLine,
  selectedLine,
  isNegative,
  totalColor,
}: {
  title: string;
  items: LineItem[];
  total: number;
  isExpanded: boolean;
  onToggle: () => void;
  onSelectLine: (line: LineItem) => void;
  selectedLine: LineItem | null;
  isNegative?: boolean;
  totalColor?: string;
}) {
  return (
    <div>
      {/* Section Header */}
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between p-4 transition-colors hover:bg-gray-50"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown size={20} className="text-gray-400" />
          ) : (
            <ChevronRight size={20} className="text-gray-400" />
          )}
          <span className="font-semibold text-gray-900">{title}</span>
          <span className="text-sm text-gray-400">
            ({items.length} accounts)
          </span>
        </div>
        <span className={clsx('font-semibold', totalColor || 'text-gray-900')}>
          {isNegative ? '-' : ''}$
          {total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </span>
      </button>

      {/* Line Items */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {items.map((item) => (
              <div
                key={item.code}
                onClick={() => onSelectLine(item)}
                className={clsx(
                  'flex cursor-pointer items-center justify-between border-l-2 py-3 pl-10 pr-4 transition-colors',
                  selectedLine?.code === item.code
                    ? 'border-l-brand-500 bg-brand-50'
                    : 'border-l-transparent hover:bg-gray-50',
                )}
              >
                <div>
                  <div className="text-sm text-gray-700">{item.account}</div>
                  <div className="text-xs text-gray-400">
                    {item.code} • {item.count} transactions
                  </div>
                </div>
                <span className="text-sm font-medium text-gray-900">
                  $
                  {item.amount.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                  })}
                </span>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DrilldownPanel({
  line,
  onClose,
}: {
  line: LineItem;
  onClose: () => void;
}) {
  // Generate mock transactions for this line item
  const mockTransactions = Array.from({ length: line.count }, (_, i) => ({
    id: `${line.code}-${i}`,
    date: `2024-01-${String(15 - i).padStart(2, '0')}`,
    description: getDescriptionForAccount(line.code, i),
    amount:
      line.amount / line.count +
      (Math.random() - 0.5) * ((line.amount / line.count) * 0.3),
  }));

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 p-4">
        <div>
          <h3 className="font-semibold text-gray-900">{line.account}</h3>
          <div className="text-sm text-gray-500">Account {line.code}</div>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 transition-colors hover:bg-gray-100"
        >
          <X size={20} className="text-gray-500" />
        </button>
      </div>

      {/* Summary */}
      <div className="border-b border-gray-200 bg-gray-50 p-4">
        <div className="text-2xl font-bold text-gray-900">
          ${line.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </div>
        <div className="text-sm text-gray-500">{line.count} transactions</div>
      </div>

      {/* Transactions */}
      <div className="flex-1 overflow-auto">
        <div className="p-4">
          <div className="mb-3 text-sm font-medium text-gray-700">
            Transactions
          </div>
          <div className="space-y-2">
            {mockTransactions.map((tx) => (
              <div
                key={tx.id}
                className="cursor-pointer rounded-lg border border-gray-200 bg-white p-3 transition-colors hover:border-gray-300"
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className="truncate text-sm font-medium text-gray-900">
                    {tx.description}
                  </span>
                  <span className="text-sm font-semibold text-gray-900">
                    $
                    {tx.amount.toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
                <div className="text-xs text-gray-500">{tx.date}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function getDescriptionForAccount(code: string, index: number): string {
  const descriptions: Record<string, string[]> = {
    '4010': ['STRIPE TRANSFER', 'SQUARE PAYOUT', 'TOAST DEPOSIT'],
    '4000': ['POS DEPOSIT', 'CASH DEPOSIT', 'REGISTER RECONCILIATION'],
    '4020': ['CATERING - JOHNSON WEDDING', 'CORP EVENT DEPOSIT'],
    '5010': ['SYSCO FOODS', 'US FOODS', 'RESTAURANT DEPOT'],
    '5015': ['BLUE BOTTLE COFFEE', 'COUNTER CULTURE', 'STUMPTOWN'],
    '5020': ['ECO PRODUCTS', 'WEBSTAURANT STORE'],
    '6200': ['GUSTO PAYROLL', 'PAYROLL RUN'],
    '6100': ['DOWNTOWN PROPERTY MGMT', 'RENT PAYMENT'],
    '6300': [
      'ONCOR ELECTRIC',
      'COMCAST BUSINESS',
      'WASTE MANAGEMENT',
      'ATMOS ENERGY',
    ],
    '6350': ['ADOBE CREATIVE', 'TOAST POS', 'SLACK', 'GUSTO'],
    '6010': ['STAPLES DIRECT', 'OFFICE DEPOT', 'AMAZON'],
    '6210': ['TEXAS WORKFORCE', 'IRS EFTPS', 'PAYROLL TAX'],
    '6400': ['FACEBOOK ADS', 'GOOGLE ADS', 'YELP ADVERTISING'],
  };

  const options = descriptions[code] || ['MISC TRANSACTION'];
  return options[index % options.length] + ` #${1000 + index}`;
}
