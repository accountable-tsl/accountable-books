import type { ReactNode } from 'react';

export function LineInfoCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="shrink-0 rounded-lg border p-3">
      <p className="font-medium">{title}</p>
      {subtitle && (
        <p className="text-muted-foreground mt-0.5 truncate text-xs">
          {subtitle}
        </p>
      )}
      {children}
    </div>
  );
}
