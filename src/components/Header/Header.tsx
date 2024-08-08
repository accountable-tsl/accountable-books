import { Link } from "react-router-dom";
import "./Header.scss";

export default function Header() {
  return (
    <div className="header">
      <div className="header__left">
        <div></div>
        <Link to="/"></Link>
      </div>
      <div className="header__middle">B</div>
      <div className="header__right">C</div>
    </div>
  );
}
