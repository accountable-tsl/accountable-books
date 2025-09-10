import { route } from '@/shared/routes/utils';

export const banking = {
  connect: route('banking/connect', {
    label: 'Connect Bank Account',
    sidebarCollapsed: true,
  }),

  upload: route('banking/upload', {
    label: 'Upload Bank Transactions',
    sidebarCollapsed: true,
  }),
};
