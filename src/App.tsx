import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./styles/App.scss";
import Header from "./components/Header/Header";
import SideBar from "./components/SideBar/SideBar";
import SideBarProvider, { useSideBarContext } from "./contexts/SideBarContext";
import Home from "./pages-users/Home/Home";
import COA from "./pages-admin/COA/COA";
import CurrentCompany from "./components/CurrentCompany/CurrentCompany";
import { staticRoutes } from "./utils/routes";
import { CompanyProvider } from "./contexts/CompanyContext";
import FinancialSettings from "./pages-admin/FinancialSettings/FinancialSettings";
import UploadBS from "./pages-admin/UploadBS/UploadBS";
import { PopupProvider } from "./contexts/PopupContext";
import Popup from "./components/Popup/Popup";
import AddBankAccount from "./components/AddBankAccount/AddBankAccount";
import CategorisationEngine from "./pages-admin/CategorisationEngine/CategorisationEngine";
import Workspace from "./pages-admin/Workspace/Workspace";
import Journal from "./pages-admin/Journal/Journal";

function App() {
  return (
    <CompanyProvider>
      <PopupProvider>
        <SideBarProvider>
          <BrowserRouter
            future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          >
            <MainContent />
          </BrowserRouter>
        </SideBarProvider>
      </PopupProvider>
    </CompanyProvider>
  );
}

function MainContent() {
  const { sideBarType } = useSideBarContext();

  return (
    <div className="page">
      <Header />
      <main className="main">
        <SideBar />
        <section
          className={`body ${
            sideBarType === "large" ? "body-sidebar__lg" : ""
          } ${sideBarType === "small" ? "body-sidebar__sm" : ""}`}
        >
          <CurrentCompany />
          <Routes>
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
            <Route path={staticRoutes.accounting.setup.coa} element={<COA />} />
            <Route
              path={staticRoutes.accounting.setup.finSettings}
              element={<FinancialSettings />}
            />
          </Routes>
        </section>
      </main>

      <Popup popupId="addBankAccount">
        <AddBankAccount />
      </Popup>
    </div>
  );
}

export default App;
