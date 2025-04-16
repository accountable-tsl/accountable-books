import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./styles/App.scss";
// import SideBarProvider, { useSideBarContext } from "./contexts/SideBarContext";
import Home from "./pages-users/Home/Home";
import COA from "./pages-admin/COA/COA";
import { staticRoutes } from "./utils/routes";
import { CompanyProvider } from "./contexts/CompanyContext";
import FinancialSettings from "./pages-admin/FinancialSettings/FinancialSettings";
import UploadBS from "./pages-admin/UploadBS/UploadBS";
import { PopupProvider, usePopup } from "./contexts/PopupContext";
import Popup from "./components/Popup/Popup";
import CategorisationEngine from "./pages-admin/CategorisationEngine/CategorisationEngine";
import Workspace from "./pages-admin/Workspace/Workspace";
import Journal from "./pages-admin/Journal/Journal";
import AccountingTxns from "./pages-admin/AccountingTxns/AccountingTxns";
import ThemeProvider from "./theme/themeProvider";
import { SidebarProvider } from "./components/ui/sidebar";
import Signup from "./features/auth/Signup";
import AppLayout from "./layouts/AppLayout";
import AuthLayout from "./layouts/AuthLayout";

function App() {
  return (
    <ThemeProvider>
      <CompanyProvider>
        <PopupProvider>
          <BrowserRouter
            future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          >
            <Routes>
              <Route element={<AppLayout />}>
                <Route path="/" element={<Home />} />

                <Route path={staticRoutes.companies.root} element={<Home />} />

                <Route
                  path={staticRoutes.accounting.root}
                  element={<Workspace />}
                />

                <Route
                  path={staticRoutes.accounting.workspace.root}
                  element={<Workspace />}
                />
                <Route
                  path={staticRoutes.accounting.workspace.uploadBank}
                  element={<UploadBS />}
                />
                <Route
                  path={staticRoutes.accounting.workspace.catEngine}
                  element={<CategorisationEngine />}
                />

                <Route
                  path={staticRoutes.accounting.workspace.journalPages}
                  element={<Journal />}
                />

                {/* Accounting Setup Pages */}
                <Route
                  path={staticRoutes.accounting.setup.root}
                  element={<COA />}
                />
                <Route
                  path={staticRoutes.accounting.setup.coa}
                  element={<COA />}
                />
                <Route
                  path={staticRoutes.accounting.setup.finSettings}
                  element={<FinancialSettings />}
                />

                <Route
                  path={staticRoutes.reports.coa}
                  element={<AccountingTxns />}
                />
              </Route>
              <Route element={<AuthLayout />}>
                <Route path={staticRoutes.auth.signup} element={<Signup />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </PopupProvider>
      </CompanyProvider>
    </ThemeProvider>
  );
}

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

export default App;
