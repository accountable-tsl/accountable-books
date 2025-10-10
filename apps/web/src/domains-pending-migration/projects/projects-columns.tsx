import type { ColumnDef } from '@tanstack/react-table';
import type { Project } from '@/domains-pending-migration/projects/projects-types';
import { formatDate } from '@/shared/utils/formatting-utils';

export function getProjectColumns(): ColumnDef<Project>[] {
  return [
    {
      id: 'code',
      accessorKey: 'code',
      header: 'Code',
      size: 100,
    },
    {
      id: 'name',
      accessorKey: 'name',
      header: 'Project Name',
    },

    {
      id: 'status',
      accessorKey: 'status',
      accessorFn: (row) => {
        const status =
          row.status === 'in_draft'
            ? 'Draft'
            : row.status === 'in_progress'
              ? 'In Progress'
              : row.status === 'on_hold'
                ? 'On Hold'
                : row.status === 'completed'
                  ? 'Completed'
                  : row.status === 'cancelled'
                    ? 'Cancelled'
                    : '';
        return String(status);
      },
      header: 'Status',
      size: 120,
      minSize: 120,
      maxSize: 120,
    },
    {
      id: 'contactId',
      accessorKey: 'contactName',
      header: 'Contact',
      cell: (props) => {
        const contactName = props.getValue();
        return (
          <div className="text-muted-foreground">
            {contactName ? String(contactName) : ''}
          </div>
        );
      },
    },
    {
      id: 'startDate',
      accessorKey: 'startDate',
      accessorFn: (row) => {
        return row.startDate
          ? formatDate(new Date(row.startDate), 'dd MMM yyyy')
          : '';
      },
      header: 'Start Date',
      size: 120,
      minSize: 120,
      maxSize: 120,
    },
    {
      id: 'endDate',
      accessorKey: 'endDate',
      accessorFn: (row) => {
        return row.startDate
          ? formatDate(new Date(row.startDate), 'dd MMM yyyy')
          : '';
      },
      header: 'End Date',
      size: 120,
      minSize: 120,
      maxSize: 120,
    },
    {
      id: 'description',
      accessorKey: 'description',
      header: 'Description',
    },
  ];
}
