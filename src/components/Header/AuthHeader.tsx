import { Link } from "react-router-dom";
import { ThemeToggle } from "../ThemeToggle/ThemeToggle";
import { useThemeToggle } from "@/theme/useThemeToggle";

export function AuthHeader() {
  const { theme } = useThemeToggle();
  return (
    <header
      data-component="auth-header"
      className="flex justify-between items-center px-6 py-2"
    >
      <Link to="/">
        <img
          src={theme === "dark" ? "./logo-white.png" : "./logo-main.png"}
          alt=""
          className="w-32"
        />
      </Link>
      <ThemeToggle />
    </header>
  );
}
