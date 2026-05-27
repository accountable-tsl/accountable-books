import { isFirmBookkeepingRole } from '@/modules/auth';
import { routes } from '@/shared/routes';
import { useSession } from '@session';
import { Navigate } from 'react-router';

import { DashboardClientPage } from './dashboard-client/page';
import { FirmDashboardPage } from './dashboard-firm/page';

export function Dashboard() {
  return <DashboardClientPage />;
}

export function QueuePage() {
  const { user, isLoggedIn } = useSession();
  const hasFirmAccess =
    !!user &&
    (isFirmBookkeepingRole(user.currentCompany) || user.isPlatformUser);

  if (isLoggedIn && !hasFirmAccess) {
    return <Navigate to={routes.general.dashboard.relativePath} replace />;
  }

  return <FirmDashboardPage initialMobileTab="queue" />;
}

export function ClientsPage() {
  const { user, isLoggedIn } = useSession();
  const hasFirmAccess =
    !!user &&
    (isFirmBookkeepingRole(user.currentCompany) || user.isPlatformUser);

  if (isLoggedIn && !hasFirmAccess) {
    return <Navigate to={routes.general.dashboard.relativePath} replace />;
  }

  return <FirmDashboardPage initialMobileTab="clients" />;
}
