import './styles/App.scss';

import {
  RequireAuth,
  RequireOnboardingComplete,
  RootRedirector,
} from '@/app/router/guards';
import { Table } from '@/components/data-table/fake';
import ErrorPage from '@/components/ErrorPage';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AccountingWorkspace } from '@/domains-pending-migration/accounting-ws/acc-ws';
import Dashboard from '@/domains-pending-migration/dashboard/Dashboard';
import { OnboardingStepPage } from '@/domains-pending-migration/onboarding/Onboarding';
import { OnboardingRouter } from '@/domains-pending-migration/onboarding/OnboardingRouter';
import Welcome from '@/domains-pending-migration/onboarding/Welcome';
import { LoginForm } from '@/features/auth-login';
import { SignupForm } from '@/features/auth-signup';
import { CatEngine } from '@/features/cat-engine';
// import { CatEngine as CatEngineT } from '@/features/cat-engine-test';
import { ConnectBank } from '@/features/connect-bank';
import { PlaidOAuthCallback } from '@/features/connect-bank/ui/plaid-oauth-callback';
import { JournalsListPage } from '@/features/manage-journals';
import { UploadBankTransactions } from '@/features/upload-bank-transactions';
import AppLayout from '@/layouts/AppLayout';
import OnboardingLayout from '@/layouts/OnboardingLayout';
import { queryClient } from '@/lib/queryClient';
import { routes } from '@/shared/routes';
import { SessionProvider } from '@session';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';

import Popup from './components/Popup/Popup';
import { PopupProvider, usePopup } from './contexts/PopupContext';
import { AccountingWorkspaceSetup } from './domains-pending-migration/accounting-setup/AccountingSetup';
import BlankLayout from './layouts/BlankLayout';
import ThemeProvider from './theme/themeProvider';

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
      <Route
        path={routes.onboarding.verifyEmail.staticPath}
        element={<OnboardingStepPage />}
      />

      {/* PLAID OAUTH CALLBACK */}
      <Route
        path={routes.banking['plaid-oauth'].staticPath}
        element={<PlaidOAuthCallback />}
      />

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
        <Route
          path={routes.general.welcome.relativePath}
          element={<Welcome />}
        />

        <Route element={<AppLayout />}>
          <Route path="table" element={<Table />} />
          <Route
            index
            element={
              <Navigate to={routes.general.dashboard.relativePath} replace />
            }
          />
          <Route
            path={routes.general.dashboard.relativePath}
            element={<Dashboard />}
          />
          <Route
            path={routes.general.home.relativePath}
            element={<Dashboard />}
          />

          {/* CLIENT-SPECIFIC PAGES */}

          {/* FIRM-SPECIFIC PAGES */}
          <Route
            path={routes.accounting.index.relativePath}
            element={<AccountingWorkspace />}
          />

          <Route
            path={routes.accounting.setup.relativePath}
            element={<AccountingWorkspaceSetup />}
          />

          <Route
            path={routes.banking.upload.relativePath}
            element={<UploadBankTransactions />}
          />
          <Route
            path={routes.banking.connect.relativePath}
            element={<ConnectBank />}
          />

          <Route
            path={routes.accounting.catEngine.relativePath}
            element={<CatEngine />}
          />

          <Route
            path={routes.accounting.transactions.relativePath}
            element={<CatEngine />}
          />

          <Route
            path={routes.accounting.journals.relativePath}
            element={<JournalsListPage />}
          />
        </Route>
        <Route path="*" element={<ErrorPage type="404" />} />
      </Route>

      <Route path="*" element={<ErrorPage type="404" />} />
    </Routes>
  );
}
