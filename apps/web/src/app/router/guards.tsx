import type { ReactNode } from 'react';
import { CenteredLoader } from '@/components/CenteredLoader';
import { isPublicRoute, routes } from '@/shared/routes';
import { useSession } from '@session';
import { Navigate } from 'react-router';

import {
  clearLastAccessedCompanyId,
  getLastAccessedCompanyId,
} from '../session/last-accessed-company';

export function RootRedirector() {
  const { loading, companyId, hasAppAccess, user } = useSession();
  // Public page, do nothing
  if (isPublicRoute(window.location.pathname)) {
    return null;
  }

  if (loading) {
    return <CenteredLoader fullscreen message="Loading..." />;
  }

  if (!hasAppAccess) {
    // No company selected, redirect to company selection or onboarding
    return <Navigate to={routes.onboarding.index.staticPath} replace />;
  }

  const companyIds = user?.companies?.map((company) => company.id) ?? [];
  const hasServerCompany = !!companyId && companyIds.includes(companyId);

  const cachedCompanyId = getLastAccessedCompanyId();
  const hasCachedCompany =
    !!cachedCompanyId && companyIds.includes(cachedCompanyId);

  if (cachedCompanyId && !hasCachedCompany) {
    clearLastAccessedCompanyId();
  }

  const targetCompanyId = hasServerCompany
    ? companyId
    : hasCachedCompany
      ? cachedCompanyId
      : companyIds[0];

  if (!targetCompanyId) {
    return <Navigate to={routes.onboarding.index.staticPath} replace />;
  }

  // Otherwise, redirect to tenant dashboard
  if (location.pathname === '/') {
    return (
      <Navigate
        to={routes.general.dashboard.build({ companyId: targetCompanyId })}
        replace
      />
    );
  }

  return null;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoggedIn, loading } = useSession();

  if (loading) return <CenteredLoader fullscreen />;

  if (!isLoggedIn || !user) {
    return <Navigate to={routes.auth.login.staticPath} replace />;
  }

  return <>{children}</>;
}

export function RequireOnboardingComplete({
  children,
}: {
  children: React.ReactNode;
}) {
  const { onboarding } = useSession();

  if (!onboarding?.canAccessApp) {
    return <Navigate to={routes.onboarding.index.staticPath} replace />;
  }

  return <>{children}</>;
}

export function RequireCurrentCompanyIsFirm({
  children,
}: {
  children: React.ReactNode;
}) {
  const { companyType, companyId } = useSession();

  const isAccountingFirm = companyType === 'accounting_firm';

  if (!isAccountingFirm) {
    return (
      <Navigate to={routes.general.dashboard.build({ companyId })} replace />
    );
  }

  return <>{children}</>;
}
