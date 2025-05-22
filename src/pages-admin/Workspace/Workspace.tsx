import { useState } from "react";
import AccountingWorkspace from "../../components/WorkspaceAcc/WorkspaceAcc";
import "./Workspace.scss";
import { useCompany } from "@/domains/company/store";
import Breadcrumb from "../../components/Breadcrumb/Breadcrumb";
import { routes } from "@/shared/routes/routes";
import { TableProperties } from "lucide-react";
import TabNavigation from "../../components/TabNavigation/TabNavigation";
import { TabConfig } from "../../types/types";

export default function Workspace() {
  const { companyId, company } = useCompany();
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
      className: "workspace-tab__item--tax",
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
      <Breadcrumb items={workspaceBreadcrumbs} />
      <div className="workspace-headr">
        <TabNavigation<"acc" | "tax">
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={handleTabSwitch}
        />
        {showComingSoon && (
          <span className="workspace-headr__coming-soon">Coming soon...</span>
        )}
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
        <AccountingWorkspace companyId={companyId} company={company} />
      )}
    </div>
  );
}
