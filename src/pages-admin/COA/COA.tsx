import { Link } from "react-router-dom";
import Breadcrumb from "../../components/Breadcrumb/Breadcrumb";
import "./COA.scss";
import { FolderCog, TableProperties } from "lucide-react";
import { useState } from "react";

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

  return (
    <div className="coa">
      <Breadcrumb items={coaPageBreadcrumbs} />
      <div className="coa-body">
        <div className="coa-tab">
          <Link
            to="/accounting/coa"
            className={`coa-tab__item coa-tab__first ${
              activeTab === "coa" ? "coa-tab__active" : ""
            }`}
            onClick={() => handleTabChange("coa")}
          >
            Chart of Accounts
          </Link>
          <Link
            to="/accounting/contacts"
            className={`coa-tab__item ${
              activeTab === "contacts" ? "coa-tab__active" : ""
            }`}
            onClick={() => handleTabChange("contacts")}
          >
            Contacts
          </Link>
          <Link
            to="/accounting/projects"
            className={`coa-tab__item ${
              activeTab === "projects" ? "coa-tab__active" : ""
            }`}
            onClick={() => handleTabChange("projects")}
          >
            Projects
          </Link>
          <Link
            to="/accounting/settings"
            className={`coa-tab__item coa-tab__last ${
              activeTab === "settings" ? "coa-tab__active" : ""
            }`}
            onClick={() => handleTabChange("settings")}
          >
            Financial Settings
          </Link>
        </div>
      </div>
    </div>
  );
}
