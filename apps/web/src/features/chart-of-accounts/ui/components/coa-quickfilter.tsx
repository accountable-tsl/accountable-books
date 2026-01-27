import type { QuickFilterOptions } from '@/modules/accounting/chart-of-accounts';
import { useState } from 'react';
import { cn } from '@/lib/utils';

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
    <div className="flex flex-1 items-center">
      <hr className="grow" />
      <div className="bg-secondary border-background-secondary hidden h-[32px] max-h-8 w-[340px] items-center justify-between gap-1 overflow-clip rounded-md border xl:flex">
        {accountElements.map((tab) => (
          <div
            key={tab.value}
            // variant="outline"
            // size="sm"
            className={cn(
              'flex h-full cursor-pointer items-center justify-center rounded-sm border-0 px-2 text-sm font-light shadow-none',
              'hover:text-foreground',
              isActive(tab.value)
                ? 'bg-background text-foreground dark:bg-background/40 font-normal'
                : 'text-foreground/50 bg-transparent opacity-80 hover:opacity-100',
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
