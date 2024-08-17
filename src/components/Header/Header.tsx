import "./Header.scss";
import { Link } from "react-router-dom";
import logo from "../../assets/images/mainlogo.png";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBars } from "@fortawesome/free-solid-svg-icons";

export default function Header() {
  return (
    <div className="header">
      <div className="header-left">
        <button className="header-left__icon">
          <FontAwesomeIcon icon={faBars} />
        </button>
        <Link to="/">
          <img
            src={logo}
            alt="Accountable Logo"
            className="header-left__logo"
          />
        </Link>
      </div>
      <div className="header-middle">B</div>
      <div className="header-right">C</div>
    </div>
  );
}
