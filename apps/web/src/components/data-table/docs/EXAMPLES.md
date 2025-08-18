# DataTable Examples

This document showcases progressively advanced usage of the `DataTable` and `useDataTable` hook.
Each section builds on the last — from basic setups to interactive, dynamic rows.

## 🟢 Basic Table

Render a table with columns, sorting, and no frills:

```tsx
const { table } = useDataTable({
  data: users,
  columns: columns,
});

return <DataTable table={table} />;
```

## 🔍 With Toolbar (Search + View Options)

```tsx
const { table } = useDataTable({
  data: users,
  columns: getUserColumns(),
});

return (
  <DataTable table={table}>
    <DataTableToolbar table={table} />
  </DataTable>
);
```

## ✅ Row Selection with Checkboxes

```tsx
const { table } = useDataTable({
  data: users,
  columns: getUserColumns(),
  customOptions: {
    rowSelection: { addCheckboxes: true },
  },
});
```

## ⚡ Virtualized Table (for large datasets)

```tsx
const { table } = useDataTable({
  data: bigData,
  columns: getBigColumns(),
  customOptions: {
    virtualization: { enabled: true },
  },
});
```

## 🪄 Row Click Navigation

```tsx
const { table } = useDataTable({
  data: invoices,
  columns: getInvoiceColumns(),
  customOptions: {
    onRowClick: (row) => router.push(`/invoices/${row.original.id}`),
  },
});
```

## 🧾 Row View Mode (open sheet/dialog)

```tsx
const { table } = useDataTable({
  data: users,
  columns: getUserColumns(),
  customOptions: {
    rowView: {
      enabled: true,
      renderView: (row) => <UserSheet user={row.original} />,
    },
  },
});
```

## 🧠 Advanced Row Click Handling

By default, rows can open a viewer sheet (`rowView`). But you can override or fine-tune row click behavior in several ways depending on your use case.

### ✅ Option 1: Override row click entirely

Use the `onRowClick` handler in `useDataTable` to define custom behavior:

```tsx
const { table } = useDataTable({
  data,
  columns,
  customOptions: {
    onRowClick: (row) => {
      router.push(`/accounts/${row.original.id}`); // or window.open(...)
    },
  },
});
```

> When `onRowClick` is provided, it overrides default `rowView` behavior.

---

### ✅ Option 2: Disable row click/viewer altogether

If you don't want row clicking to do anything unless explicitly handled inside cells:

```ts
rowView: {
  enabled: false;
}
```

This gives you complete freedom to define your own interactions.

---

### ✅ Option 3: Prevent row click for specific cell content

If you're rendering a button, link, or menu inside a cell and want to stop it from triggering the row click:

```tsx
<a
  href="/somewhere"
  target="_blank"
  rel="noopener noreferrer"
  onClick={(e) => {
    e.preventDefault();
    e.stopPropagation(); // Stop row click
    window.open('/somewhere', '_blank');
  }}
>
  Open
</a>
```

---

### ✅ Option 4: Use `[data-no-row-click]` to mark elements

Any element with the `data-no-row-click` attribute will be ignored by the row click logic:

```tsx
<a href="/somewhere" target="_blank" data-no-row-click>
  Open page
</a>
```

Your internal handler already supports this via the `isClickInsideExcludedElement` utility. It ensures that clicking on the link won't trigger `onRowClick` or `rowView`.

---

### Recap

| Scenario                             | What to do                                       |
| ------------------------------------ | ------------------------------------------------ |
| Fully custom navigation on row click | Use `onRowClick`                                 |
| Disable all row clicks               | Set `rowView.enabled = false`                    |
| Prevent row click for part of a cell | Use `e.stopPropagation()` or `data-no-row-click` |
