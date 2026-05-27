import { Button } from '@/components/ui/button';

export function WidgetManualFallback({
  onOpenClick,
}: {
  onOpenClick: () => void;
}) {
  return (
    <div className="space-y-4 text-center">
      <div>
        <h3 className="mb-2 text-lg font-semibold">
          Opening Bank Connection...
        </h3>
        <p className="text-muted-foreground mb-4 text-sm">
          The secure banking interface will open automatically. If it doesn't
          appear, click below.
        </p>
      </div>

      <Button
        onClick={onOpenClick}
        className="w-full"
        size="lg"
        variant="outline"
      >
        Open Bank Connection
      </Button>

      <div className="text-muted-foreground text-xs">
        Your credentials are encrypted and secure
      </div>
    </div>
  );
}
