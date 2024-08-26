import { BrowserRouter, Route, Routes } from "react-router-dom";
import Header from "./components/Header/Header";
import SideBar from "./components/SideBar/SideBar";
import SideBarProvider from "./contexts/SideBarContext";
import Home from "./pages-users/Home/Home";
import COA from "./pages-admin/COA/COA";
import CurrentCompany from "./components/CurrentCompany/CurrentCompany";

function App() {
  return (
    <SideBarProvider>
      <BrowserRouter>
        <div className="page">
          <Header />
          <main className="main">
            <SideBar />
            <section className="body">
              <CurrentCompany />
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/" element={<COA />} />
              </Routes>
            </section>
          </main>
        </div>
      </BrowserRouter>
    </SideBarProvider>
  );
}

export default App;
