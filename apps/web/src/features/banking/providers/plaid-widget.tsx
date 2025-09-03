import { useCallback, useEffect, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { Button } from '@/components/ui/button';
import { Loader } from 'lucide-react';

interface PlaidWidgetProps {
  linkToken: string;
  onSuccess: (publicToken: string, metadata?: any) => void;
  onExit?: () => void;
  onError?: (error: any) => void;
}

export function PlaidWidget({ linkToken, onSuccess, onExit, onError }: PlaidWidgetProps) {
  const [_isReady, setIsReady] = useState(false);

  const onSuccessCallback = useCallback(
    (publicToken: string, metadata: any) => {
      onSuccess(publicToken, metadata);
    },
    [onSuccess],
  );

  const onExitCallback = useCallback(() => {
    onExit?.();
  }, [onExit]);

  const onErrorCallback = useCallback(
    (error: any) => {
      onError?.(error);
    },
    [onError],
  );

  const config = {
    token: linkToken,
    onSuccess: onSuccessCallback,
    onExit: onExitCallback,
    onError: onErrorCallback,
    onLoad: () => setIsReady(true),
  };

  const { open, ready, error } = usePlaidLink(config);

  // Auto-open Plaid Link when ready
  useEffect(() => {
    if (ready && !error) {
      open();
    }
  }, [ready, open, error]);

  const handleClick = () => {
    if (ready) {
      open();
    }
  };

  if (error) {
    return (
      <div className="p-4 border border-red-200 rounded-md bg-red-50">
        <p className="text-red-800 text-sm">Error loading Plaid Link. Please try again.</p>
        <Button onClick={handleClick} disabled={!ready} className="mt-2" variant="outline">
          Retry
        </Button>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="space-y-4 text-center">
        <div className="flex items-center justify-center">
          <Loader className="w-6 h-6 mr-2 animate-spin text-blue-600" />
          <span className="text-lg font-semibold">Preparing secure connection...</span>
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

  return (
    <div className="space-y-4 text-center">
      <div>
        <h3 className="text-lg font-semibold mb-2">Opening Bank Connection...</h3>
        <p className="text-muted-foreground text-sm mb-4">
          The secure banking interface will open automatically. If it doesn't appear, click below.
        </p>
      </div>

      <Button onClick={handleClick} className="w-full" size="lg" variant="outline">
        Open Bank Connection
      </Button>

      <div className="text-xs text-muted-foreground">Your credentials are encrypted and secure</div>
    </div>
  );
}
