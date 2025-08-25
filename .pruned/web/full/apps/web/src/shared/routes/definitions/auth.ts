import { route } from '@/shared/routes/utils';

export const authRoutes = {
  login: route('/login', {
    public: true,
    label: 'Login',
    requiresCompanyId: false,
  }),
  logout: route('/logout', {
    public: true,
    label: 'Logout',
    requiresCompanyId: false,
  }),
  signup: route('/signup', {
    public: true,
    label: 'Sign Up',
    requiresCompanyId: false,
  }),
  forgotPassword: route('/forgot-password', {
    public: true,
    label: 'Forgot Password',
    requiresCompanyId: false,
  }),
};
