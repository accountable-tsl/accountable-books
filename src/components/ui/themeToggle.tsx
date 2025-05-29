import { useThemeToggle } from "@/theme/useThemeToggle";

export const ThemeToggle = () => {
  const { toggle, theme } = useThemeToggle();
  return <button onClick={toggle}>Theme: {theme}</button>;
};
