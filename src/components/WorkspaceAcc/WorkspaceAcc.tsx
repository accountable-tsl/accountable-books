import { Brain, Landmark, NotepadText } from "lucide-react";
import "./WorkspaceAcc.scss";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronRight,
  faLink,
  faUpload,
} from "@fortawesome/free-solid-svg-icons";

interface AccountingWorkspaceProps {
  companyId: string;
}
export default function AccountingWorkspace({
  companyId,
}: AccountingWorkspaceProps) {
  return (
    <div className="wacc">
      <div className="wacc-header"></div>
      <div className="wacc-body">
        <div className="wacc-body__left">
          <div className="wacc-qa">
            <div className="wacc-qa__header">Quick Actions</div>
            <div className="wacc-qa__grid">
              {/*  Bank Actions */}
              <div className="wacc-qa__card">
                <div className="wacc-qa__top">
                  <div className="wacc-qa__top--text">Bank Transactions</div>
                  <div className="wacc-qa__top--icon">
                    <Landmark />
                  </div>
                </div>
                <div className="wacc-qa__bottom">
                  <div className="wacc-qa__item wacc-qa__item--center">
                    <div className="wacc-qa__item--label">Upload</div>
                    <div className="wacc-qa__item--icon">
                      <FontAwesomeIcon icon={faUpload} />
                    </div>
                  </div>
                  <div className="wacc-qa__item wacc-qa__item--center wacc-qa__item--border">
                    <div className="wacc-qa__item--label">Connect</div>
                    <div className="wacc-qa__item--icon">
                      <FontAwesomeIcon icon={faLink} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Categorisation Engine */}
              <div className="wacc-qa__card wacc-qa__card-catengine">
                <div className="wacc-qa__top">
                  <div className="wacc-qa__top--text">
                    Categorisation Engine
                  </div>
                  <div className="wacc-qa__top--icon">
                    <Brain />
                  </div>
                </div>
                <div className="wacc-qa__bottom">
                  <div className="wacc-qa__item">
                    <div className="wacc-qa__item--text">Visit</div>
                    <div className="wacc-qa__item--icon">
                      <FontAwesomeIcon icon={faChevronRight} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Go to Journal Entry */}
              <div className="wacc-qa__card wacc-qa__card-journal">
                <div className="wacc-qa__top">
                  <div className="wacc-qa__top--text">Journal Entry </div>
                  <div className="wacc-qa__top--icon">
                    <NotepadText />
                  </div>
                </div>
                <div className="wacc-qa__bottom">
                  <div className="wacc-qa__item">
                    <div className="wacc-qa__item--text">Create new</div>
                    <div className="wacc-qa__item--icon">
                      <FontAwesomeIcon icon={faChevronRight} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="wacc-wrapper wacc-bank__summary">
            <div className="wacc-bank__summary--item">
              <div className="wacc-bank__title">Bank Balance</div>
              <div className="wacc-bank__value wacc-bank__totalbal">
                100,000,000.00
              </div>
            </div>
            <div className="wacc-bank__summary--item">
              <div className="wacc-bank__title">Bank Accounts</div>
              <div className="wacc-bank__totalbal">11</div>
            </div>
            <div className="wacc-bank__summary--item">
              <div className="wacc-bank__title">Needs Reconciliation</div>
              <div className="wacc-bank__totalbal">3</div>
            </div>
          </div>
          <div className="wacc-wrapper wacc-quicklinks"></div>
          <div className="wacc-wrapper wacc-nav"></div>
        </div>
        <div className="wacc-body__right"></div>
      </div>
    </div>
  );
}
