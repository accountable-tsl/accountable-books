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
import { useCompany } from "./utils/company";
import FinancialSettings from "./pages-admin/FinancialSettings/FinancialSettings";
import UploadBS from "./pages-admin/UploadBS/UploadBS";
import { PopupProvider } from "./contexts/PopupContext";
import Popup from "./components/Popup/Popup";
import AddBankAccount from "./components/AddBankAccount/AddBankAccount";
import CategorisationEngine from "./pages-admin/CategorisationEngine/CategorisationEngine";

function App() {
  return (
    <CompanyProvider>
      <PopupProvider>
        <SideBarProvider>
          <BrowserRouter>
            <MainContent />
          </BrowserRouter>
        </SideBarProvider>
      </PopupProvider>
    </CompanyProvider>
  );
}

function MainContent() {
  const { companyId } = useCompany();
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
          {/* <Route path="/login" component={<Login />} />
    <Route path="/register" component={<Register />} /> */}
          <CurrentCompany />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path={staticRoutes.companies.root} element={<Home />} />

            <Route
              path={staticRoutes.accounting.workspace.uploadBank}
              element={<UploadBS />}
            />
            <Route
              path={staticRoutes.accounting.workspace.catEngine}
              element={<CategorisationEngine />}
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
            <>
              {/* <Route
        path="/companies/:id/workspace/setup/contacts"
        element={<Contacts />}
      />
      <Route
        path="/companies/:id/workspace/setup/projects"
        element={<Projects />}
      />
 */}

              {/* workspace for Tax */}
              {/* <Route
        path="/companies/:id/tax-workspace"
        element={<Taxworkspace />}
      />
      <Route
        path="/companies/:id/tax-workspace/filing"
        element={<Filing />}
      />
      <Route
        path="/companies/:id/tax-workspace/compliance"
        element={<Compliance />}
      />
      <Route
        path="/companies/:id/tax-workspace/reconciliations"
        element={<Reconciliations />}
      /> */}
            </>
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
