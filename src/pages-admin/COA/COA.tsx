import { Link } from "react-router-dom";
import Breadcrumb from "../../components/Breadcrumb/Breadcrumb";
import "./COA.scss";
import { FolderCog, TableProperties } from "lucide-react";
import { useState } from "react";
import { AgGridReact } from "ag-grid-react";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import routes from "../../utils/routes";

export default function COA() {
  const coaPageBreadcrumbs = [
    { text: "Accounting", icon: TableProperties, link: "/" },
    {
      text: "Setup",
      icon: FolderCog,
      hasDropdown: true,
      dropdownItems: [
        { text: "Chart of accounts", link: "/accounting/coa" },
        { text: "Contacts", link: "/accounting/contacts" },
        { text: "Projects", link: "/accounting/projects" },
        { text: "Financial Settings", link: "/accounting/settings" },
      ],
    },
  ];

  const [activeTab, setActiveTab] = useState("coa");
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
  };

  const [coaData, setCoaData] = useState([]);

  const [coaColDefs, setCoaColDefs] = useState([
    { field: "Account Code" },
    { field: "Account Name" },
    { field: "Account Type" },
    { field: "Element" },
    { field: "Balance" },
  ]);

  return (
    <div className="coa">
      <Breadcrumb items={coaPageBreadcrumbs} />
      <div className="coa-container">
        <div className="coa-tab">
          <Link
            to={routes.accounting.setup.coa}
            className={`coa-tab__item coa-tab__first ${
              activeTab === "coa" ? "coa-tab__active" : ""
            }`}
            onClick={() => handleTabChange("coa")}
          >
            Chart of Accounts
          </Link>
          <Link
            to={routes.accounting.setup.contacts}
            className={`coa-tab__item ${
              activeTab === "contacts" ? "coa-tab__active" : ""
            }`}
            onClick={() => handleTabChange("contacts")}
          >
            Contacts
          </Link>
          <Link
            to={routes.accounting.setup.projects}
            className={`coa-tab__item ${
              activeTab === "projects" ? "coa-tab__active" : ""
            }`}
            onClick={() => handleTabChange("projects")}
          >
            Projects
          </Link>
          <Link
            to={routes.accounting.setup.finSettings}
            className={`coa-tab__item coa-tab__last ${
              activeTab === "settings" ? "coa-tab__active" : ""
            }`}
            onClick={() => handleTabChange("settings")}
          >
            Financial Settings
          </Link>
        </div>

        <div className="coa-body"></div>
      </div>
    </div>
  );
}
