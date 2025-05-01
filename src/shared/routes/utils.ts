import { routes } from "./routes";
import { RouteLike } from "./types";

function flattenRoutes(obj: Record<string, unknown>): RouteLike[] {
  const flat: RouteLike[] = [];

  for (const value of Object.values(obj)) {
    if (
      value &&
      typeof value === "object" &&
      "staticPath" in value &&
      "meta" in value
    ) {
      flat.push(value as RouteLike);
    } else if (value && typeof value === "object") {
      flat.push(...flattenRoutes(value as Record<string, unknown>));
    }
  }

  return flat;
}

export function isPublicRoute(path: string): boolean {
  const flattened = flattenRoutes(routes);

  return flattened.some(
    (route) => route.meta?.public && path.startsWith(route.staticPath)
  );
}
