import { type DataTableToolbarConfig } from './types';

export const DEFAULT_CONFIG: DataTableToolbarConfig = {
  layout: {
    left: [
      { type: 'search', position: 1, show: true },
      { type: 'filters', position: 2, show: true },
      { type: 'reset', position: 3, show: true },
    ],
    right: [{ type: 'viewOptions', position: 1, show: true }],
  },
};
