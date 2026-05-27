// Toolbar-specific type definitions
import type React from 'react';

import { type CustomTable } from '../types/data-table';

export interface ToolbarClassNames {
  toolbar?: string;
  leftSection?: string;
  centerSection?: string;
  rightSection?: string;
}

export interface DataTableToolbarProps<TData>
  extends React.HTMLAttributes<HTMLDivElement> {
  table: CustomTable<TData>;
  children?: React.ReactNode;
  showViewOptions?: boolean;
  config?: DataTableToolbarConfig;
}

export type ToolbarItemType =
  | 'search'
  | 'filters'
  | 'reset'
  | 'viewOptions'
  | 'custom';

export type ToolbarSection = 'left' | 'center' | 'right';

export interface ToolbarItem<Props = any> {
  type: ToolbarItemType;
  position: number;
  component?: React.ComponentType<Props>;
  props?: Props;
  key?: string; // For handling duplicates
  show?: boolean | (() => boolean); // Conditional rendering
  mobile?: {
    position?: number;
    section?: ToolbarSection;
    hide?: boolean;
  };
}

export interface ToolbarSectionConfig {
  left?: ToolbarItem[];
  center?: ToolbarItem[];
  right?: ToolbarItem[];
}

export interface DataTableToolbarConfig {
  layout: ToolbarSectionConfig;

  // Global overrides for default behavior
  defaults?: {
    showSearch?: boolean;
    showFilters?: boolean;
    showReset?: boolean;
    showViewOptions?: boolean;
  };

  classNames?: ToolbarClassNames;
}
