import { route } from '../route-factory';

export const generalRoutes = {
  welcome: route('/welcome', { label: 'Welcome' }),
  settings: {
    hub: route('/settings', { label: 'Settings' }),
    billing: route('/settings/billing', { label: 'Billing' }),
    company: route('/settings/company', { label: 'Company Settings' }),
    financial: route('/settings/financial', { label: 'Financial Settings' }),
    team: route('/settings/team', { label: 'Team' }),
  },
  dashboard: route('/dashboard', { label: 'Home', sidebarCollapsed: true }),
  dashboardTab: route('/dashboard/:tab', {
    label: 'Home',
    sidebarCollapsed: true,
  }),
  queue: route('/queue', {
    label: 'Queue',
    sidebarCollapsed: true,
  }),
  clients: route('/clients', {
    label: 'Clients',
    sidebarCollapsed: true,
  }),
  home: route('/home', { label: 'Home', sidebarCollapsed: true }),
};
