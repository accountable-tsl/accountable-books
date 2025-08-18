# DataTable Component

A flexible, highly composable, and fuly-featured data table built on top of [`@tanstack/react-table`](https://tanstack.com/table/latest), using `shadcn/ui` components and custom primitives for maximum control.

### 🔍 Features at a Glance

- **Virtualization** (via `react-virtual`) with graceful fallback
- **Global search** with customizable scope
- **Row selection** (single & multi)
- **Row viewing** (sheet or dialog, configurable trigger & render)
- **Controlled/Uncontrolled visibility** and filter state
- **Sorting & pagination**, disabled automatically when using virtualization
- **Developer ergonomics**, use sensible defaults, override when needed
- **Composable configuration** through a single `customOptions` object

## 🧩 Core Concepts

This table system is centered around two pieces:

1. `useDataTable`: a hook that wraps TanStack Table and extends it with powerful features (search, selection, row viewing, etc.)
2. `DataTable`: a render layer that consumes the hook's output and handles UI.

## 🔧 Basic Usage

The simplest usage involves three steps:

1. Define your column definitions (same as TanStack table, with optional custom inputs via the meta field)
2. Use the `useDataTable` hook to create your table instance
3. Render the `DataTable` component with the returned table

Here's a simple example of how to get up and running:

```jsx
import { useDataTable, DataTable } from '@/components/data-table';
import { getAccountColumns } from './columns';
import coaData from './mockData.json';

export function Table() {
  const tableOptions = {
    rowSelection: { addCheckboxes: true },
  };

  const { table } = useDataTable({
    data: coaData,
    columns: getAccountColumns(),
    customOptions: tableOptions,
  });

  return <DataTable table={table} />;
}
```

## Defining Columns

Your column definitions follow the same structure as TanStack Table, with optional support for UI config via the meta field:

```tsx
export function getAccountColumns(): ColumnDef<Account>[] {
  return [
    {
      accessorKey: 'accountCode',
      header: 'Code',
      meta: {
        label: 'Code',
        placeholder: 'Search code',
        variant: 'text', // text | select | custom
        icon: Text,
      },
      enableColumnFilter: true,
    },
    {
      accessorKey: 'accountType',
      header: 'Type',
      enableSorting: true,
    },
  ];
}
```

You can customize things like:

- Labels
- Search variants (text/select/custom)
- Icons (e.g., from Lucide)
- Filterability

### 🧪 More Examples

- For progressively advanced use-cases like:
- Enabling row viewing via sheets or dialogs
- Navigating on row click
- Virtualized + paginated hybrid configs
- Adding inline actions
  See [docs/EXAMPLES.md](./EXAMPLES.md)

## 📚 Features Summary

| Feature         | Status | Notes                                            |
| --------------- | ------ | ------------------------------------------------ |
| Column Filters  | ✅     | Fully customizable with `meta`                   |
| Row Selection   | ✅     | Multi/single, optional checkboxes                |
| Row Viewing     | ✅     | Sheet/dialog with pluggable renderer             |
| Pagination      | ✅     | Automatically disabled when virtualization is on |
| Virtualization  | ✅     | Uses `react-virtual`, smart defaults             |
| Global Search   | ✅     | Optional field scoping                           |
| Sorting         | ✅     | Controlled or default                            |
| Linking on Row  | ✅     | Easily add with `onRowClick` override            |
| Toolbar Actions | ✅     | Add buttons/search/filters in `DataTableToolbar` |

## 🧰 Customization

The customOptions object passed into useDataTable() enables full control of behaviors.

More details on configuration coming soon.
