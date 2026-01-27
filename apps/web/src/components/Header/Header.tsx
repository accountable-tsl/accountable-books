import './Header.scss';

import { useCompany } from '@/domains-pending-migration/company/store';
import {
  faBars,
  faBell,
  faCalendar,
  faGear,
  faMagnifyingGlass,
  faSun,
} from '@fortawesome/free-solid-svg-icons';
import { LoaderPinwheel } from 'lucide-react';
import { Link } from 'react-router';

import logo from '../../assets/images/mainlogo.png';
import { useSideBarContext } from '../../contexts/SideBarContext';
import Button from '../Button/Button';

export default function Header() {
  const { toggle } = useSideBarContext();
  const { companyId } = useCompany();

  return (
    <header className="header">
      <div className="header-left">
        <Button icon={faBars} text="" variant="text" onClick={toggle} />
        <Link to={`/${companyId}`}>
          <img
            src={logo}
            alt="Accountable Logo"
            className="header-left__logo"
          />
        </Link>
      </div>
      <div className="header-middle">
        <form className="header-middle__form">
          <div className="header-middle__form-search">
            <input
              type="search"
              placeholder="Search"
              className="header-middle__form-input"
            />
            <Button
              icon={faMagnifyingGlass}
              customClass="header-middle__form-submit"
            />
          </div>
          {/* <Button icon={faMicrophone} type="button" /> */}
        </form>
      </div>
      <div className="header-right">
        <div className="header-right-ai">
          <LoaderPinwheel className="header-right-ai__wheel" />
          <span className="header-right-ai__text">AI</span>
        </div>
        <Button
          icon={faCalendar}
          text="Meetings"
          variant="outlined"
          size={0.75}
          customClass="header-right__meeting"
        />
        {/* <Button icon={faMagnifyingGlass} customClass="header-right__search" /> */}
        <div className="header-right__line"></div>
        <Button
          icon={faSun}
          text=""
          variant="text"
          customClass="header-right__icon"
        />
        <Button
          icon={faGear}
          text=""
          variant="text"
          customClass="header-right__icon"
        />
        <div className="header-right__notifications">
          <Button
            icon={faBell}
            text=""
            variant="text"
            customClass="header-right__icon"
          />
          <div className="header-right__notifications--count">8</div>
        </div>
      </div>
    </header>
  );
}
