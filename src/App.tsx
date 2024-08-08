import { BrowserRouter, Routes } from "react-router-dom";
import Header from "./components/Header/Header";

function App() {
  return (
    <>
      <BrowserRouter>
        <h1>Hello World</h1>
        <Header />

        <Routes></Routes>
      </BrowserRouter>
    </>
  );
}

export default App;
