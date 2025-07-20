# DataTableToolbar Guide

A flexible, highly-configurable toolbar for TanStack-based data tables. Supports global search, column filters, view options, custom actions, and full layout control.

---

## 🚀 Basic Usage

```tsx
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";

<DataTableToolbar table={table} />;
```

- **Default layout:**
  - **Left:** search, filters, reset
  - **Right:** view options

---

## ⚙️ Configuration

Use the `config` prop to customize the toolbar layout:

```tsx
const config: DataTableToolbarConfig = {
  layout: {
    left: [...],
    center: [...],
    right: [...]
  }
};

<DataTableToolbar table={table} config={config} />
```

```tsx
Config Format

const config = {
  layout: {
    left: [
      { type: "search", position: 1 },
      { type: "filters", position: 2 },
      { type: "reset", position: 3 },
    ],
    right: [{ type: "viewOptions", position: 1 }],
    center: [], // Optional
  },
  defaults: {
    showSearch: true,
    showFilters: true,
    showReset: true,
    showViewOptions: true,
  },
};

<DataTableToolbar table={table} config={config} />;
```

---

## 🧩 Toolbar Items

Each item in a section is a `ToolbarItem` and has the following structure:

```tsx
interface ToolbarItem {
  type: "search" | "filters" | "reset" | "viewOptions" | "custom";

  /* The item's position within the section */
  position: number;

  /* Required for 'custom' type */
  component?: React.Component;

  /* Props passed to the component */
  props?: Record<string, any>;

  /* Unique identifier, helps with duplicates */
  key?: string;

  /* Conditional rendering */
  show?: boolean | () => boolean;

  /* Mobile-specific overrides */
  mobile?: {
    position?: number;
    section?: 'left' | 'center' | 'right';
    hide?: boolean;
  };

}
```

**Built-in types:**

- `search` – Global search input
- `filters` – Column filter controls
- `reset` – Reset filters button
- `viewOptions` – Column visibility toggle
- `custom` – Your own component

---

## 🛠️ Common Examples

### Adding custom components

```tsx
const config = {
  layout: {
    left: [
      // Add custom button at position 3, pushes reset to position 4
      {
        type: "custom",
        position: 3,
        component: MyCustomButton,
        props: { variant: "outline", onClick: handleCustomAction },
      },
    ],
  },
};
```

### Add a Custom Button

```tsx
const config = {
  layout: {
    left: [
      { type: "search", position: 1 },
      {
        type: "custom",
        position: 2,
        component: MyCustomButton,
        props: { variant: "outline", onClick: handleCustomAction },
      },
      { type: "reset", position: 3 },
    ],
  },
};
```

### Moving Components Between Sections

```tsx
const config = {
  layout: {
    right: [
      // Add reset button to right section as second item
      {
        type: "reset",
        position: 2,
        key: "reset-right", // Unique key to avoid conflicts
      },
    ],
  },
};
```

### Use the Center Section

```tsx
const config = {
  layout: {
    center: [
      {
        type: "custom",
        position: 1,
        component: StatusIndicator,
        props: { status: "loading" },
      },
    ],
  },
};
```

### Conditional Rendering

```tsx
const config = {
  layout: {
    left: [
      {
        type: "custom",
        position: 2,
        component: AdminButton,
        show: () => user.isAdmin, //Only show for admins
      },
    ],
  },
};
```

### Disable Default Items

```tsx
const config = {
  layout: {
    left: [{ type: "search", position: 1 }], // Only search
  },

  // OR use explicit disable
  defaults: {
    showFilters: false,
    showReset: false,
  },
};
```

---

## 📱 Mobile Responsiveness

Control mobile layout with the `mobile` property:

```tsx
const config = {
  layout: {
    left: [
      { type: "search", position: 1, mobile: { position: 1, section: "left" } },
    ],
    right: [
      {
        type: "viewOptions",
        position: 1,
        mobile: { position: 2, section: "left" },
      },
    ],
  },
};
```

- `hide: true` – Hide on mobile
- `section` – Move to a different section
- `position` – Change order within section

---

## 🧑‍💻 Custom Component Requirements

Custom components receive these props:

```tsx
interface CustomComponentProps {
  table: Table<TData>;
  // ...any props you specify in config
}

const MyCustomComponent = ({ table, ...props }) => (
  <Button {...props}>Custom Action</Button>
);
```

---

## 🏁 Complete Example

```tsx
const toolbarConfig = {
  layout: {
    left: [
      { type: "search", position: 1 },
      {
        type: "custom",
        position: 2,
        component: QuickFilters,
        props: { options: filterOptions },
      },
      { type: "filters", position: 3 },
      { type: "reset", position: 4 },
    ],
    center: [
      {
        type: "custom",
        position: 1,
        component: RecordCount,
        show: () => data.length > 0,
      },
    ],
    right: [
      { type: "viewOptions", position: 1 },
      {
        type: "custom",
        position: 2,
        component: ExportButton,
        props: { format: "csv" },
        mobile: { hide: true },
      },
    ],
  },
};

<DataTableToolbar table={table} config={toolbarConfig} />;
```

---

## 📚 API Reference

| Prop              | Type                     | Description                              |
| ----------------- | ------------------------ | ---------------------------------------- |
| `table`           | `CustomTable<T>`         | (Required) The table instance            |
| `config`          | `DataTableToolbarConfig` | Toolbar layout and feature config        |
| `classNames`      | `classNames`             | Custom class names for styling           |
| `showViewOptions` | `boolean`                | Show/hide view options button            |
| `children`        | `React.ReactNode`        | Additional elements in the right section |

---

## 📝 Tips

- Use `classNames` to style toolbar sections.
- Add custom buttons/components with the `custom` type.
- Use `defaults` to enable/disable default items.
- Items are sorted by `position` (auto-increment on conflict).
- See `types.ts` for full type definitions.

---

For advanced usage, see the source code or ask for more examples!
