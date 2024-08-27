import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Header from "./components/Header/Header";
import SideBar from "./components/SideBar/SideBar";
import SideBarProvider from "./contexts/SideBarContext";
import Home from "./pages-users/Home/Home";
import COA from "./pages-admin/COA/COA";
import CurrentCompany from "./components/CurrentCompany/CurrentCompany";
import routes from "./utils/routes";

function App() {
  return (
    <SideBarProvider>
      <BrowserRouter>
        <div className="page">
          <Header />
          <main className="main">
            <SideBar />
            <section className="body">
              {/* <Route path="/login" component={<Login />} />
              <Route path="/register" component={<Register />} /> */}
              <CurrentCompany />
              <Routes>
                <Route path="/" element={<Home />} />

                {/* Accountant-specific routes */}
                <Route path={routes.companies.root} element={<Home />} />
                <>
                  {/* <Route
                  path="/companies/:id/accounting"
                  element={<Accounting />}
                />
                <Route path="/companies/:id/tax" element={<Tax />} />
                <Route path="/companies/:id/reports" element={<Reports />} /> */}

                  {/* Workpapers for Accounting */}
                  {/* <Route
                  path="/companies/:id/workpapers"
                  element={<Workpapers />}
                />
                <Route
                  path="/companies/:id/workpapers/bank-statements"
                  element={<BankStatements />}
                />
                <Route
                  path="/companies/:id/workpapers/categorisation-engine"
                  element={<CategorisationEngine />}
                />
                <Route
                  path="/companies/:id/workpapers/trial-balance"
                  element={<TrialBalance />}
                /> */}
                </>
                {/* Accounting Setup Pages */}
                <Route
                  path={routes.accounting.setup.root}
                  element={<Navigate to={routes.accounting.setup.coa} />}
                />
                <Route path={routes.accounting.setup.coa} element={<COA />} />
                <>
                  {/* <Route
                  path="/companies/:id/workpapers/setup/contacts"
                  element={<Contacts />}
                />
                <Route
                  path="/companies/:id/workpapers/setup/projects"
                  element={<Projects />}
                />
                <Route
                  path="/companies/:id/workpapers/setup/financial-settings"
                  element={<FinancialSettings />}
                /> */}

                  {/* Workpapers for Tax */}
                  {/* <Route
                  path="/companies/:id/tax-workpapers"
                  element={<TaxWorkpapers />}
                />
                <Route
                  path="/companies/:id/tax-workpapers/filing"
                  element={<Filing />}
                />
                <Route
                  path="/companies/:id/tax-workpapers/compliance"
                  element={<Compliance />}
                />
                <Route
                  path="/companies/:id/tax-workpapers/reconciliations"
                  element={<Reconciliations />}
                /> */}
                </>
              </Routes>
            </section>
          </main>
        </div>
      </BrowserRouter>
    </SideBarProvider>
  );
}

export default App;
