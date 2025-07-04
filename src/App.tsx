import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import "./styles/App.scss";
import { PopupProvider, usePopup } from "./contexts/PopupContext";
import Popup from "./components/Popup/Popup";
import ThemeProvider from "./theme/themeProvider";
import { AnimatePresence, motion } from "framer-motion";
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
import { SessionProvider } from "./features/auth/Session";

function App() {
  return (
    <ThemeProvider>
      <PopupProvider>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter
            future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          >
            <SessionProvider>
              <AnimatedRoutes />
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
        <Route path={routes.auth.signup.staticPath} element={<Signup />} />
        <Route path={routes.auth.login.staticPath} element={<Login />} />
        <Route
          path={routes.onboarding.welcome.staticPath}
          element={<Welcome />}
        />

        {/* ONBOARDING */}
        <Route element={<OnboardingLayout />}>
          <Route
            path={routes.onboarding.index.staticPath}
            element={<OnboardingRouter />}
          />
          <Route
            path={routes.onboarding.verifyEmail.staticPath}
            element={<OnboardingStepPage />}
          />
          <Route
            path={routes.onboarding.step.staticPath}
            element={<OnboardingStepPage />}
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
          <Route
            index
            element={<Navigate to={routes.onboarding.index.staticPath} />}
          />
          <Route
            path={routes.general.dashboard.staticPath}
            element={<Dashboard />}
          />
          <Route
            path={routes.general.dashboardAlias.staticPath}
            element={
              <Navigate to={routes.general.dashboard.staticPath} replace />
            }
          />
          <Route
            path={routes.general.home.staticPath}
            element={
              <Navigate to={routes.general.dashboard.staticPath} replace />
            }
          />
          <Route
            path={routes.general.homeAlias.staticPath}
            element={
              <Navigate to={routes.general.dashboard.staticPath} replace />
            }
          />

          {/* CLIENT-SPECIFIC PAGES */}

          {/* FIRM-SPECIFIC PAGES */}
          <Route path="*" element={<ErrorPage type="404" />} />
        </Route>
        <Route path="*" element={<ErrorPage />} />
      </Routes>
    </AnimatePresence>
  );
}
