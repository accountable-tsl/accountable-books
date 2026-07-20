export function Logo() {
  return (
    <picture>
      <source media="(min-width: 1280px)" srcSet="/main-logo.png" />
      <img
        src="/main-icon.png"
        alt="Accountable Payroll"
        className="h-5 w-auto xl:h-4 dark:grayscale dark:invert"
        decoding="async"
      />
    </picture>
  );
}
