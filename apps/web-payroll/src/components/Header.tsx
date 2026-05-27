import { Logo } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';

export default function Header() {
  return (
    <header className="border-border flex h-14 w-full shrink-0 items-center justify-between border-b px-4">
      <div className="flex items-center gap-1.5 rounded-full border p-0.5 pr-2">
        <div className="flex items-center rounded-full border p-0.5">
          <Logo className="h-5 w-auto" />
        </div>
        <p className="text-sm font-medium">accountable</p>
      </div>

      <ThemeToggle />
    </header>
  );
}
