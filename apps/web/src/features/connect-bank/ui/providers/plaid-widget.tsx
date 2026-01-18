import { useCallback, useEffect, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';

import { Button } from '@/components/ui/button';
import { WidgetLoading } from '@/features/connect-bank/ui/components/widget-loading';
import { plaidOAuthStorage } from '@/features/connect-bank/utils/oauth-storage';

import { WidgetManualFallback } from './widget-manual-fallback';

interface PlaidWidgetProps {
  linkToken: string;
  onSuccess: (publicToken: string, metadata?: any) => void;
  onExit?: () => void;
  onError?: (error: any) => void;
  // OAuth state props
  userId?: string;
  companyId?: string;
  countryCode: string;
}

export function PlaidWidget({
  linkToken,
  onSuccess,
  onExit,
  onError,
  userId,
  companyId,
  countryCode,
}: PlaidWidgetProps) {
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

  // Auto-open Plaid Link when ready and save OAuth state
  useEffect(() => {
    if (ready && !error) {
      // Save OAuth state before opening Link (needed for OAuth institutions)
      // This won't affect non-OAuth institutions but ensures we can handle OAuth redirects
      if (userId && companyId && linkToken) {
        plaidOAuthStorage.save({
          linkToken,
          companyId,
          userId,
          provider: 'plaid',
          countryCode,
          returnUrl: window.location.href, // Store current URL to return to after OAuth
        });
      }

      open();
    }
  }, [ready, open, error, linkToken, companyId, userId, countryCode]);

  const handleClick = () => {
    if (ready) {
      // Save OAuth state before manually opening Link
      if (userId && companyId && linkToken && countryCode) {
        plaidOAuthStorage.save({
          linkToken,
          companyId,
          userId,
          provider: 'plaid',
          countryCode,
          returnUrl: window.location.href,
        });
      }

      open();
    }
  };

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4">
        <p className="text-sm text-red-800">
          Error loading Plaid Link. Please try again.
        </p>
        <Button
          onClick={handleClick}
          disabled={!ready}
          className="mt-2"
          variant="outline"
        >
          Retry
        </Button>
      </div>
    );
  }

  if (!ready || !linkToken) {
    return <WidgetLoading />;
  }

  return <WidgetManualFallback onOpenClick={handleClick} />;
}
