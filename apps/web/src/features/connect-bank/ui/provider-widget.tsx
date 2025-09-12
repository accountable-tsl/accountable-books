import { PlaidWidget } from '@/features/connect-bank/ui/providers/plaid-widget';
import { MonoWidget } from '@/features/connect-bank/ui/providers/mono-widget';
import { WidgetLoading } from '@/features/connect-bank/ui/components/widget-loading';

interface ProviderWidgetProps {
  provider: string;
  token: string;
  onSuccess: (token: string, metadata?: any) => void;
  onExit?: () => void;
  onError?: (error: any) => void;
  // Session context for OAuth state
  userId?: string;
  companyId?: string;
}

export function ProviderWidget({
  provider,
  token,
  onSuccess,
  onExit,
  onError,
  userId,
  companyId,
}: ProviderWidgetProps) {
  if (!token) {
    return <WidgetLoading />;
  }
  if (provider === 'plaid') {
    return (
      <PlaidWidget
        linkToken={token}
        onSuccess={onSuccess}
        onExit={onExit}
        onError={onError}
        userId={userId}
        companyId={companyId}
      />
    );
  }

  if (provider === 'mono') {
    return <MonoWidget config={token} onSuccess={onSuccess} onClose={onExit} />;
  }

  return (
    <div className="p-4 border border-red-200 rounded-md bg-red-50">
      <p className="text-red-800 text-sm">Unsupported provider: {provider}</p>
    </div>
  );
}
