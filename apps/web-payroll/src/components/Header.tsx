import { Logo } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';

export default function Header() {
  return (
    <header className="border-border flex h-14 w-full shrink-0 items-center justify-between border-b px-4">
      <Logo />
      <ThemeToggle />
    </header>
  );
}
