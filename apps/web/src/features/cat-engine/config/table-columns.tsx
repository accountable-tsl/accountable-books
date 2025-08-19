import type { ColumnDef } from '@tanstack/react-table';

export const getCatEngineColumns = (): ColumnDef<any>[] => {
  return [
    {
      header: 'Bank',
    },
    { header: 'Date' },
    { header: 'Description' },
    { header: 'FS Date' },
    { header: 'Contact' },
    { header: 'Reference' },
    { header: 'Project' },
    { header: 'Curr' },
    { header: 'Bank Amount' },
    { header: 'Exr' },
    { header: 'Spent' },
    { header: 'Received' },
    { header: 'Account' },
    {
      header: 'Confidence',
      meta: { label: 'Confidence', hidden: true },
    },
  ];
};
