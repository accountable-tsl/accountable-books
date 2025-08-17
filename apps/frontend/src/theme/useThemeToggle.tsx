import { useTheme } from "next-themes";

export function useThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const toggle = () => setTheme(resolvedTheme === "dark" ? "light" : "dark");
  return { theme: resolvedTheme, toggle };
}
