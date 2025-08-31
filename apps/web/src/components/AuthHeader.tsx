import { Link } from 'react-router';
import { useThemeToggle } from '@/theme/useThemeToggle';
import { ThemeToggle } from './ThemeToggle';
import { Button } from '@/components/ui/button';
import { routes } from '@/shared/routes/routes';
import { cn } from '@/lib/utils';

export function AuthHeader({ className }: { className?: string }) {
  const { theme } = useThemeToggle();
  return (
    <header
      data-component="auth-header"
      className={cn('flex justify-between items-center px-6 py-2 z-20', className)}
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
