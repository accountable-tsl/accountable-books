import { Button } from '@/components/ui/button';
import type { BankProvider } from '../utils/providers';

interface ProviderCardProps {
  provider: BankProvider;
  onSelect: (provider: BankProvider) => void;
}

export function ProviderCard({ provider, onSelect }: ProviderCardProps) {
  return (
    <div className="cursor-pointer transition-all hover:shadow-md border rounded-lg hover:border-primary/50">
      <div className="p-4">
        <div className="flex items-center gap-4">
          <img
            src={provider.logo}
            alt={`${provider.name} logo`}
            className="w-12 h-12 rounded-lg object-contain p-2 bg-muted dark:bg-muted-foreground"
          />

          <div className="flex-1">
            <h3 className="font-semibold text-lg">{provider.name}</h3>
            <p className="text-sm text-muted-foreground">Secure banking connection</p>
          </div>
        </div>

        <Button className="w-full mt-4" onClick={() => onSelect(provider)}>
          Connect with {provider.name}
        </Button>
      </div>
    </div>
  );
}
