import { BrowserRouter, Routes } from "react-router-dom";
import Header from "./components/Header/Header";
import Button from "./components/Button/Button";
import { faCircle } from "@fortawesome/free-solid-svg-icons";

function App() {
  return (
    <>
      <BrowserRouter>
        <h1>Hello World</h1>
        <Header />
        <Button icon={faCircle} text="" />

        <Routes></Routes>
      </BrowserRouter>
    </>
  );
}

export default App;
