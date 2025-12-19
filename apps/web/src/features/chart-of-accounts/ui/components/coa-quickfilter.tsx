import { useState } from 'react';

import { cn } from '@/lib/utils';
import type { QuickFilterOptions } from '@/modules/accounting/chart-of-accounts';

interface QuickFilterProps {
  isMobile?: boolean;
  accountElementFilter: string;
  setAccountElementFilter: (val: string) => void;
  options: QuickFilterOptions[];
}

export const accountElements = [
  { label: 'All', value: 'all' },
  { label: 'Assets', value: 'assets' },
  { label: 'Liabilities', value: 'liabilities' },
  { label: 'Income', value: 'income' },
  { label: 'Expenses', value: 'expenses' },
  { label: 'Equity', value: 'equity' },
];

export const QuickFilter: React.FC<QuickFilterProps> = ({
  isMobile = true,
  accountElementFilter,
  setAccountElementFilter,
  options: accountElements,
}) => {
  // const isMobile = useIsMobile();

  // const [accountElementFilter, setAccountElementFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState('active');

  if (isMobile) return null;

  const isActive = (val: string) =>
    val.toLowerCase() === accountElementFilter.toLowerCase();

  return (
    <div className="flex-1 flex items-center">
      <hr className="grow" />
      <div className="hidden xl:flex items-center justify-between gap-1 rounded-md bg-secondary h-[32px] max-h-8 w-[340px] overflow-clip border border-background-secondary">
        {accountElements.map((tab) => (
          <div
            key={tab.value}
            // variant="outline"
            // size="sm"
            className={cn(
              'font-light border-0 shadow-none px-2 flex h-full justify-center items-center text-sm rounded-sm cursor-pointer',
              'hover:text-foreground',
              isActive(tab.value)
                ? 'bg-background text-foreground dark:bg-background/40 font-normal'
                : 'bg-transparent text-foreground/50 opacity-80 hover:opacity-100',
            )}
            onClick={() => setAccountElementFilter(tab.value.toLowerCase())}
          >
            {tab.label}
          </div>
        ))}
      </div>
      <hr className="grow" />
    </div>
  );
};
