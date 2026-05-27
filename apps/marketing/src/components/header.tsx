import { ThemeToggle } from '@/components/theme-toggle';
import { Link, useRouterState } from '@tanstack/react-router';
import { Heart } from 'lucide-react';

import { Logo } from './logo';

export function Header() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isWallOfLove = pathname === '/wall-of-love';

  return (
    <header className="w-full border-b">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        {/* Logo */}
        <Link
          to="/"
          className="bg-secondary hover:bg-secondary/80 flex items-center gap-1 rounded-full border py-0.5 pr-2 pl-1 transition-colors"
        >
          <Logo className="border-primary/50 size-4 border" stroke="none" />
          <p className="text-sm">accountable</p>
        </Link>

        <div className="flex items-center gap-3">
          {!isWallOfLove && (
            <Link
              to="/wall-of-love"
              className="text-muted-foreground hover:text-foreground hidden! inline-flex items-center gap-1.5 text-xs transition-colors"
            >
              <Heart className="size-3.5" />
              Wall of Love
            </Link>
          )}
          <ThemeToggle className="rounded-full" />
        </div>
      </div>
    </header>
  );
}
