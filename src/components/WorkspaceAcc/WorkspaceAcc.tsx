import { Brain, Landmark, NotepadText } from "lucide-react";
import "./WorkspaceAcc.scss";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronRight,
  faLink,
  faUpload,
} from "@fortawesome/free-solid-svg-icons";
import { BankAccounts, CompanyData } from "../../types/types";
import { useCallback, useEffect, useState } from "react";
import { getBankAccounts } from "../../services/BankAccountServices";
import { fetchCompany } from "../../services/CompanyServices";

interface AccountingWorkspaceProps {
  companyId: string;
}
export default function AccountingWorkspace({
  companyId,
}: AccountingWorkspaceProps) {
  const [company, setCompany] = useState<CompanyData>();
  const [bankAccounts, setBankAccounts] = useState<BankAccounts>([]);
  const [error, setError] = useState<string | null>(null);

  //Retrieve Bank Accounts
  const fetchBankAccounts = useCallback(async () => {
    try {
      if (companyId) {
        const response = await getBankAccounts(companyId);
        if (response.success) {
          setBankAccounts(response.data.bankAccounts);
        } else {
          setError("Failed to fetch bank accounts. Please try again later.");
        }
      }
    } catch (error) {
      console.error("Error fetching bank accounts:", error);
      setError("An error occurred while fetching bank accounts.");
    }
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;

    const controller = new AbortController();
    const getCompanyDetails = async () => {
      const result = await fetchCompany(companyId);
      if (result.success) {
        setCompany(result.data);
      }
    };
    getCompanyDetails();
    return () => controller.abort();
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    fetchBankAccounts();
  }, [companyId, fetchBankAccounts]);

  console.log("Company:", company, "Bank Accounts:", bankAccounts);

  return (
    <div className="wacc">
      <div className="wacc-body">
        <div className="wacc-body__left">
          <div className="wacc-qa">
            <div className="wacc-qa__header">Quick Actions</div>
            <hr />
            <div className="wacc-grid">
              {/*  Bank Actions */}
              <div className="wacc-card">
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
              <div className="wacc-card wacc-qa__card-catengine">
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
              <div className="wacc-card wacc-qa__card-journal">
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
          <div className="wacc-wrapper wacc-bank">
            <div className="wacc-qa__header">Bank Accounts</div>
            <hr />
            <div className="wacc-grid">
              <div className="wacc-card wacc-bank-summary">
                <div className="wacc-bank-summary__content">
                  <div className="wacc-bank-summary__item">
                    <div className="wacc-bank-summary__label">
                      Bank Balances <span>:</span>
                    </div>
                    <div className="wacc-bank-summary__value wacc-bank-summary__total-balance">
                      100,000,000.00
                    </div>
                  </div>
                  <div className="wacc-bank-summary__item">
                    <div className="wacc-bank-summary__label">
                      Bank Accounts <span>:</span>
                    </div>
                    <div className="wacc-bank-summary__value wacc-bank-summary__account-count">
                      11
                    </div>
                  </div>
                  <div className="wacc-bank-summary__item">
                    <div className="wacc-bank-summary__label">
                      Needs Reconciliation <span>:</span>
                    </div>
                    <div className="wacc-bank-summary__value">3</div>
                  </div>
                </div>
              </div>
              <div className="wacc-card wacc-bank-card">
                <div className="wacc-bank-card__item wacc-bank-card__top">
                  <div className="wacc-bank-card__logo"></div>
                  <div className="wacc-bank-card__text">
                    <div className="wacc-bank-card__name">Display Name</div>
                    <div className="wacc-bank-card__bank">
                      <span className="wacc-bank-card__bank-name">Bank</span> |{" "}
                      <span className="wacc-bank-card__account-number">
                        Account Number
                      </span>
                    </div>
                  </div>
                </div>
                <div className="wacc-bank-card__item wacc-bank-card__mid">
                  <div className="wacc-bank-card__balance-label">Balance</div>
                  <div className="wacc-bank-card__balance-amount">
                    NGN 100,000,000.00
                  </div>
                </div>
                <div className="wacc-bank-card__item wacc-bank-card__bottom">
                  <div className="wacc-bank-card__status">
                    <div className="wacc-bank-card__status-count">201</div>
                    <div className="wacc-bank-card__status-label">
                      Unreconciled
                    </div>
                  </div>
                  <div className="wacc-bank-card__status">
                    <div className="wacc-bank-card__status-count">201</div>
                    <div className="wacc-bank-card__status-label">
                      Needs Review
                    </div>
                  </div>
                </div>
              </div>
              <div className="wacc-card"></div>
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
