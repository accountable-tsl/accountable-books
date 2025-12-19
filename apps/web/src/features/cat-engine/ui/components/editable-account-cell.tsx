import { useMemo } from 'react';

import { useSession } from '@/app/session';
import { AutocompleteDropdown } from '@/components/AutocompleteDropdown';
import { useChartOfAccountsQuery } from '@/modules/accounting/chart-of-accounts';

interface EditableAccountCellProps {
  coaId?: string;
  coaName?: string;
}

// Define the order for account elements
const accountElementOrder: string[] = [
  'revenue',
  'contra_revenue',
  'cost_of_sales',
  'other_income',
  'operating_expenses',
  'non_operating_expenses',
  'current_asset',
  'non_current_asset',
  'contra_asset',
  'non_current_liabilities',
  'current_liabilities',
  'contra_liabilities',
  'contributed_capital',
  'reserves',
  'other_equity',
];

export function EditableAccountCell({
  coaId,
  coaName,
}: EditableAccountCellProps) {
  const { companyId, loading } = useSession();
  const { data: coaData, isLoading } = useChartOfAccountsQuery({
    companyId: companyId || '',
    active: true,
    includeDeleted: false,
  });

  const groupedItems = useMemo(() => {
    if (!coaData) return [];

    const groups = new Map();

    coaData.forEach((c) => {
      const key = c.accountElementKey || 'ungrouped';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push({
        label: c.name,
        value: c.id,
        accountElementKey: c.accountElementKey,
        accountElementLabel: c.accountElementLabel,
        parentElementKey: c.parentAccountElementKey,
      });
    });

    return Array.from(groups.entries())
      .map(([key, items]) => ({
        id: key,
        label: items[0].accountElementLabel || key,
        items,
      }))
      .sort((a, b) => {
        const priA = accountElementOrder.indexOf(a.id);
        const priB = accountElementOrder.indexOf(b.id);
        if (priA === -1 && priB === -1) return a.id.localeCompare(b.id);
        if (priA === -1) return 1;
        if (priB === -1) return -1;
        return priA - priB;
      });
  }, [coaData]);

  if (isLoading || loading) {
    return <div>{coaName || 'Loading...'}</div>;
  }

  return (
    <div>
      <AutocompleteDropdown
        id="cat-engine-coa-list"
        value={coaId || ''}
        items={[]} // Empty since we're using groups
        variant={'ghost'}
        className="!px-0 font-normal focus-visible:ring-0"
        groups={groupedItems}
        chevron="down"
      />
    </div>
  );
}
