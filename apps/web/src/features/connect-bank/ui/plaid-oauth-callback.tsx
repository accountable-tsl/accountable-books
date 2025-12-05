import { useCallback, useEffect, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { CenteredLoader } from '@/components/CenteredLoader';
import { Button } from '@/components/ui/button';
import { useConnectAccounts } from '@/modules/banking/connections';

import { plaidOAuthStorage } from '../utils/oauth-storage';

interface OAuthState {
  linkToken: string;
  companyId: string;
  userId: string;
  provider: string;
  countryCode: string;
  timestamp: number;
  returnUrl?: string;
}

export function PlaidOAuthCallback() {
  const navigate = useNavigate();
  const [oauthState, setOauthState] = useState<OAuthState | null>(null);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isConnecting, setIsConnecting] = useState(false);

  const connectAccountsMutation = useConnectAccounts();

  // Retrieve stored OAuth state when component mounts
  useEffect(() => {
    const state = plaidOAuthStorage.retrieve();

    if (!state) {
      console.warn(
        'No valid OAuth state found, redirecting to banking connect page',
      );
      setHasError(true);
      setErrorMessage(
        'OAuth session expired or invalid. Please try connecting your bank account again.',
      );
      return;
    }

    setOauthState(state);
  }, []);

  // Handle successful Plaid Link completion
  const onSuccess = useCallback(
    (publicToken: string, metadata: any) => {
      if (!oauthState) {
        console.error('No OAuth state available for onSuccess');
        toast.error('Connection failed', {
          description: 'Session state was lost. Please try again.',
        });
        navigate('/');
        return;
      }

      // Prevent multiple simultaneous connection attempts
      if (isConnecting) {
        console.warn(
          'Connection already in progress, ignoring duplicate request',
        );
        return;
      }

      setIsConnecting(true);

      connectAccountsMutation.mutate(
        {
          providerKey: 'plaid',
          countryCode: oauthState.countryCode,
          publicToken,
          metadata,
          userId: oauthState.userId,
          companyId: oauthState.companyId,
        },
        {
          onSuccess: (response) => {
            // Clear OAuth state on successful connection
            plaidOAuthStorage.clear();

            if (response.success && response.data) {
              const message =
                response?.message || 'Bank account connected successfully!';
              toast.success(message);

              // Navigate back to the original banking page
              const returnPath = `/${oauthState.companyId}/banking/connect`;
              navigate(returnPath, { replace: true });
            } else {
              throw new Error('Connection response was not successful');
            }
          },
          onError: (error: any) => {
            plaidOAuthStorage.clear();
            setIsConnecting(false);

            const errorData = error.response?.data?.error;
            const message =
              errorData?.displayMessage ||
              errorData?.message ||
              'Connection failed';

            console.error('Bank connection error:', error);
            toast.error('Failed to connect bank account', {
              description: message,
            });

            // Navigate back to banking connect page
            navigate(`/${oauthState.companyId}/banking/connect`, {
              replace: true,
            });
          },
        },
      );
    },
    [oauthState, connectAccountsMutation, navigate],
  );

  // Handle Plaid Link exit (user cancelled or error)
  const onExit = useCallback(
    (error?: any) => {
      plaidOAuthStorage.clear();

      if (error) {
        console.error('Plaid Link exit with error:', error);
        toast.error('Connection cancelled', {
          description:
            error.display_message || 'The bank connection was cancelled.',
        });
      }

      // Navigate back to the original page or banking connect
      const returnPath =
        oauthState?.returnUrl ||
        `/${oauthState?.companyId || ''}/banking/connect`;
      navigate(returnPath, { replace: true });
    },
    [oauthState, navigate],
  );

  // Handle Plaid Link errors
  const onError = useCallback(
    (error: any) => {
      console.error('Plaid Link error:', error);
      plaidOAuthStorage.clear();

      toast.error('Connection error', {
        description:
          error.display_message ||
          'An error occurred while connecting your bank account.',
      });

      navigate(`/${oauthState?.companyId || ''}/banking/connect`, {
        replace: true,
      });
    },
    [oauthState, navigate],
  );

  // Configure Plaid Link with receivedRedirectUri
  const config = oauthState
    ? {
        token: oauthState.linkToken,
        receivedRedirectUri: window.location.href, // Full URL with OAuth state parameter from Plaid
        onSuccess,
        onExit,
        onError,
      }
    : null;

  const {
    open,
    ready,
    error: plaidError,
  } = usePlaidLink(
    config || {
      token: '',
      onSuccess: () => {},
      onExit: () => {},
    },
  );

  // Auto-open Plaid Link when ready (reinitialize after OAuth)
  useEffect(() => {
    if (ready && oauthState && !isConnecting && !hasError) {
      console.log('Reinitializing Plaid Link after OAuth redirect');
      open();
    }
  }, [ready, oauthState, open, isConnecting, hasError]);

  // Handle Plaid SDK errors
  useEffect(() => {
    if (plaidError) {
      console.error('Plaid SDK error:', plaidError);
      setHasError(true);
      setErrorMessage(
        'Failed to initialize bank connection. Please try again.',
      );
    }
  }, [plaidError]);

  // Show error state
  if (hasError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="text-red-600 text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-semibold text-gray-900">
            Connection Failed
          </h1>
          <p className="text-gray-600">{errorMessage}</p>
          <div className="space-y-2">
            <Button
              onClick={() => {
                plaidOAuthStorage.clear();
                navigate('/banking/connect');
              }}
              className="w-full"
            >
              Try Again
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                plaidOAuthStorage.clear();
                navigate('/');
              }}
              className="w-full"
            >
              Go Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Show loading state while waiting for OAuth state or Plaid Link to be ready
  if (!oauthState || !ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <CenteredLoader />
          <div className="max-w-sm">
            <h2 className="text-xl font-semibold mb-2">
              Completing Bank Connection
            </h2>
            <p className="text-muted-foreground text-sm">
              Please wait while we finalize your bank account connection...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Show connecting state during account connection process
  if (isConnecting) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <div className="max-w-sm">
            <h2 className="text-xl font-semibold mb-2">Connecting Account</h2>
            <p className="text-muted-foreground text-sm">
              Saving your bank account details securely...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // This should not be reached in normal flow, but provides fallback
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="animate-pulse h-12 w-12 bg-gray-200 rounded-full mx-auto"></div>
        <p className="text-muted-foreground">Initializing bank connection...</p>
      </div>
    </div>
  );
}
