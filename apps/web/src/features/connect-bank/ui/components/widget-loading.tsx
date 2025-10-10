import { Loader } from 'lucide-react';

export function WidgetLoading() {
  return (
    <div className="space-y-4 text-center">
      <div className="flex items-center justify-center">
        <Loader className="w-6 h-6 mr-2 animate-spin text-blue-600" />
        <span className="text-lg font-semibold">
          Preparing secure connection...
        </span>
      </div>
      <p className="text-muted-foreground text-sm">
        Please wait while we set up your bank connection
      </p>
      <div className="text-xs text-muted-foreground">
        Your credentials are encrypted and secure
      </div>
    </div>
  );
}
