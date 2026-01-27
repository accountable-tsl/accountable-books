import { route } from '../route-factory';

export const generalRoutes = {
  welcome: route('/welcome', { label: 'Welcome' }),
  dashboard: route('/dashboard', { label: 'Home' }),
  home: route('/home', { label: 'Home' }),
};
