import { useState } from "react";
import AccountingWorkspace from "../../components/WorkspaceAcc/WorkspaceAcc";
import "./Workspace.scss";
import { useCompany } from "../../utils/company";
import Breadcrumb from "../../components/Breadcrumb/Breadcrumb";
import { routes } from "../../utils/routes";
import { TableProperties } from "lucide-react";
import TabNavigation from "../../components/TabNavigation/TabNavigation";
import { TabConfig } from "../../types/types";

export default function Workspace() {
  const { companyId } = useCompany();
  const [activeTab, setActiveTab] = useState<"acc" | "tax">("acc");
  const [showComingSoon, setShowComingSoon] = useState<boolean>(false);

  const workspaceBreadcrumbs = [
    {
      text: "Workspace",
      icon: TableProperties,
      link: routes.accounting.workspace.root(companyId),
    },
  ];

  const tabs: TabConfig<"acc" | "tax">[] = [
    {
      key: "acc",
      label: "Accounting Workspace",
      link: routes.accounting.workspace.root(companyId),
    },
    {
      key: "tax",
      label: "Tax Workspace",
      link: routes.accounting.workspace.root(companyId),
    },
  ];

  const handleTabSwitch = (tab: "acc" | "tax") => {
    if (tab === "tax") {
      setShowComingSoon(true);
      setTimeout(() => setShowComingSoon(false), 1000);
    } else {
      setActiveTab(tab);
    }
  };

  return (
    <div className="workspace">
      <div className="workspace-headr">
        <Breadcrumb items={workspaceBreadcrumbs} />

        <TabNavigation<"acc" | "tax">
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={handleTabSwitch}
        />
      </div>
      {/* <div className="workspace-header">
        <div className="workspace-tab">
          <div
            className={`workspace-tab__item workspace-tab__item--acc ${
              activeTab === "acc" ? "workspace-tab__item--active" : ""
            }`}
            onClick={() => handleTabSwitch("acc")}
          >
            Accounting Workspace
          </div>
          <div
            className={`workspace-tab__item workspace-tab__item--tax ${
              activeTab === "tax" ? "workspace-tab__item--active" : ""
            }`}
            onClick={() => handleTabSwitch("tax")}
          >
            Tax Workspace
            {showComingSoon && (
              <span className="workspace-tab__soon">Coming soon...</span>
            )}
          </div>
        </div>
        <hr className="workspace-header__hr" />
      </div> */}
      {activeTab === "acc" && companyId && (
        <AccountingWorkspace companyId={companyId} />
      )}
    </div>
  );
}
