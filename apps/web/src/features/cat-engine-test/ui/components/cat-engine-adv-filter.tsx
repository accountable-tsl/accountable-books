import type { GroupedTransactionOld as GroupedTransaction } from '@/modules/accounting/categorization';
import type { BankAccountWithMeta } from '@/modules/banking/accounts';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Filter, X } from 'lucide-react';

import { ToggleButton } from './toggle-button';

export interface AdvancedFilters {
  amountMin?: number;
  amountMax?: number;
  confidenceMin?: number;
  confidenceMax?: number;
  contactId?: string;
  bankAccountId?: string;
  searchText?: string;
}

interface CatEngineAdvFilterProps {
  filters: AdvancedFilters;
  onFiltersChange: (filters: AdvancedFilters) => void;
  transactions: GroupedTransaction[];
  bankAccounts: BankAccountWithMeta[];
}

export function CatEngineAdvFilter({
  filters,
  onFiltersChange,
  transactions,
  bankAccounts,
}: CatEngineAdvFilterProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Get unique contacts from transactions
  const contacts = useMemo(() => {
    const contactMap = new Map<string, { id: string; name: string }>();
    transactions.forEach((txn) => {
      txn.lines.forEach((line) => {
        if (line.contact_id && line.contact_name) {
          contactMap.set(line.contact_id, {
            id: line.contact_id,
            name: line.contact_name,
          });
        }
      });
    });
    return Array.from(contactMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [transactions]);

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.amountMin !== undefined && filters.amountMin !== null) count++;
    if (filters.amountMax !== undefined && filters.amountMax !== null) count++;
    if (filters.confidenceMin !== undefined && filters.confidenceMin !== null)
      count++;
    if (filters.confidenceMax !== undefined && filters.confidenceMax !== null)
      count++;
    if (filters.contactId) count++;
    if (filters.bankAccountId) count++;
    if (filters.searchText) count++;
    return count;
  }, [filters]);

  const handleFilterChange = (key: keyof AdvancedFilters, value: any) => {
    onFiltersChange({
      ...filters,
      [key]: value === '' || value === undefined ? undefined : value,
    });
  };

  const handleClearAll = () => {
    onFiltersChange({});
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <div className="relative">
          <ToggleButton
            icon={<Filter className="h-4 w-4" />}
            tooltip="Advanced Filters"
            active={activeFilterCount > 0}
            activeClasses="p-1.5"
            ariaLabel="Open advanced filters"
          />
          {activeFilterCount > 0 && (
            <Badge
              variant="default"
              className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center px-1 text-[10px]"
            >
              {activeFilterCount}
            </Badge>
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Advanced Filters</h3>
            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearAll}
                className="h-7 text-xs"
              >
                <X className="mr-1 h-3 w-3" />
                Clear All
              </Button>
            )}
          </div>

          <Separator />

          {/* Text Search */}
          <div className="space-y-2">
            <Label htmlFor="search-text" className="text-xs">
              Search
            </Label>
            <Input
              id="search-text"
              placeholder="Description or reference..."
              value={filters.searchText || ''}
              onChange={(e) => handleFilterChange('searchText', e.target.value)}
              className="h-8 text-sm"
            />
          </div>

          {/* Amount Range */}
          <div className="space-y-2">
            <Label className="text-xs">Amount Range</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                placeholder="Min"
                value={filters.amountMin?.toString() || ''}
                onChange={(e) =>
                  handleFilterChange(
                    'amountMin',
                    e.target.value ? parseFloat(e.target.value) : undefined,
                  )
                }
                className="h-8 text-sm"
              />
              <span className="text-muted-foreground text-xs">to</span>
              <Input
                type="number"
                placeholder="Max"
                value={filters.amountMax?.toString() || ''}
                onChange={(e) =>
                  handleFilterChange(
                    'amountMax',
                    e.target.value ? parseFloat(e.target.value) : undefined,
                  )
                }
                className="h-8 text-sm"
              />
            </div>
          </div>

          {/* Confidence Range */}
          <div className="space-y-2">
            <Label className="text-xs">Confidence Range (%)</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="0"
                max="100"
                placeholder="Min"
                value={filters.confidenceMin?.toString() || ''}
                onChange={(e) =>
                  handleFilterChange(
                    'confidenceMin',
                    e.target.value
                      ? Math.min(100, Math.max(0, parseFloat(e.target.value)))
                      : undefined,
                  )
                }
                className="h-8 text-sm"
              />
              <span className="text-muted-foreground text-xs">to</span>
              <Input
                type="number"
                min="0"
                max="100"
                placeholder="Max"
                value={filters.confidenceMax?.toString() || ''}
                onChange={(e) =>
                  handleFilterChange(
                    'confidenceMax',
                    e.target.value
                      ? Math.min(100, Math.max(0, parseFloat(e.target.value)))
                      : undefined,
                  )
                }
                className="h-8 text-sm"
              />
            </div>
          </div>

          {/* Contact Filter */}
          <div className="space-y-2">
            <Label htmlFor="contact-filter" className="text-xs">
              Contact
            </Label>
            <Select
              value={filters.contactId || '__all__'}
              onValueChange={(value) =>
                handleFilterChange(
                  'contactId',
                  value === '__all__' ? undefined : value,
                )
              }
            >
              <SelectTrigger id="contact-filter" className="h-8 text-sm">
                <SelectValue placeholder="All contacts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All contacts</SelectItem>
                {contacts.map((contact) => (
                  <SelectItem key={contact.id} value={contact.id}>
                    {contact.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Bank Account Filter */}
          <div className="space-y-2">
            <Label htmlFor="bank-account-filter" className="text-xs">
              Bank Account
            </Label>
            <Select
              value={filters.bankAccountId || '__all__'}
              onValueChange={(value) =>
                handleFilterChange(
                  'bankAccountId',
                  value === '__all__' ? undefined : value,
                )
              }
            >
              <SelectTrigger id="bank-account-filter" className="h-8 text-sm">
                <SelectValue placeholder="All accounts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All accounts</SelectItem>
                {bankAccounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.displayName} ({account.currencyCode})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
