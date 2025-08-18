import { Brain, Landmark, NotepadText } from 'lucide-react';
import './WorkspaceAcc.scss';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBuildingColumns,
  faChevronRight,
  faCircleChevronRight,
  faLink,
  faUpload,
} from '@fortawesome/free-solid-svg-icons';
import { BankAccounts, CompanyData } from '../../shared/types/core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getBankAccounts } from '../../services/BankAccountServices';
import Decimal from 'decimal.js';
import { formatAccountText, timeAgo } from '../../utils/utils';
import numeral from 'numeral';
import { Link } from 'react-router-dom';
import { routes } from '@/shared/routes/routes';

interface AccountingWorkspaceProps {
  companyId: string;
  company: CompanyData | null;
}

interface GroupedAccounts {
  [bankId: string]: {
    bankName: string;
    bankLogo?: string;
    accounts: BankAccounts;
    mostRecentUpdatedAt: Date;
  };
}

export default function AccountingWorkspace({ companyId, company }: AccountingWorkspaceProps) {
  const [bankAccounts, setBankAccounts] = useState<BankAccounts>([]);
  const [bankAccountMetadata, setBankAccountMetadata] = useState<any>([]);
  const [error, setError] = useState<string | null>(null);

  //Retrieve Bank Accounts
  const fetchBankAccounts = useCallback(async () => {
    try {
      if (companyId) {
        const response = await getBankAccounts(companyId);
        if (response.success) {
          setBankAccounts(response.data.bankAccounts);
          setBankAccountMetadata(response.data.metadata);
        } else {
          setError('Failed to fetch bank accounts. Please try again later.');
        }
      }
    } catch (error) {
      console.error('Error fetching bank accounts:', error);
      setError('An error occurred while fetching bank accounts.');
    }
  }, [companyId]);

  const getTopTwoBankAccounts = (bankAccounts: BankAccounts) => {
    if (bankAccounts && bankAccounts.length < 3) {
      return bankAccounts;
    } else {
      return bankAccounts.reduce((acc: BankAccounts, curr) => {
        const currBalance = new Decimal(curr.bankBalance as string);
        const firstBalance = new Decimal(acc[0]?.bankBalance ?? -Infinity);
        const secondBalance = new Decimal(acc[1]?.bankBalance ?? -Infinity);

        if (currBalance.gt(firstBalance)) {
          return [curr, acc[0]];
        } else if (currBalance.gt(secondBalance)) {
          return [acc[0], curr];
        }
        return acc;
      }, []);
    }
  };

  const topTwoBankAccounts = useMemo(() => {
    return getTopTwoBankAccounts(bankAccounts);
  }, [bankAccounts]);

  const groupedAccounts = bankAccounts.reduce<GroupedAccounts>((acc, account) => {
    if (!account.bank?.id || !account.updatedAt) return acc;

    const bankId = account.bank.id;
    const updatedAt = new Date(account.updatedAt);

    if (!acc[bankId]) {
      acc[bankId] = {
        bankName: account.bank.name ?? '',
        ...(account.bank.bankLogo && { bankLogo: account.bank.bankLogo }),
        accounts: [],
        mostRecentUpdatedAt: updatedAt,
      };
    } else {
      acc[bankId].mostRecentUpdatedAt =
        updatedAt > acc[bankId].mostRecentUpdatedAt ? updatedAt : acc[bankId].mostRecentUpdatedAt;
    }

    acc[bankId].accounts.push(account);

    return acc;
  }, {});

  useEffect(() => {
    if (!companyId) return;
    fetchBankAccounts();
  }, [companyId, fetchBankAccounts]);

  console.log(bankAccounts, bankAccountMetadata);

  return (
    <div className="wacc">
      <div className="wacc-body">
        <div className="wacc-body-left">
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
                  <Link
                    to={routes.accounting.workspace.uploadBank(companyId)}
                    className="wacc-qa__item wacc-qa__item--center"
                  >
                    <div className="wacc-qa__item--label">Upload</div>
                    <div className="wacc-qa__item--icon">
                      <FontAwesomeIcon icon={faUpload} />
                    </div>
                  </Link>
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
                  <div className="wacc-qa__top--text">Categorisation Engine</div>
                  <div className="wacc-qa__top--icon">
                    <Brain />
                  </div>
                </div>
                <div className="wacc-qa__bottom">
                  <Link
                    to={routes.accounting.workspace.catEngine(companyId)}
                    className="wacc-qa__item"
                  >
                    <div className="wacc-qa__item--text">Visit</div>
                    <div className="wacc-qa__item--icon">
                      <FontAwesomeIcon icon={faChevronRight} />
                    </div>
                  </Link>
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
                  <Link
                    to={routes.accounting.workspace.journal(companyId)}
                    className="wacc-qa__item wacc-qa__item--center"
                  >
                    <div className="wacc-qa__item--label">View journals</div>
                    <div className="wacc-qa__item--icon">
                      {/* <FontAwesomeIcon icon={faEye} /> */}
                    </div>
                  </Link>
                  <Link
                    to={routes.accounting.workspace.newJournal(companyId)}
                    className="wacc-qa__item wacc-qa__item--center wacc-qa__item--border"
                  >
                    <div className="wacc-qa__item--label">Create new</div>
                    <div className="wacc-qa__item--icon">
                      <FontAwesomeIcon icon={faChevronRight} />
                    </div>
                  </Link>
                </div>
              </div>
            </div>
          </div>
          <div className="wacc-wrapper wacc-bank">
            <div className="wacc-qa__header">Bank Account Insights</div>
            <hr />
            <div className="wacc-grid">
              <div className="wacc-card wacc-bank-summary">
                <div className="wacc-bank-summary__content">
                  <div className="wacc-bank-summary__item">
                    <div className="wacc-bank-summary__label">
                      Bank Balances <span>:</span>
                    </div>
                    <div className="wacc-bank-summary__value wacc-bank-summary__total-balance">
                      {company?.reportingCurrencySymbol || ''}{' '}
                      {numeral(bankAccountMetadata?.totalBankBalance || 0).format('(0,0.00)')}
                    </div>
                  </div>
                  <div className="wacc-bank-summary__item">
                    <div className="wacc-bank-summary__label">
                      Ledger Balances <span>:</span>
                    </div>
                    <div className="wacc-bank-summary__value wacc-bank-summary__total-balance">
                      {company?.reportingCurrencySymbol || ''}{' '}
                      {numeral(bankAccountMetadata?.totalLedgerBalance || 0).format('(0,0.00)')}
                    </div>
                  </div>
                  <div className="wacc-bank-summary__item">
                    <div className="wacc-bank-summary__label">
                      Bank Accounts <span>:</span>
                    </div>
                    <div className="wacc-bank-summary__value wacc-bank-summary__account-count">
                      {bankAccountMetadata.totalBankAccounts || 0}
                    </div>
                  </div>
                  <div className="wacc-bank-summary__item">
                    <div className="wacc-bank-summary__label">
                      Needs Reconciliation <span>:</span>
                    </div>
                    <div className="wacc-bank-summary__value">
                      {Math.max(
                        bankAccountMetadata.bankAccountsWithUncategorisedTransactions || 0,
                        bankAccountMetadata.bankAccountsWithAutocategorisedTransactions || 0,
                      )}
                    </div>
                  </div>
                </div>
              </div>
              {!topTwoBankAccounts || topTwoBankAccounts.length === 0 ? (
                <div className="wacc-card wacc-bank-card">{error}</div>
              ) : (
                topTwoBankAccounts.map((bankAccount, index) => (
                  <div key={index} className="wacc-card wacc-bank-card">
                    <div className="wacc-bank-card__item wacc-bank-card__top">
                      <div className="wacc-bank-card__logo">
                        {bankAccount.bank?.bankLogo ? (
                          <img
                            src={bankAccount.bank?.bankLogo || ''}
                            alt="Bank Logo"
                            className="wacc-bank-card__logo--img"
                          />
                        ) : (
                          <FontAwesomeIcon icon={faBuildingColumns} />
                        )}
                      </div>
                      <div className="wacc-bank-card__text">
                        <div className="wacc-bank-card__name">
                          {(() => {
                            let bankAccountName = '';

                            if (bankAccount.displayName && bankAccount.bankAccountNo) {
                              bankAccountName = `${bankAccount.displayName} ${bankAccount.bankAccountNo}`;
                            } else if (bankAccount.displayName) {
                              bankAccountName = bankAccount.displayName;
                            } else if (bankAccount.bankAccountNo) {
                              bankAccountName = bankAccount.bankAccountNo;
                            } else if (bankAccount.bank?.name) {
                              bankAccountName = bankAccount.bank.name;
                            }

                            return bankAccountName ? (
                              <span className="wacc-bank-card__name--text">
                                {formatAccountText(bankAccountName, 12)}
                              </span>
                            ) : (
                              ''
                            );
                          })()}
                          {bankAccount.currency ? (
                            <span className="wacc-bank-card__name--currency">
                              {bankAccount.currency?.code}
                            </span>
                          ) : (
                            ''
                          )}
                        </div>
                        <div className="wacc-bank-card__bank">
                          <span className="wacc-bank-card__bank-name">
                            {bankAccount?.bank?.name || 'Bank Name'}
                          </span>{' '}
                          |{' '}
                          <span className="wacc-bank-card__account-number">
                            {bankAccount.bankAccountNo || ''}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="wacc-bank-card__item wacc-bank-card__mid">
                      <div className="wacc-bank-card__balance">
                        <div className="wacc-bank-card__balance-amount">
                          {bankAccount.currency?.symbol || ''}{' '}
                          {numeral(bankAccount.bankBalance).format('0,0.00')}
                        </div>
                        <div className="wacc-bank-card__balance-label">Statement Balance</div>
                      </div>
                      <div className="wacc-bank-card__balance">
                        <div className="wacc-bank-card__balance-amount">
                          {bankAccount.currency?.symbol || ''}{' '}
                          {numeral(bankAccount.accountInCoa?.nativeBalance || 0).format('(0,0.00)')}
                        </div>
                        <div className="wacc-bank-card__balance-label">Ledger Balance</div>
                      </div>
                    </div>
                    <div className="wacc-bank-card__item wacc-bank-card__bottom">
                      <div className="wacc-bank-card__status">
                        <div className="wacc-bank-card__status-count">
                          {bankAccount.uncategorisedCount || 0}
                        </div>
                        <div className="wacc-bank-card__status-label">Unreconciled</div>
                      </div>
                      <div className="wacc-bank-card__status">
                        <div className="wacc-bank-card__status-count">
                          {bankAccount.autoCategorisedCount || 0}
                        </div>
                        <div className="wacc-bank-card__status-label">Needs Review</div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="wacc-wrapper wacc-nav">
            <div className="wacc-qa__header">Other Navigation</div>
            <hr />
            <div className="wacc-grid">
              <div className="wacc-card wacc-nav-card">
                <Link to={'/'} className="wacc-nav-card__content">
                  Account Transactions
                  <FontAwesomeIcon icon={faCircleChevronRight} />
                </Link>
              </div>
              <div className="wacc-card wacc-nav-card">
                <Link
                  to={routes.accounting.setup.coa(companyId)}
                  className="wacc-nav-card__content"
                >
                  Chart of Accounts
                  <FontAwesomeIcon icon={faCircleChevronRight} />
                </Link>
              </div>
              <div className="wacc-card wacc-nav-card">
                <Link
                  to={routes.accounting.setup.finSettings(companyId)}
                  className="wacc-nav-card__content"
                >
                  Financial Settings
                  <FontAwesomeIcon icon={faCircleChevronRight} />
                </Link>
              </div>
            </div>
          </div>
        </div>
        <div className="wacc-body-right">
          <div className="wacc-body-right__content">
            <div className="wacc-body-right__content--header"></div>
            <div className="wacc-body-right__content--body">
              {/* {bankAccounts} */}
              {Object.entries(groupedAccounts).map(
                ([bankId, { bankName, bankLogo, accounts, mostRecentUpdatedAt }]) => (
                  <div key={bankId} className="wacc-bankaccount">
                    <div className="wacc-bankaccount-head">
                      <div className="wacc-bankaccount-head__logo">
                        {bankLogo ? (
                          <img
                            src={bankLogo}
                            alt="Bank Logo"
                            className="wacc-bankaccount-head__logo--img"
                          />
                        ) : (
                          <FontAwesomeIcon icon={faBuildingColumns} />
                        )}
                      </div>
                      <div className="wacc-bankaccount-head__content">
                        <div className="wacc-bankaccount-head__title">
                          {bankName}{' '}
                          <span className="wacc-bankaccount-head__count">{`(${accounts.length})`}</span>
                        </div>
                        <div className="wacc-bankaccount-head__label">
                          Last updated {timeAgo(mostRecentUpdatedAt)}
                        </div>
                      </div>
                    </div>
                    <div className="wacc-bankaccount-body">
                      {accounts.map((account) => (
                        <div key={account.id} className="wacc-bankaccount-item">
                          <div className="wacc-bankaccount-item__top">
                            <div className="wacc-bankaccount-item__name">{account.displayName}</div>
                            <div className="wacc-bankaccount-item__amount">
                              {account.currency?.symbol || ''}{' '}
                              {numeral(account.bankBalance).format('0,0.00')}
                            </div>
                          </div>
                          <div className="wacc-bankaccount-item__bottom">
                            <div className="wacc-bankaccount-item__status">
                              <span className="wacc-bankaccount-item__status--count">
                                {account.uncategorisedCount || 0}
                              </span>
                              <span className="wacc-bankaccount-item__status--label">
                                Unreconciled
                              </span>
                            </div>
                            <div className="wacc-bankaccount-item__status">
                              <span className="wacc-bankaccount-item__status--count">
                                {account.autoCategorisedCount || 0}
                              </span>
                              <span className="wacc-bankaccount-item__status--label">
                                Needs Review
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ),
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
