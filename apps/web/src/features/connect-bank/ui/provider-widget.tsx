import { useEffect, useState } from 'react';
import { WidgetLoading } from '@/features/connect-bank/ui/components/widget-loading';
import { MonoWidget } from '@/features/connect-bank/ui/providers/mono-widget';
import { PlaidWidget } from '@/features/connect-bank/ui/providers/plaid-widget';

interface ProviderWidgetProps {
  provider: string;
  token: string;
  onSuccess: (token: string, metadata?: any) => void;
  onLoad?: () => void;
  onExit?: () => void;
  onError?: (error: any) => void;
  // Session context for OAuth state
  companyId?: string;
  countryCode: string;
  user: { id: string; name: string; email: string };
}

export function ProviderWidget({
  provider,
  token,
  onSuccess,
  onLoad,
  onExit,
  onError,
  user,
  companyId,
  countryCode,
}: ProviderWidgetProps) {
  const [minDelayElapsed, setMinDelayElapsed] = useState(false);

  useEffect(() => {
    const timerId = setTimeout(() => setMinDelayElapsed(true), 2000);
    return () => clearTimeout(timerId);
  }, []);

  // Always show loading for at least 2 seconds for all providers
  if (!minDelayElapsed) {
    return <WidgetLoading />;
  }

  if (provider === 'plaid' && !token) {
    return <WidgetLoading />;
  }

  if (provider === 'plaid') {
    return (
      <PlaidWidget
        linkToken={token}
        onSuccess={onSuccess}
        onExit={onExit}
        onError={onError}
        userId={user?.id}
        companyId={companyId}
        countryCode={countryCode}
      />
    );
  }

  if (provider === 'mono') {
    return (
      <MonoWidget
        onSuccess={onSuccess}
        onLoad={onLoad}
        onClose={onLoad}
        customer={{ name: user.name, email: user.email }}
      />
    );
  }

  return (
    <div className="rounded-md border border-red-200 bg-red-50 p-4">
      <p className="text-sm text-red-800">Unsupported provider: {provider}</p>
    </div>
  );
}
