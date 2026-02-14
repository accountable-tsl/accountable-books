type EmptyStateProps = {
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
};

export function EmptyState({ title, description, children }: EmptyStateProps) {
  return (
    <div className="flex h-full flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <p className="text-foreground text-sm font-medium">{title}</p>
      {description ? (
        <p className="text-muted-foreground text-xs">{description}</p>
      ) : null}
      {children}
    </div>
  );
}
