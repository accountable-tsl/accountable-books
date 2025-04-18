import { Link } from "react-router-dom";
import { ThemeToggle } from "../ThemeToggle";
import { useThemeToggle } from "@/theme/useThemeToggle";
import { routes } from "@/utils/routes";
import { Button } from "../ui/button";

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
      <div className="flex items-center gap-1">
        <Button variant={"link"}>
          <Link to={routes.auth.login}>Login</Link>
        </Button>
        <ThemeToggle />
      </div>
    </header>
  );
}
