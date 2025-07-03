import { routes } from "@/shared/routes/routes";
import { useEffect, useRef, createContext, useContext } from "react";
import { isPublicRoute } from "@/shared/routes/utils";
import { useLocation, useNavigate } from "react-router-dom";
import {
  clearSessionFn,
  useAuth,
  useSessionQuery,
} from "@/features/auth/hooks";

const SessionContext = createContext<{
  loading: boolean;
  session: ReturnType<typeof useSessionQuery>["data"] | null;
  refetch: () => void;
}>({
  loading: true,
  session: null,
  refetch: () => {},
});

export const SessionProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { setAuth } = useAuth();
  const { data, isLoading, isError, refetch } = useSessionQuery();

  const hasHandled = useRef(false);
  const isPublic = isPublicRoute(location.pathname);

  useEffect(() => {
    console.log("SessionProvider useEffect data:", data);
    if (hasHandled.current) return;

    const user = data?.data?.user;
    const csrfToken = data?.data?.csrfToken;

    if (user && csrfToken) {
      console.log("Setting auth");

      setAuth(user, csrfToken);
      hasHandled.current = true;
    }

    if (isError && !isPublic) {
      clearSessionFn();
      navigate(routes.auth.login.staticPath, { replace: true });
      hasHandled.current = true;
    }
  }, [data, isError, isPublic, navigate, setAuth]);

  return (
    <SessionContext.Provider
      value={{
        loading: isLoading || !hasHandled.current,
        session: data ?? null,
        refetch,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
};

// Custom hook for components
export const useSession = () => {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within a SessionProvider");
  return ctx;
};
