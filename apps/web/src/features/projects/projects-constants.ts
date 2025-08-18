import { ProjectStatus } from './projects-types';

export const projectStatusOptions: {
  label: string;
  value: ProjectStatus;
  alias?: string;
}[] = [
  { label: 'Draft', value: 'in_draft' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'On Hold', value: 'on_hold' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
];
