import type { Contacts, ContactStatus } from '@/modules/contacts/model/types';
import type { ColumnDef } from '@tanstack/react-table';
import { toTitleCase } from '@/shared/utils/formatting-utils';
import { Mail, MailX } from 'lucide-react';

export function getContactColumns(): ColumnDef<Contacts>[] {
  return [
    {
      id: 'displayName',
      accessorKey: 'displayName',
      header: 'Name',
    },
    {
      id: 'email',
      accessorKey: 'email',
      header: 'Email',
      cell: (props) => {
        const email = props.getValue();
        const toDisplay = email ? String(email).toLowerCase() : '';
        return (
          <div className="text-muted-foreground flex items-center gap-2">
            {toDisplay ? (
              <Mail className="h-3 w-3" />
            ) : (
              <MailX className="h-3 w-3" />
            )}
            <span className="text-muted-foreground">{toDisplay}</span>
          </div>
        );
      },
    },
    {
      id: 'status',
      accessorKey: 'status',
      header: 'Status',
      cell: (props) => {
        const status = props.getValue() as ContactStatus;
        const statusToDisplay = toTitleCase(status);

        return <div>{statusToDisplay}</div>;
      },
    },
  ];
}
