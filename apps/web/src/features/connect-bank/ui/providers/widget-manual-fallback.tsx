import { Button } from '@/components/ui/button';

export function WidgetManualFallback({
  onOpenClick,
}: {
  onOpenClick: () => void;
}) {
  return (
    <div className="space-y-4 text-center">
      <div>
        <h3 className="text-lg font-semibold mb-2">
          Opening Bank Connection...
        </h3>
        <p className="text-muted-foreground text-sm mb-4">
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

      <div className="text-xs text-muted-foreground">
        Your credentials are encrypted and secure
      </div>
    </div>
  );
}
