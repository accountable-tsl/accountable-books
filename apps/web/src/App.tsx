import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import './styles/App.scss';
import { PopupProvider, usePopup } from './contexts/PopupContext';
import Popup from './components/Popup/Popup';
import ThemeProvider from './theme/themeProvider';
import AppLayout from '@/layouts/AppLayout';
import { QueryClientProvider } from '@tanstack/react-query';
import Welcome from '@/domains-pending-migration/onboarding/Welcome';
import { SignupForm } from '@/features/auth-signup';
import { LoginForm } from '@/features/auth-login';
import Dashboard from '@/domains-pending-migration/dashboard/Dashboard';
import ErrorPage from '@/components/ErrorPage';
import OnboardingLayout from '@/layouts/OnboardingLayout';
import { OnboardingStepPage } from '@/domains-pending-migration/onboarding/Onboarding';
import { Toaster } from '@/components/ui/sonner';
import { routes } from '@/shared/routes/routes';
import { queryClient } from '@/lib/queryClient';
import { OnboardingRouter } from '@/domains-pending-migration/onboarding/OnboardingRouter';
import { SessionProvider } from '@session';
import {
  RequireAuth,
  RequireOnboardingComplete,
  RootRedirector,
} from './domains-pending-migration/auth/Access';
import BlankLayout from './layouts/BlankLayout';
import { AccountingWorkspaceSetup } from './domains-pending-migration/accounting-setup/AccountingSetup';
import { Table } from '@/components/data-table/fake';
import { AccountingWorkspace } from '@/domains-pending-migration/accounting-ws/acc-ws';
import { CatEngine } from '@/domains-pending-migration/cat-engine/cat-engine';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ConnectBank } from '@/features/connect-bank';
import { AddBankTransaction } from './modules/banking/transactions/ui/bank-tx-add';
function App() {
  return (
    <ThemeProvider>
      <PopupProvider>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <SessionProvider>
              <TooltipProvider>
                <Toaster />
                <AppRoutes />
              </TooltipProvider>
            </SessionProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </PopupProvider>
    </ThemeProvider>
  );
}

export default App;

export const PopupManager = () => {
  const { componentPopups } = usePopup();

  return (
    <>
      {componentPopups.map((popup) => (
        <Popup key={popup.id} popupId={popup.id}>
          {popup.component}
        </Popup>
      ))}
    </>
  );
};

function AppRoutes() {
  return (
    <Routes>
      <Route index element={<RootRedirector />} />
      {/* PUBLIC */}
      <Route path={routes.auth.signup.staticPath} element={<SignupForm />} />
      <Route path={routes.auth.login.staticPath} element={<LoginForm />} />

      {/* VERIFY EMAIL PAGE */}
      <Route path={routes.onboarding.verifyEmail.staticPath} element={<OnboardingStepPage />} />

      {/* PRIVATE ONBOARDING */}
      <Route
        path="onboarding"
        element={
          // <RequireAuth>
          <OnboardingLayout />
          // </RequireAuth>
        }
      >
        <Route index element={<OnboardingRouter />} />

        <Route path=":step" element={<OnboardingStepPage />} />
      </Route>

      {/* APP */}
      <Route
        path=":companyId"
        element={
          <RequireAuth>
            <RequireOnboardingComplete>
              <BlankLayout />
            </RequireOnboardingComplete>
          </RequireAuth>
        }
      >
        <Route path={routes.general.welcome.relativePath} element={<Welcome />} />

        <Route element={<AppLayout />}>
          <Route path="table" element={<Table />} />
          <Route index element={<Navigate to={routes.general.dashboard.relativePath} replace />} />
          <Route path={routes.general.dashboard.relativePath} element={<Dashboard />} />
          <Route path={routes.general.home.relativePath} element={<Dashboard />} />

          {/* CLIENT-SPECIFIC PAGES */}

          {/* FIRM-SPECIFIC PAGES */}
          <Route path={routes.accounting.index.relativePath} element={<AccountingWorkspace />} />

          <Route
            path={routes.accounting.setup.relativePath}
            element={<AccountingWorkspaceSetup />}
          />

          <Route
            path={routes.accounting.uploadBankTxn.relativePath}
            element={<AddBankTransaction />}
          />

          <Route path={routes.banking.connect.relativePath} element={<ConnectBank />} />

          <Route path={routes.accounting.catEngine.relativePath} element={<CatEngine />} />
        </Route>
        <Route path="*" element={<ErrorPage type="404" />} />
      </Route>

      <Route path="*" element={<ErrorPage type="404" />} />
    </Routes>
  );
}
