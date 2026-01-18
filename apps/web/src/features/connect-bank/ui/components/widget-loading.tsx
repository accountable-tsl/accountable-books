import { Loader } from 'lucide-react';

export function WidgetLoading() {
  return (
    <div className="space-y-4 text-center">
      <div className="flex items-center justify-center">
        <Loader className="mr-2 h-6 w-6 animate-spin text-blue-600" />
        <span className="text-lg font-semibold">
          Preparing secure connection...
        </span>
      </div>
      <p className="text-muted-foreground text-sm">
        Please wait while we set up your bank connection
      </p>
      <div className="text-muted-foreground text-xs">
        Your credentials are encrypted and secure
      </div>
    </div>
  );
}
