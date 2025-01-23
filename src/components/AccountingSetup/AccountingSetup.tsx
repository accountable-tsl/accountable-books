import "./AccountingSetup.scss";
import { Link } from "react-router-dom";
import { routes } from "../../utils/routes";
import { useCompany } from "../../utils/company";
import { AccountingSetupProps } from "../../types/types";

const AccountingSetup = ({ activeTab, onTabChange }: AccountingSetupProps) => {
  const { companyId } = useCompany();

  return (
    <div className="coa-tab">
      <Link
        to={routes.accounting.setup.coa(companyId)}
        className={`coa-tab__item coa-tab__first ${
          activeTab === "coa" ? "coa-tab__active" : ""
        }`}
        onClick={() => onTabChange("coa")}
      >
        Chart of Accounts
      </Link>
      <Link
        to={routes.accounting.setup.contacts(companyId)}
        className={`coa-tab__item  coa-tab__item--contacts${
          activeTab === "contacts" ? "coa-tab__active" : ""
        }`}
        onClick={() => onTabChange("contacts")}
      >
        Contacts
      </Link>
      <Link
        to={routes.accounting.setup.projects(companyId)}
        className={`coa-tab__item coa-tab__item--projects ${
          activeTab === "projects" ? "coa-tab__active" : ""
        }`}
        onClick={() => onTabChange("projects")}
      >
        Projects
      </Link>
      <Link
        to={routes.accounting.setup.finSettings(companyId)}
        className={`coa-tab__item coa-tab__last ${
          activeTab === "settings" ? "coa-tab__active" : ""
        }`}
        onClick={() => onTabChange("settings")}
      >
        Financial Settings
      </Link>
    </div>
  );
};

export default AccountingSetup;
