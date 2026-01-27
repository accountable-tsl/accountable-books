import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { routes } from '@/shared/routes';
import { useThemeToggle } from '@/theme/useThemeToggle';
import { Link } from 'react-router';

import { ThemeToggle } from './ThemeToggle';

export function AuthHeader({ className }: { className?: string }) {
  const { theme } = useThemeToggle();
  return (
    <header
      data-component="auth-header"
      className={cn(
        'z-20 flex items-center justify-between px-6 py-2',
        className,
      )}
    >
      <Link to="/">
        <img
          src={theme === 'dark' ? '/logo-white.png' : '/logo-main.png'}
          alt=""
          className="w-32"
        />
      </Link>
      <div className="flex items-center gap-1">
        <Button variant={'link'}>
          <Link to={routes.auth.login.staticPath}>Login</Link>
        </Button>
        <ThemeToggle />
      </div>
    </header>
  );
}
