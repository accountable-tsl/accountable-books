import { useThemeToggle } from '@/theme/useThemeToggle';
import { Button } from '@/components/ui/button';
import { Moon, Sun } from 'lucide-react';

export const ThemeToggle = () => {
  const { toggle, theme } = useThemeToggle();
  if (!theme) return null;
  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
      {!theme && <Moon className="h-5 w-5" />}
      {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </Button>
  );
};
