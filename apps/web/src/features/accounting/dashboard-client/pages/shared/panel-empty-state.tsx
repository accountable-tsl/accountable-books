export function PanelEmptyState({ message }: { message: string }) {
  return (
    <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center p-6 text-center text-sm">
      <p>{message}</p>
    </div>
  );
}
