import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useEffect,
} from 'react';
import { routes } from '@/shared/routes/routes';
import { useLocation, useNavigate } from 'react-router';
import { createTenantRoutes, isPublicRoute } from '@/shared/routes/utils';
import {
  authStore,
  clearSessionFn,
  handleLogout,
  useSessionQuery,
  type LogoutOptions,
  type SessionContextType,
} from '@/modules/auth';
import { useCompanyDetails } from '@/domains-pending-migration/company/hooks';

const defaultContext = {
  loading: true,
  isLoggedIn: false,
  hasAppAccess: false,

  user: null,

  company: undefined,
  companyType: undefined,

  tenantRoutes: null,

  refetchCompany: () => {},
  refetchSession: () => {},
  logout: async () => false,
};
const SessionContext = createContext<SessionContextType>(defaultContext);

export const SessionProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = authStore.getState();
  const setAuth = authStore((s) => s.setAuth);
  const clearAuth = authStore((s) => s.clearAuth);

  const {
    data,
    isLoading: isLoadingSession,
    isError,
    refetch: refetchSession,
  } = useSessionQuery();
  const { data: authData, success } = data || {};

  const isPublic = isPublicRoute(location.pathname);

  useEffect(() => {
    if (!data) return;

    if (authData?.user && authData?.csrfToken) {
      setAuth(authData.user, authData.csrfToken);
    }

    if ((isError || !success) && !isLoadingSession && !isPublic) {
      const wasAuthenticated =
        localStorage.getItem('wasAuthenticated') === 'true';

      void (async () => {
        try {
          if (wasAuthenticated) {
            clearSessionFn('expired');
          } else {
            clearSessionFn();
          }
          await handleLogout();
        } catch (error) {
          console.error('Error during logout', error);
        } finally {
          clearAuth();
          navigate(routes.auth.login.staticPath, { replace: true });
        }
      })();
    }
  }, [data, isError, isPublic, navigate, setAuth]);

  useEffect(() => {
    if (authData?.user && authData.csrfToken && user?.id !== authData.user.id) {
      setAuth(authData.user, authData.csrfToken);
    }
  }, [authData, user]);

  const isLoggedIn = !!user;
  const companyId = user?.currentCompanyId;
  const onboarding = user?.currentCompany?.onboarding;
  const hasAppAccess = onboarding?.canAccessApp || false;

  const {
    data: companyDataResponse,
    isLoading: isLoadingCompany,
    refetch: refetchCompany,
  } = useCompanyDetails(companyId || '');

  const company = companyDataResponse?.data;

  const companyType = company?.companyType;

  const isLoading = isPublic
    ? isLoadingSession
    : isLoadingSession || isLoadingCompany;

  const tenantRoutes = useMemo(() => {
    if (!companyId) return null;
    return createTenantRoutes(routes, companyId);
  }, [companyId]);

  const logout = useCallback(async (options?: LogoutOptions) => {
    try {
      await handleLogout();
    } catch (error) {
      console.error('Logout failed, forcing client clear anyway', error);
    } finally {
      clearSessionFn('manual');
      if (options?.redirectTo !== false) {
        let target: string = routes.auth.login.staticPath;

        if (options?.redirectTo) {
          target = options.redirectTo;
        }

        if (options?.query) {
          const queryString = new URLSearchParams(options.query).toString();
          target += `?${queryString}`;
        }
        window.location.replace(target);
      }
    }

    return true;
  }, []);

  const contextValue: SessionContextType = useMemo(
    () => ({
      loading: isLoading ?? false,
      isLoggedIn,
      hasAppAccess,

      user: user ?? null,
      onboarding,

      company,
      companyId,
      companyType,

      tenantRoutes,
      setAuth,

      refetchSession: async () => {
        try {
          await refetchSession();
        } catch (error) {
          console.error('Session refetch failed', error);
        }
      },
      refetchCompany,
      logout,
    }),
    [
      isLoading,
      user,
      onboarding,
      companyDataResponse,
      tenantRoutes,
      refetchSession,
      refetchCompany,
      logout,
    ],
  );

  return (
    <SessionContext.Provider value={contextValue}>
      {children}
    </SessionContext.Provider>
  );
};

export const useSession = () => {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within a SessionProvider');
  return ctx;
};

export const useSafeSession = () => {
  try {
    return useSession();
  } catch (err) {
    console.error('⚠️ useSession used outside provider', err);
    return defaultContext;
  }
};
