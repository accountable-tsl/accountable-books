import type { ColumnDef } from '@tanstack/react-table';
import { Text } from 'lucide-react';

import type { Account } from './seed';

export function getAccountColumns(): ColumnDef<Account>[] {
  return [
    {
      accessorKey: 'accountCode',
      header: 'Code',
      meta: {
        label: 'Code',
        placeholder: 'Search code',
        variant: 'text',
        icon: Text,
      },
      enableColumnFilter: true,
    },
    {
      accessorKey: 'accountName',
      header: 'Name',
      enableSorting: true,
      meta: {
        label: 'Account Name',
        placeholder: 'Search account name',
        variant: 'text',
        icon: Text,
      },
      enableColumnFilter: true,
    },
    {
      accessorKey: 'accountType',
      header: 'Type',
      enableSorting: true,
    },
    {
      accessorKey: 'currency',
      header: 'Currency',
    },
    {
      accessorKey: 'currentBalance',
      header: 'Balance',
    },
  ];
}
