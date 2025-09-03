import { PlaidWidget } from '../providers/plaid-widget';
import { MonoWidget } from '../providers/mono-widget';

interface ProviderWidgetProps {
  provider: string;
  token: string;
  onSuccess: (token: string, metadata?: any) => void;
  onExit?: () => void;
  onError?: (error: any) => void;
}

export function ProviderWidget({
  provider,
  token,
  onSuccess,
  onExit,
  onError,
}: ProviderWidgetProps) {
  if (provider === 'plaid') {
    return (
      <PlaidWidget linkToken={token} onSuccess={onSuccess} onExit={onExit} onError={onError} />
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
