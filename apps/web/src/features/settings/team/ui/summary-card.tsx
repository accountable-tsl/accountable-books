import type { ReactNode } from 'react';

type SummaryCardProps = {
  label: string;
  value: ReactNode;
  helper: ReactNode;
  className?: string;
};

export function SummaryCard({
  label,
  value,
  helper,
  className,
}: SummaryCardProps) {
  return (
    <div
      className={`border-border/60 bg-background flex flex-col gap-1 rounded-md border p-3 ${className ?? ''}`}
    >
      <span className="text-muted-foreground text-xs">{label}</span>
      <div className="text-base font-semibold">{value}</div>
      <div className="text-muted-foreground text-xs">{helper}</div>
    </div>
  );
}
