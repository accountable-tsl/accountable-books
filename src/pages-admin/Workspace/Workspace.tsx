import { useState } from "react";
import AccountingWorkspace from "../../components/WorkspaceAcc/WorkspaceAcc";
import "./Workspace.scss";
import { useCompany } from "../../utils/company";

export default function Workspace() {
  const { companyId } = useCompany();
  const [activeTab, setActiveTab] = useState<"acc" | "tax">("acc");
  const [showComingSoon, setShowComingSoon] = useState<boolean>(false);

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
      <div className="workspace-header">
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
      </div>
      {activeTab === "acc" && companyId && (
        <AccountingWorkspace companyId={companyId} />
      )}
    </div>
  );
}
