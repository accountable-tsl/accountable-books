import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  BadgePercent,
  HandCoins,
  Landmark,
  PiggyBank,
  ReceiptText,
  Users,
  Wallet,
} from 'lucide-react';
import { ngnMoneyFormatter } from './ui/payroll-table-utils';

export type SummaryCardKey =
  | 'gross'
  | 'paye'
  | 'total_pension'
  | 'ee_pension'
  | 'er_pension'
  | 'net'
  | 'employees'
  | 'nhis'
  | 'nhf'
  | 'other';

export interface SummaryCardProps {
  summaryKey: SummaryCardKey;
  value: number;
  className?: string;
}

type SummaryCardPreset = {
  title: string;
  icon: LucideIcon;
  borderClassName?: string;
  iconClassName?: string;
  money?: boolean;
};


const summaryCardPresets: Record<SummaryCardKey, SummaryCardPreset> = {
  gross: {
    title: 'Gross Salaries',
    icon: Wallet,
    borderClassName: 'border-l-4 border-l-primary dark:border-l-muted-foreground/50',
    iconClassName: 'text-primary opacity-60',
  },
  paye: {
    title: 'Total PAYE',
    icon: ReceiptText,
    borderClassName: 'border-l-4 border-l-red-600 dark:border-l-muted-foreground/50',
    iconClassName: 'text-red-600 opacity-60',
  },
  total_pension: {
    title: 'Total Pension',
    icon: PiggyBank,
    borderClassName: 'border-l-4 border-l-orange-600 dark:border-l-muted-foreground/50',
    iconClassName: 'text-orange-600 opacity-60',
  },
  ee_pension: {
    title: 'Employee Pension',
    icon: BadgePercent,
    borderClassName: 'border-l-4 border-l-orange-600 dark:border-l-muted-foreground/50',
    iconClassName: 'text-orange-600 opacity-60',
  },
  er_pension: {
    title: 'Employer Pension',
    icon: HandCoins,
    borderClassName: 'border-l-4 border-l-amber-600 dark:border-l-muted-foreground/50',
    iconClassName: 'text-amber-600 opacity-60',
  },
  nhis: {
    title: 'Total NHIS',
    icon: Landmark,
    borderClassName: 'border-l-4 border-l-orange-600 dark:border-l-muted-foreground/50',
    iconClassName: 'text-orange-600 opacity-60',
  },
  nhf: {
    title: 'Total NHF',
    icon: Landmark,
    borderClassName: 'border-l-4 border-l-orange-600 dark:border-l-muted-foreground/50',
    iconClassName: 'text-orange-600 opacity-60',
  },
  net: {
    title: 'Total Net',
    icon: Wallet,
    borderClassName: 'border-l-4 border-l-green-600 dark:border-l-muted-foreground/50',
    iconClassName: 'text-green-600 opacity-60',
  },
  employees: {
    title: 'Total Employees',
    icon: Users,
    borderClassName: 'border-l-4 border-l-blue-600 dark:border-l-muted-foreground/50',
    iconClassName: 'text-blue-600 opacity-60',
    money: false,
  },
  other: {
    title: 'Other',
    icon: Wallet,
    borderClassName: 'border-l-4 border-l-gray-600 dark:border-l-muted-foreground/50',
    iconClassName: 'text-gray-600 opacity-60',
  },
};

export function SummaryCard({
  summaryKey,
  value,
  className,
}: SummaryCardProps) {
  const preset = summaryCardPresets[summaryKey];
  const Icon = preset.icon;

  return (
    <div
      className={cn(
        'rounded rounded-l-none border p-4 shadow-sm',
        preset.borderClassName,
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-muted-foreground truncate text-sm font-medium">
            {preset.title}
          </p>
          <div className="mt-1 text-xl font-semibold tabular-nums">
            {preset.money === false ? value : ngnMoneyFormatter(value)}
          </div>
        </div>

        <div className="bg-muted shrink-0 rounded-md p-2">
          <Icon
            className={cn(
              'text-muted-foreground h-5 w-5',
              preset.iconClassName,
            )}
          />
        </div>
      </div>
    </div>
  );
}
