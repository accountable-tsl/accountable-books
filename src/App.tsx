import { BrowserRouter, Routes } from "react-router-dom";
import Header from "./components/Header/Header";
import SideBar from "./components/SideBar/SideBar";
import SideBarProvider from "./contexts/SideBarContext";

function App() {
  return (
    <SideBarProvider>
      <BrowserRouter>
        <div className="page">
          <Header />
          <main className="main">
            <SideBar />
            <section className="body">
              <Routes></Routes>
            </section>
          </main>
        </div>
      </BrowserRouter>
    </SideBarProvider>
  );
}

export default App;
