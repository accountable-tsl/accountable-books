import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import "./styles/App.scss";
// import SideBarProvider, { useSideBarContext } from "./contexts/SideBarContext";
import Home from "./pages-users/Home/Home";
import COA from "./pages-admin/COA/COA";
import { staticRoutes } from "./utils/routes";
import FinancialSettings from "./pages-admin/FinancialSettings/FinancialSettings";
import UploadBS from "./pages-admin/UploadBS/UploadBS";
import { PopupProvider, usePopup } from "./contexts/PopupContext";
import Popup from "./components/Popup/Popup";
import CategorisationEngine from "./pages-admin/CategorisationEngine/CategorisationEngine";
import Workspace from "./pages-admin/Workspace/Workspace";
import Journal from "./pages-admin/Journal/Journal";
import AccountingTxns from "./pages-admin/AccountingTxns/AccountingTxns";
import ThemeProvider from "./theme/themeProvider";
import { AnimatePresence, motion } from "framer-motion";
import Signup from "./features/signup/Signup";
import AppLayout from "./layouts/AppLayout";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Welcome from "./features/onboarding/Welcome";
import Login from "./features/auth/Login";
import Dashboard from "./features/dashboard/Dashboard";
import DashboardRedirect from "./components/DashboardRedirect";
import { routes as tenantRoutes } from "./shared/routes/routes-old";
import ErrorPage from "./components/ErrorPage";
// import { SessionChecker } from "./features/auth/SessionChecker";
import OnboardingLayout from "./layouts/OnboardingLayout";
import { OnboardingForm } from "@/features/onboarding/Onboarding";
import { Toaster } from "@/components/ui/sonner";
import { routes } from "@/shared/routes/routes";

function App() {
  const queryClient = new QueryClient();

  return (
    <ThemeProvider>
      <PopupProvider>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter
            future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          >
            {/* <SessionChecker /> */}
            <AnimatedRoutes />
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
const pageVariants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
};
const pageTransition = { type: "tween", ease: "anticipate", duration: 0.4 };

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <AnimatePresence>
      <Toaster />
      <Routes location={location} key={location.pathname}>
        {/* PUBLIC */}
        <Route path={routes.signup.staticPath} element={<Signup />} />
        <Route path={routes.login.staticPath} element={<Login />} />
        <Route path={routes.welcome.staticPath} element={<Welcome />} />

        {/* ONBOARDING */}
        <Route element={<OnboardingLayout />}>
          <Route
            path={tenantRoutes.onboarding.index.staticPath}
            element={<OnboardingForm />}
          />
          <Route
            path={tenantRoutes.onboarding.step.staticPath}
            element={<OnboardingForm />}
          />
          <Route
            path={tenantRoutes.onboarding.verifyEmail.staticPath}
            element={<OnboardingForm step="verifyEmail" />}
          />
        </Route>

        {/* PROTECTED */}
        <Route
          path="/"
          element={
            <motion.div
              key={location.pathname}
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={pageTransition}
            >
              <AppLayout />
            </motion.div>
          }
        >
          <Route index element={<DashboardRedirect />} />
          <Route path={routes.home.staticPath} element={<Dashboard />} />
          <Route path={routes.homeAlias.staticPath} element={<Dashboard />} />
          {/* <Route
            path={tenantRoutes.dashboard.staticPath}
            element={<Dashboard />}
          /> */}
          <Route
            path={tenantRoutes.accounting.index.staticPath}
            element={<UploadBS />}
          />
          {/* <Route path=":companyId" element={<Home />} /> */}
          {/* <Route path={staticRoutes.companies.root} element={<Home />} />
          <Route path={staticRoutes.accounting.root} element={<Workspace />} /> */}
          {/* 
          <Route
            path={staticRoutes.accounting.workspace.catEngine}
            element={<CategorisationEngine />}
          />
          <Route
            path={staticRoutes.accounting.workspace.journalPages}
            element={<Journal />}
          />
          <Route path={staticRoutes.accounting.setup.root} element={<COA />} />
          <Route path={staticRoutes.accounting.setup.coa} element={<COA />} />
          <Route
            path={staticRoutes.accounting.setup.finSettings}
            element={<FinancialSettings />}
          />
          <Route path={staticRoutes.reports.coa} element={<AccountingTxns />} /> */}
          {/* <Route path="*" element={<NotFound />} /> */}

          {/* CLIENT-SPECIFIC PAGES */}

          {/* FIRM-SPECIFIC PAGES */}
        </Route>
        <Route path="*" element={<ErrorPage />} />
      </Routes>
    </AnimatePresence>
  );
}
