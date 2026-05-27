'use client';

import { useCallback } from 'react';
import { Brightness } from '@/components/brightness';
import { useTheme } from '@/components/theme-provider';
import { Button } from '@/components/ui/button';

type ButtonProps = React.ComponentProps<typeof Button>;
export function ThemeToggle(props: ButtonProps) {
  const { theme, setTheme } = useTheme();

  const toggleTheme = useCallback(() => {
    if (theme === 'dark') {
      setTheme('light');
    } else if (theme === 'light') {
      setTheme('dark');
    } else {
      const isSystemDark = window.matchMedia(
        '(prefers-color-scheme: dark)',
      ).matches;
      setTheme(isSystemDark ? 'light' : 'dark');
    }
  }, [theme, setTheme]);

  return (
    <Button
      variant="secondary"
      size="icon"
      className="group/toggle size-8"
      onClick={toggleTheme}
      {...props}
    >
      <Brightness />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
