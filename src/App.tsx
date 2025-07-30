import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./styles/App.scss";
import { PopupProvider, usePopup } from "./contexts/PopupContext";
import Popup from "./components/Popup/Popup";
import ThemeProvider from "./theme/themeProvider";
import Signup from "@/features/signup/Signup";
import AppLayout from "@/layouts/AppLayout";
import { QueryClientProvider } from "@tanstack/react-query";
import Welcome from "@/features/onboarding/Welcome";
import Login from "@/features/auth/Login";
import Dashboard from "@/features/dashboard/Dashboard";
import ErrorPage from "@/components/ErrorPage";
import OnboardingLayout from "@/layouts/OnboardingLayout";
import { OnboardingStepPage } from "@/features/onboarding/Onboarding";
import { Toaster } from "@/components/ui/sonner";
import { routes } from "@/shared/routes/routes";
import { queryClient } from "@/lib/queryClient";
import { OnboardingRouter } from "@/features/onboarding/OnboardingRouter";
import { SessionProvider } from "@/features/auth/Session";
import {
  RequireAuth,
  RequireOnboardingComplete,
  RootRedirector,
} from "./features/auth/Access";
import BlankLayout from "./layouts/BlankLayout";
import { AccountingWorkspaceSetup } from "./features/accounting-setup/AccountingSetup";
import { Table } from "@/components/data-table/fake";

function App() {
  return (
    <ThemeProvider>
      <PopupProvider>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter
            future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          >
            <SessionProvider>
              <Toaster />
              <AppRoutes />
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
// const pageVariants = {
//   initial: { opacity: 0, y: 10 },
//   animate: { opacity: 1, y: 0 },
//   exit: { opacity: 0, y: -10 },
// };
// const pageTransition = { type: "tween", ease: "anticipate", duration: 0.4 };

function AppRoutes() {
  return (
    <Routes>
      <Route index element={<RootRedirector />} />
      {/* PUBLIC */}
      <Route path={routes.auth.signup.staticPath} element={<Signup />} />
      <Route path={routes.auth.login.staticPath} element={<Login />} />

      {/* VERIFY EMAIL PAGE */}
      <Route
        path={routes.onboarding.verifyEmail.staticPath}
        element={<OnboardingStepPage />}
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
            element={<Navigate to={routes.general.dashboard.relativePath} />}
          />

          {/* CLIENT-SPECIFIC PAGES */}

          {/* FIRM-SPECIFIC PAGES */}
          <Route
            path={routes.accounting.setup.relativePath}
            element={<AccountingWorkspaceSetup />}
          />
        </Route>
        <Route path="*" element={<ErrorPage type="404" />} />
      </Route>

      <Route path="*" element={<ErrorPage type="404" />} />
    </Routes>
  );
}
