import { BrowserRouter, Routes } from "react-router-dom";
import Header from "./components/Header/Header";
import Button from "./components/Button/Button";

function App() {
  return (
    <>
      <BrowserRouter>
        <h1>Hello World</h1>
        <Header />
        <Button />

        <Routes></Routes>
      </BrowserRouter>
    </>
  );
}

export default App;
