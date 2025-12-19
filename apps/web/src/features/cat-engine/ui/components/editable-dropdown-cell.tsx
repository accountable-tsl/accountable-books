import { Plus } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { useSession } from '@/app/session';
import { AutocompleteDropdown } from '@/components/AutocompleteDropdown';
import { AddContactDialog } from '@/features/manage-contacts/ui/components/contacts-add';
import { AddProjectDialog } from '@/features/manage-projects/ui/components/projects-add';
import { cn } from '@/lib/utils';
import { useContactsInfinite } from '@/modules/contacts';
import type { ContactResponse } from '@/modules/contacts/model/types';
import { useProjectsInfinite } from '@/modules/projects';
import type { ProjectsResponse } from '@/modules/projects/model/types';

interface EditableDropdownCellProps {
  field: 'contact' | 'project';
  contactId?: string;
  contactName?: string;
  projectId?: string;
  projectName?: string;
}

export function EditableDropdownCell({
  field,
  contactId,
  contactName: _contactName,
  projectId,
  projectName: _projectName,
}: EditableDropdownCellProps) {
  const { companyId } = useSession();
  const [search, setSearch] = useState('');
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);

  const currentId = field === 'contact' ? contactId : projectId;

  // Always call both hooks (React rules), but only use the active field's data
  // When search changes, the queryKey changes and React Query automatically resets
  const contactsQuery = useContactsInfinite({
    companyId: companyId || '',
    limit: 30,
    search: field === 'contact' && search ? search : undefined,
  });

  const projectsQuery = useProjectsInfinite({
    companyId: companyId || '',
    limit: 30,
    search: field === 'project' && search ? search : undefined,
  });

  const query = field === 'contact' ? contactsQuery : projectsQuery;

  // Flatten all pages into a single array of items
  // placeholderData ensures query.data exists during refetches (like pagination),
  // preventing the dropdown from unmounting when loading more items
  const items = useMemo(() => {
    if (!query.data?.pages) return [];

    return query.data.pages.flatMap((page) => {
      if (!page.data) return [];

      if (field === 'contact') {
        const response = page.data as ContactResponse;
        return (response.contacts || [])
          .filter((contact) => contact.id)
          .map((contact) => ({
            label: contact.displayName,
            value: contact.id,
          }));
      } else {
        const response = page.data as ProjectsResponse;
        return (response.projects || [])
          .filter((project) => project.id)
          .map((project) => ({
            label: project.name,
            value: project.id!,
          }));
      }
    });
  }, [query.data?.pages, field]);

  const handleSearch = useCallback((searchQuery: string) => {
    setSearch(searchQuery);
  }, []);

  const handleLoadMore = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage) {
      query.fetchNextPage();
    }
  }, [query]);

  const actionItem = useMemo(
    () => ({
      id: `add-new-${field}`,
      label: `Add New ${field === 'contact' ? 'Contact' : 'Project'}`,
      icon: <Plus />,
      className: 'whitespace-nowrap',
    }),
    [field],
  );

  const handleAction = useCallback(
    (actionId: string) => {
      if (actionId === `add-new-${field}`) {
        if (field === 'contact') {
          setContactDialogOpen(true);
        } else if (field === 'project') {
          setProjectDialogOpen(true);
        } else {
          return;
        }
      }
    },
    [field],
  );

  // Always render AutocompleteDropdown - it handles empty/loading states internally
  // placeholderData ensures query.data exists during refetches (pagination),
  // preventing the dropdown from unmounting when loading more items
  return (
    <>
      <AutocompleteDropdown
        id={`cat-engine-${field}-list`}
        value={currentId || ''}
        items={items}
        variant="ghost"
        className={cn(
          '!pl-0 font-light focus-visible:ring-0',
          currentId ? '' : 'opacity-50',
        )}
        async
        onSearchChange={handleSearch}
        onLoadMore={handleLoadMore}
        isLoading={query.isFetchingNextPage}
        hasMore={query.hasNextPage ?? false}
        debounceTimeout={300}
        actionItems={actionItem ? [actionItem] : []}
        onAction={handleAction}
      />

      {companyId && (
        <AddContactDialog
          open={contactDialogOpen}
          onOpenChange={setContactDialogOpen}
          companyId={companyId}
        />
      )}

      <AddProjectDialog
        open={projectDialogOpen}
        onOpenChange={setProjectDialogOpen}
      />
    </>
  );
}
