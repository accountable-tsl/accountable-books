import { route } from '@/shared/routes/utils';

export const banking = {
  connect: route('banking/connect', {
    label: 'Connect Bank Account',
    sidebarCollapsed: true,
  }),

  'plaid-oauth': route('banking/plaid-oauth', {
    label: 'Connect Bank Account',
    sidebarCollapsed: true,
    public: true,
    requiresCompanyId: false,
  }),

  upload: route('banking/upload', {
    label: 'Upload Bank Transactions',
    sidebarCollapsed: true,
  }),
};
