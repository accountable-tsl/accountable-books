import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { CountryDisplay } from '../utils/country-operations';

type CountryListItemProps = {
  country: CountryDisplay;
  onClick?: (country: CountryDisplay) => void;
  className?: string;
};

export function CountryListItem({ country, onClick, className }: CountryListItemProps) {
  const handleClick = () => {
    onClick?.(country);
  };

  return (
    <div
      className={cn(
        'p-3 cursor-pointer hover:shadow-md transition-shadow border rounded-lg',
        'active:bg-muted/40 active:border-muted-foreground/50',
        !country.isSupported && 'opacity-60 hover:opacity-80',
        className,
      )}
      onClick={handleClick}
    >
      <div className="flex items-center gap-3">
        <span className="text-lg">{country.flag}</span>
        <span className="text-sm font-medium">{country.name}</span>
        <Badge variant={country.isSupported ? 'outline' : 'secondary'} className="text-xs ml-auto">
          {country.isSupported ? 'Available' : 'Coming Soon'}
        </Badge>
      </div>
    </div>
  );
}
