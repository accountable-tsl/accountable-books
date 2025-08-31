import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { clearSessionFn, useSessionQuery } from '@/features/auth/hooks';
import { authStore } from '@/features/auth/store';
import { routes } from '@/shared/routes/routes';
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { createTenantRoutes, isPublicRoute } from '@/shared/routes/utils';
import type { LogoutOptions, SessionContextType } from '@/features/auth/types';
import { useCompanyDetails } from '@/domains/company/hooks';
import { handleLogout } from './api';
import { createDefaultSessionContext } from '@/features/auth/utils';
import { SwitchConfirmModal } from '@/features/switchCompany/SwitchConfirmModal';
import { useCompanySwitch } from '@/features/switchCompany/hooks';
import type { AuthCompanyContext } from '@/features/auth/types';

const SessionContext = createContext<SessionContextType>(createDefaultSessionContext());

export const SessionProvider = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const user = authStore((s) => s.user);
  const setAuth = authStore((s) => s.setAuth);
  const clearAuth = authStore((s) => s.clearAuth);
  const { switchCompany, isSwitching } = useCompanySwitch();

  // State for company switch confirmation modal
  const [showSwitchModal, setShowSwitchModal] = useState(false);
  const [pendingCompanySwitch, setPendingCompanySwitch] = useState<{
    from: AuthCompanyContext;
    to: AuthCompanyContext;
  } | null>(null);

  const { data, isLoading: isLoadingSession, isError, refetch: refetchSession } = useSessionQuery(); // auth/me inside useQuery
  const { data: authData, success } = data || {};

  const isPublic = isPublicRoute(location.pathname);

  useEffect(() => {
    if (!data) return;

    if (authData?.user && authData?.csrfToken) {
      setAuth(authData.user, authData.csrfToken);
    }

    if ((isError || !success) && !isLoadingSession && !isPublic) {
      const wasAuthenticated = localStorage.getItem('wasAuthenticated') === 'true';

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

  // URL company change detection
  useEffect(() => {
    if (isPublic || !user?.currentCompanyId || !user?.companies) return;

    const urlSegments = location.pathname.split('/').filter(Boolean);
    const urlCompanyId = urlSegments[0]; // First segment should be companyId

    // If URL has a company ID and it's different from current user's company
    if (urlCompanyId && urlCompanyId !== user.currentCompanyId) {
      // Find the target company in user's accessible companies
      const targetCompany = user.companies.find((company) => company.id === urlCompanyId);
      const currentCompany = user.companies.find((company) => company.id === user.currentCompanyId);

      if (!targetCompany) {
        // User doesn't have access - redirect to current company's dashboard
        navigate(routes.general.dashboard.build({ companyId: user.currentCompanyId }), {
          replace: true,
        });
        return;
      }

      // Check if user has auto-switch preference
      const autoSwitch = localStorage.getItem('autoSwitchCompanies') === 'true';

      if (autoSwitch) {
        // Auto-switch without confirmation
        switchCompany({
          companyId: urlCompanyId,
          onError: () => {
            // On error, redirect back to current company
            navigate(routes.general.dashboard.build({ companyId: user.currentCompanyId }), {
              replace: true,
            });
          },
        });
      } else if (currentCompany && !showSwitchModal) {
        // Show confirmation modal
        setPendingCompanySwitch({
          from: currentCompany,
          to: targetCompany,
        });
        setShowSwitchModal(true);
      }
    }
  }, [location.pathname, user, navigate, isPublic, switchCompany, showSwitchModal]);

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

  const isLoading = isPublic ? isLoadingSession : isLoadingSession || isLoadingCompany;

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
        let target: string = routes.auth.login.staticPath; //default fallback

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

  // Modal handlers
  const handleConfirmSwitch = async () => {
    if (!pendingCompanySwitch) return;

    await switchCompany({
      companyId: pendingCompanySwitch.to.id,
      onError: () => {
        // On error, redirect back to current company
        navigate(routes.general.dashboard.build({ companyId: user?.currentCompanyId || '' }), {
          replace: true,
        });
      },
      onSuccess: () => {
        // Switch successful, modal will close automatically
        setShowSwitchModal(false);
        setPendingCompanySwitch(null);
      },
    });
  };

  const handleCancelSwitch = () => {
    // Redirect back to current company
    if (user?.currentCompanyId) {
      navigate(routes.general.dashboard.build({ companyId: user.currentCompanyId }), {
        replace: true,
      });
    }
    setShowSwitchModal(false);
    setPendingCompanySwitch(null);
  };

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

      <SwitchConfirmModal
        isOpen={showSwitchModal}
        onClose={handleCancelSwitch}
        onConfirm={handleConfirmSwitch}
        fromCompany={pendingCompanySwitch?.from || null}
        toCompany={pendingCompanySwitch?.to || null}
        isLoading={isSwitching}
      />
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
    return createDefaultSessionContext();
  }
};
