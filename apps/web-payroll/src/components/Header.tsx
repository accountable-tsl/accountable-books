import { Logo } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';

export default function Header() {
  return (
    <header className="w-full flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
      <div className="flex items-center gap-1.5 rounded-full p-0.5 border pr-2">
        <div className="flex items-center rounded-full p-0.5 border">
          <Logo className="h-5 w-auto" />
        </div>
          <p className="text-sm font-medium">accountable</p>
      </div>
    
      <ThemeToggle />
    </header>
  );
}
