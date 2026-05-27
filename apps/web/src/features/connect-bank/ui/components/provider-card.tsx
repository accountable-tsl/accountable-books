import type { BankProvider } from '@/modules/banking/providers';
import { Button } from '@/components/ui/button';

interface ProviderCardProps {
  provider: BankProvider;
  onSelect: (provider: BankProvider) => void;
}

export function ProviderCard({ provider, onSelect }: ProviderCardProps) {
  return (
    <div className="hover:border-primary/50 cursor-pointer rounded-lg border transition-all hover:shadow-md">
      <div className="p-4">
        <div className="flex items-center gap-4">
          <img
            src={provider.logo}
            alt={`${provider.name} logo`}
            className="bg-muted dark:bg-muted-foreground h-12 w-12 rounded-lg object-contain p-2"
          />

          <div className="flex-1">
            <h3 className="text-lg font-semibold">{provider.name}</h3>
            <p className="text-muted-foreground text-sm">
              Secure banking connection
            </p>
          </div>
        </div>

        <Button className="mt-4 w-full" onClick={() => onSelect(provider)}>
          Connect with {provider.name}
        </Button>
      </div>
    </div>
  );
}
