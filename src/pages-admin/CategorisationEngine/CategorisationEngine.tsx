import {
  Brain,
  CirclePlay,
  Expand,
  Landmark,
  ListFilter,
  Menu,
  TableProperties,
} from "lucide-react";
import Breadcrumb from "../../components/Breadcrumb/Breadcrumb";
import { useCompany } from "../../utils/company";
import { routes } from "../../utils/routes";
import { DatePicker } from "antd";

import "./CategorisationEngine.scss";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { RangePickerProps } from "antd/es/date-picker";
import { retrieveTransactions } from "../../services/BankTransactionServices";
import {
  BankAccount,
  BankAccounts,
  BankTransactionFilters,
  CatEngineTransaction,
  Coa,
  Transaction,
  TransactionKey,
} from "../../types/types";
import { formatDate, formatNumericValue } from "../../utils/utils";
import Decimal from "decimal.js";
import {
  getBankAccountById,
  getBankAccounts,
} from "../../services/BankAccountServices";

import numeral from "numeral";
import { fetchCompany } from "../../services/CompanyServices";
import { fetchCoa } from "../../services/CoaServices";
import CustomSelect from "../../components/CoaSelectCellEditor/CoaSelectCellEditor";
import Dropdown from "../../components/Dropdown/Dropdown";

const catengineHeaders = [
  { label: "Bank", key: "bankAccount", pinned: "left" },
  { label: "Date", key: "date", pinned: "left" },
  { label: "FS Date", key: "fsDate", pinned: null },
  { label: "Contact", key: "contact", pinned: null },
  { label: "Reference", key: "reference", pinned: null },
  { label: "Project", key: "project", pinned: null },
  { label: "Description", key: "description", pinned: "left" },
  { label: "Curr", key: "currency", pinned: null },
  { label: "Bank Amount", key: "bankAmount", pinned: null },
  { label: "Exr", key: "exchangeRate", pinned: null },
  { label: "Amount", key: "amount", pinned: "right" },
  { label: "Account", key: "account", pinned: "right" },
];
export default function CategorisationEngine() {
  const { companyId } = useCompany();

  const [error, setError] = useState<string | null>(null);
  const [fetchedBankTransactions, setFetchedBankTransactions] = useState<
    CatEngineTransaction[]
  >([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccounts>([]);
  const [selectedBankAccount, setSelectedBankAccount] =
    useState<BankAccount | null>(null);
  const [coa, setCoa] = useState([]);
  const [coaLimit, setCoaLimit] = useState(500);
  const [filterAmounts, setFilterAmounts] = useState({
    minAmount: "",
    maxAmount: "",
  });
  const [filterDates, setFilterDates] = useState<{
    startDate?: Date;
    endDate?: Date;
  }>({});
  const [companyInfo, setCompanyInfo] = useState(null);
  const [selectedRows, setSelectedRows] = useState<CatEngineTransaction[]>([]);
  const [columnWidths, setColumnWidths] = useState<number[]>(
    Array(catengineHeaders.length).fill(100)
  );
  const [rowHeight, setRowHeight] = useState<string | "min" | "mid" | "max">(
    "mid"
  );
  const [updatedTransactions, setUpdatedTransactions] = useState<
    CatEngineTransaction[]
  >([]);
  const [selectedOption, setSelectedOption] = useState(null);

  // const [pinnedLeft, setPinnedLeft] = useState<string[]>(["bankAccount"]);
  // const [pinnedRight, setPinnedRight] = useState<string[]>(["amount"]);

  const catEngineBreadcrumbs = [
    {
      text: "Accounting",
      icon: TableProperties,
      link: routes.accounting.root(companyId),
    },
    {
      text: "Categorisation Engine",
      icon: Brain,
      link: routes.accounting.workspace.catEngine(companyId),
      hasDropdown: false,
    },
  ];

  const { RangePicker } = DatePicker;
  const handleFilterDates: RangePickerProps["onChange"] = (value) => {
    if (value) {
      setFilterDates({
        startDate: value[0]?.toDate(),
        endDate: value[1]?.toDate(),
      });
    } else {
      setFilterDates({});
    }
  };

  const handleAmountChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    const numericValue = value
      .replace(/[^0-9.]/g, "") // Remove non-numeric and non-period characters
      .replace(/(\..*?)\..*/g, "$1"); // Ensure only one period

    setFilterAmounts((prevAmounts) => ({
      ...prevAmounts,
      [name]: numericValue,
    }));
  };

  const handleBankAccountChange = (
    event: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const selectedId = event.target.value;
    const account = bankAccounts.find((acc) => acc.id === selectedId) || null;
    setSelectedBankAccount(account);
  };

  const handleAllBanks = (event: React.MouseEvent<HTMLButtonElement>) => {
    setSelectedBankAccount(null);
  };

  // Memoized filters to prevent unnecessary re-renders
  const filters = useMemo(() => {
    const newFilters: BankTransactionFilters = {};
    if (filterDates.startDate) newFilters.startDate = filterDates.startDate;
    if (filterDates.endDate) newFilters.endDate = filterDates.endDate;
    if (selectedBankAccount) newFilters.bankAccountId = selectedBankAccount.id;
    if (filterAmounts.minAmount)
      newFilters.minAmount = new Decimal(filterAmounts.minAmount);
    if (filterAmounts.maxAmount)
      newFilters.maxAmount = new Decimal(filterAmounts.maxAmount);
    return newFilters;
  }, [filterDates, selectedBankAccount, filterAmounts]);

  const getBankTransactions = useCallback(
    async (filters: BankTransactionFilters) => {
      try {
        if (companyId) {
          const response = await retrieveTransactions(companyId, filters);
          if (response.success && response.data?.transactions) {
            setFetchedBankTransactions(response.data.transactions);
          } else {
            setError("Failed to fetch transactions");
            console.error("Failed to fetch transactions:", response);
            setFetchedBankTransactions([]);
          }
        }
      } catch (error) {
        console.error("Error fetching bank transactions:", error);
        setError("An error occurred while fetching bank transactions.");
      }
    },
    [companyId, filters]
  );

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

  const getCOA = useCallback(async () => {
    try {
      if (companyId) {
        const params = {
          companyId,
          limit: coaLimit,
        };
        const coa = await fetchCoa(params);
        if (coa.success && coa.pagination.totalItems > coaLimit) {
          setCoaLimit(coa.pagination.totalItems);
        }
        if (coa.success) {
          setCoa(coa.data);
        } else {
          setError("Failed to fetch COA. Please try again later.");
        }
      }
    } catch (error) {
      console.error("Error fetching COA:", error);
      setError("An error occurred while fetching COA.");
    }
  }, [companyId]);

  const handleRowClick = (tx: CatEngineTransaction) => {
    setSelectedRows((prev) =>
      prev.some((row) => row.id === tx.id)
        ? prev.filter((row) => row.id !== tx.id)
        : [...prev, tx]
    );
  };

  const handleResize = (event: React.MouseEvent, colIndex: number) => {
    const startX = event.clientX;
    const startWidth = columnWidths[colIndex];

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const newWidth = Math.max(startWidth + deltaX, 50);
      setColumnWidths((prev) =>
        prev.map((width, index) => (index === colIndex ? newWidth : width))
      );
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const handleTransactionChange = (
    transactionId: string,
    updates: Partial<CatEngineTransaction>
  ) => {
    const oldTx = fetchedBankTransactions.find((tx) => tx.id === transactionId);
    if (!oldTx) return;

    const updatedTx = { ...oldTx, ...updates };

    setFetchedBankTransactions((prev) =>
      prev.map((tx) => (tx.id === transactionId ? { ...tx, ...updates } : tx))
    );

    // Update or insert into the updatedTransactions array
    setUpdatedTransactions((prevUpdated) => {
      const index = prevUpdated.findIndex((tx) => tx.id === transactionId);

      if (index === -1) {
        // If not in the array, add a new entry
        return [...prevUpdated, updatedTx];
      } else {
        const newUpdatedArray = [...prevUpdated];
        newUpdatedArray[index] = updatedTx;
        return newUpdatedArray;
      }
    });
  };

  useEffect(() => {
    if (!companyId) return;

    const controller = new AbortController();
    const getCompanyDetails = async () => {
      const result = await fetchCompany(companyId);
      if (result.success) {
        setCompanyInfo(result.data);
      }
    };
    getCompanyDetails();
    return () => controller.abort();
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    const controller = new AbortController();
    const fetchTransactions = async () => {
      await getBankTransactions(filters);
    };
    fetchTransactions();

    return () => controller.abort();
  }, [companyId, filters, getBankTransactions]);

  useEffect(() => {
    if (!companyId) return;
    fetchBankAccounts();
  }, [companyId, fetchBankAccounts]);

  useEffect(() => {
    if (!companyId) return;
    getCOA();
  }, [companyId, coaLimit, getCOA]);

  // useEffect(() => {
  //   setColumnDefs((prevColumnDefs) =>
  //     prevColumnDefs.map((col) =>
  //       col.headerName === "Account"
  //         ? { ...col, cellEditorParams: { options: coa } }
  //         : col
  //     )
  //   );
  // }, [coa]);
  console.log(fetchedBankTransactions, updatedTransactions, coa);

  return (
    <div className="catengine">
      <Breadcrumb items={catEngineBreadcrumbs} />

      <div className="catengine-container">
        <div className="catengine-summary">
          <div className="catengine-summary__item catengine-summary__lines">
            <div className="catengine-summary__lines-wrapper">
              <div className="catengine-summary__lines-label">Total Lines</div>
              <div className="catengine-summary__lines-value">1767</div>
            </div>

            <div className="catengine-summary__lines-wrapper">
              <div className="catengine-summary__lines-label">
                Left to Reconcile
              </div>
              <div className="catengine-summary__lines-value">1767</div>
            </div>
          </div>
          <hr className="catengine-hr" />
          <div className="catengine-summary__item catengine-summary__bank">
            <button
              className={`catengine-summary__bank-label ${
                selectedBankAccount
                  ? "catengine-summary__bank-label--disabled"
                  : ""
              }`}
              onClick={handleAllBanks}
            >
              All Bank Accounts
            </button>
            <select
              name="selectBankAccount"
              id="selectBankAccount"
              className={`catengine-summary__bank-select ${
                selectedBankAccount
                  ? ""
                  : "catengine-summary__bank-select--disabled"
              }`}
              onChange={handleBankAccountChange}
              value={selectedBankAccount?.id || ""}
            >
              <option value="">Filter by Bank</option>
              {bankAccounts.map((bankAccount) => (
                <option key={bankAccount.id} value={bankAccount.id}>
                  {bankAccount.displayName} ({bankAccount.bankAccountNo})
                </option>
              ))}
            </select>
          </div>
          <hr className="catengine-hr" />
          <div className="catengine-summary__item catengine-summary__amount">
            <div className="catengine-summary__amount-wrapper">
              <div className="catengine-summary__amount-label">Total Debit</div>
              <div className="catengine-summary__amount-value">
                NGN 1,000,000,000.00
              </div>
            </div>
            <div className="catengine-summary__amount-wrapper">
              <div className="catengine-summary__amount-label">
                Total Credit
              </div>
              <div className="catengine-summary__amount-value">
                NGN 1,000,000,000.00
              </div>
            </div>
          </div>
        </div>

        <div className="catengine-smallbody">
          Please view this page on a larger screen.
        </div>

        <div className="catengine-body">
          <div className="catengine-body__top">
            <div className="catengine-body__top-left">
              <div className="catengine-body__top-filter">
                <div className="catengine-body__top-filter--item">
                  <ListFilter size={18} />{" "}
                  <span className="catengine-body__top-filter--text">
                    {" "}
                    Filters:
                  </span>
                  <RangePicker onChange={handleFilterDates} />
                </div>
                <div className="catengine-body__top-vr--1"></div>
                <div className="catengine-body__top-filter--item">
                  <span>Showing</span>
                  <select
                    name="isCategorised"
                    id="isCategorised"
                    className="catengine-body__top-filter--select"
                  >
                    <option value="">Unclassified Lines</option>
                    <option value="">Classified Lines</option>
                    <option value="">All Transactions</option>
                  </select>
                </div>
              </div>
              {/* <div className="catengine-body__top-count">200 of 1767</div> */}
            </div>
            <div className="catengine-body__top-right">
              <div className="catengine-body__top-amount">
                <span>Filter by Amount: </span>
                <div>
                  <label
                    htmlFor="maxAmount"
                    className={
                      filterAmounts.minAmount
                        ? "catengine-body__top-amount--label1"
                        : "catengine-body__top-amount--label2"
                    }
                  >
                    min amount
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    name="minAmount"
                    id="minAmount"
                    placeholder="Min Amount"
                    className="catengine-body__top-amount--min"
                    onChange={handleAmountChange}
                    value={formatNumericValue(filterAmounts.minAmount)}
                  />
                </div>
                <div>
                  <label
                    htmlFor="maxAmount"
                    className={
                      filterAmounts.maxAmount
                        ? "catengine-body__top-amount--label1"
                        : "catengine-body__top-amount--label2"
                    }
                  >
                    max amount
                  </label>

                  <input
                    type="text"
                    inputMode="numeric"
                    name="maxAmount"
                    id="maxAmount"
                    placeholder="Max Amount"
                    className="catengine-body__top-amount--min"
                    onChange={handleAmountChange}
                    value={formatNumericValue(filterAmounts.maxAmount)}
                  />
                </div>
                <div>
                  <CirclePlay />
                </div>
              </div>

              <div className="catengine-body__top-view">
                <div className="catengine-body__top-rowheight">
                  <div className="catengine-body__top-rowheight--item">
                    <Menu strokeWidth={1} onClick={() => setRowHeight("min")} />
                  </div>
                  <div
                    className="catengine-body__top-rowheight--item"
                    onClick={() => setRowHeight("mid")}
                  >
                    <Menu strokeWidth={2.5} />
                  </div>
                  <div className="catengine-body__top-rowheight--item">
                    <Menu strokeWidth={4} onClick={() => setRowHeight("max")} />
                  </div>
                </div>
                <div className="catengine-body__top-vr"></div>
                <div className="catengine-body__top-fullscreen">
                  <Expand className="catengine-body__top-fullscreen--icon" />
                </div>
              </div>
            </div>
          </div>
          <div className="catengine-table">
            <div className="catengine-table__container" role="table">
              <div className="catengine-table__header" role="row">
                <div className="catengine-table__pinned catengine-table__pinned-header catengine-table__pinned-left">
                  <div className="catengine-table__row catengine-table__row--left catengine-table__row--header">
                    <div className=" catengine-table__cell catengine-table__cell--checkbox">
                      <input type="checkbox" />
                    </div>
                    {catengineHeaders
                      .filter((i) => i.pinned === "left")
                      .map((header, index) => (
                        <div
                          key={header.key}
                          className={`catengine-table__cell catengine-table__cell--${header.key}`}
                          role="columnheader"
                          style={{ width: columnWidths[index] }}
                        >
                          {header.label}
                          <span
                            className="catengine-table__resize"
                            onMouseDown={(e) => handleResize(e, index)}
                          />
                        </div>
                      ))}
                  </div>
                </div>
                <div className="catengine-table__pinned catengine-table__pinned-header catengine-table__pinned-not">
                  <div className="catengine-table__row catengine-table__row--not catengine-table__row--header">
                    {catengineHeaders
                      .filter((i) => !i.pinned)
                      .map((header, index) => (
                        <div
                          key={header.key}
                          className={`catengine-table__cell catengine-table__cell--${header.key}`}
                          role="columnheader"
                          style={{ width: columnWidths[index] }}
                        >
                          {header.label}
                          <span
                            className="catengine-table__resize"
                            onMouseDown={(e) => handleResize(e, index)}
                          />
                        </div>
                      ))}
                  </div>
                </div>
                <div className="catengine-table__pinned catengine-table__pinned-header catengine-table__pinned-right">
                  <div className="catengine-table__row catengine-table__row--right catengine-table__row--header">
                    {catengineHeaders
                      .filter((i) => i.pinned === "right")
                      .map((header, index) => (
                        <div
                          key={header.key}
                          className={`catengine-table__cell catengine-table__cell--${header.key}`}
                          role="columnheader"
                          // style={{ width: columnWidths[index] }}
                        >
                          {header.label}
                          <span
                            className="catengine-table__resize"
                            onMouseDown={(e) => handleResize(e, index)}
                          />
                        </div>
                      ))}
                  </div>
                </div>
              </div>
              <div className="catengine-table__body" role="rowgroup">
                {fetchedBankTransactions.length === 0 ? (
                  <div className="catengine-table__no-data">
                    No Transactions Found
                  </div>
                ) : (
                  <>
                    <div className="catengine-table__pinned catengine-table__pinned-body catengine-table__pinned-left">
                      {fetchedBankTransactions.map(
                        (tx: CatEngineTransaction) => (
                          <div
                            key={tx.id}
                            className={`catengine-table__row catengine-table__row--left ${
                              selectedRows.some((row) => row.id === tx.id)
                                ? "catengine-table__row--selected"
                                : ""
                            } ${
                              rowHeight === "mid"
                                ? "catengine-table__row--h-mid"
                                : rowHeight === "min"
                                ? "catengine-table__row--h-min"
                                : "catengine-table__row--h-max"
                            }`}
                            onClick={() => handleRowClick(tx)}
                            role="row"
                          >
                            <div className=" catengine-table__cell catengine-table__cell--checkbox">
                              <input
                                type="checkbox"
                                checked={selectedRows.some(
                                  (row) => row.id === tx.id
                                )}
                                readOnly
                              />
                            </div>
                            {catengineHeaders
                              .filter((i) => i.pinned === "left")
                              .map((header, index) => (
                                <div
                                  key={`${tx.id}-${header.key}`}
                                  className={`catengine-table__cell catengine-table__cell--${header.key} `}
                                  role="cell"
                                >
                                  {renderCellContent(header.key, tx, coa)}
                                  <span
                                    className="catengine-table__resize"
                                    onMouseDown={(e) => handleResize(e, index)}
                                  />
                                </div>
                              ))}
                          </div>
                        )
                      )}
                    </div>

                    <div className="catengine-table__pinned catengine-table__pinned-body catengine-table__pinned-not">
                      {fetchedBankTransactions.map(
                        (tx: CatEngineTransaction) => (
                          <div
                            key={tx.id}
                            className={`catengine-table__row ${
                              selectedRows.some((row) => row.id === tx.id)
                                ? "catengine-table__row--selected"
                                : ""
                            } ${
                              rowHeight === "mid"
                                ? "catengine-table__row--h-mid"
                                : rowHeight === "min"
                                ? "catengine-table__row--h-min"
                                : "catengine-table__row--h-max"
                            }`}
                            onClick={() => handleRowClick(tx)}
                            role="row"
                          >
                            {catengineHeaders
                              .filter((i) => !i.pinned)
                              .map((header, index) => (
                                <div
                                  key={`${tx.id}-${header.key}`}
                                  className={`catengine-table__cell catengine-table__cell--${header.key}`}
                                  role="cell"
                                >
                                  {renderCellContent(
                                    header.key,
                                    tx,
                                    coa,
                                    handleTransactionChange
                                  )}
                                  <span
                                    className="catengine-table__resize"
                                    onMouseDown={(e) => handleResize(e, index)}
                                  />
                                </div>
                              ))}
                          </div>
                        )
                      )}
                    </div>

                    <div className="catengine-table__pinned catengine-table__pinned-body catengine-table__pinned-right">
                      {fetchedBankTransactions.map(
                        (tx: CatEngineTransaction) => (
                          <div
                            key={tx.id}
                            className={`catengine-table__row catengine-table__row--right ${
                              selectedRows.some((row) => row.id === tx.id)
                                ? "catengine-table__row--selected"
                                : ""
                            } ${
                              rowHeight === "mid"
                                ? "catengine-table__row--h-mid"
                                : rowHeight === "min"
                                ? "catengine-table__row--h-min"
                                : "catengine-table__row--h-max"
                            }`}
                            // onClick={() => handleRowClick(tx)}
                            role="row"
                          >
                            {catengineHeaders
                              .filter(
                                (i) =>
                                  i.pinned === "right" && i.key !== "account"
                              )
                              .map((header, index) => (
                                <div
                                  key={`${tx.id}-${header.key}`}
                                  className={`catengine-table__cell catengine-table__cell--${header.key} `}
                                  role="cell"
                                >
                                  {renderCellContent(
                                    header.key,
                                    tx,
                                    coa,
                                    handleTransactionChange
                                  )}
                                  <span
                                    className="catengine-table__resize"
                                    onMouseDown={(e) => handleResize(e, index)}
                                  />
                                </div>
                              ))}

                            {catengineHeaders
                              .filter(
                                (i) =>
                                  i.pinned === "right" && i.key === "account"
                              )
                              .map((header, index) => (
                                <React.Fragment key={`${tx.id}-${header.key}`}>
                                  {renderCellContent(
                                    header.key,
                                    tx,
                                    coa,
                                    handleTransactionChange
                                  )}
                                </React.Fragment>
                              ))}
                          </div>
                        )
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="catengine-table__pagination">
              <div className="catengine-table__pagination-left">
                <span>Page</span>
                <select>
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                </select>

                <span>of 1 (20 total items)</span>
              </div>

              <div className="catengine-table__pagination-middle">
                <span>Showing</span>
                <select>
                  <option value="20">20</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                </select>
                <span>items per page</span>
              </div>

              <div className="catengine-table__pagination-right">
                <button
                  className="catengine-table__nav-button"
                  // onClick={() => handlePageChange("start")}
                  // disabled={isFirstPage}
                >
                  {"<<"} Start
                </button>
                <button
                  className="catengine-table__nav-button"
                  // onClick={() => handlePageChange("previous")}
                  // disabled={isFirstPage}
                >
                  Previous
                </button>
                <div className="catengine-table__current-page">
                  {/* <span>{currentPage}</span> */}
                </div>
                <button
                  className="catengine-table__nav-button"
                  // onClick={() => handlePageChange("next")}
                  // disabled={isLastPage}
                >
                  Next {">"}
                </button>
                <button
                  className="catengine-table__nav-button"
                  // onClick={() => handlePageChange("end")}
                  // disabled={isLastPage}
                >
                  End {">>"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
export const renderCellContent = (
  key: TransactionKey | string,
  tx: CatEngineTransaction,
  coa: Coa[],
  onTransactionChange: (
    transactionId: string,
    updates: Partial<CatEngineTransaction>
  ) => void
) => {
  switch (key) {
    case "bankAccount":
      return (
        <div className="catengine-table__bank">
          {tx.bankLogo ? (
            <>
              <img
                src={tx.bankLogo}
                alt={`${tx.bankName} logo`}
                className="catengine-table__bank--img"
              />
              <span className="catengine-table__bank--name">{tx.bankName}</span>
            </>
          ) : (
            <Landmark />
          )}
        </div>
      );

    case "date":
      return formatDate(new Date(tx.date), "dd MMM yyyy");

    case "fsDate":
      const fsDate = tx.fsDate ?? tx.date;
      return fsDate ? formatDate(new Date(fsDate), "dd MMM yyyy") : "N/A";

    case "contact":
      return tx.contactName || "";

    case "reference":
      return tx.reference || "";

    case "project":
      return tx.projectName || "";

    case "description":
      return tx.description || "";

    case "currency":
      return `${tx.bankCurrencyCode} (${tx.bankCurrencySymbol})`;

    case "bankAmount":
      return numeral(tx.bankAmount).format("0,0.00");

    case "exchangeRate":
      return numeral(tx.exchangeRate).format("0,0.000000");

    case "amount":
      const amount = new Decimal(tx.bankAmount).dividedBy(
        new Decimal(tx.exchangeRate)
      );
      return (
        <div
          className={`catengine-table__amount ${
            amount.greaterThan(0)
              ? "catengine-table__amount--plus"
              : "catengine-table__amount--minus"
          }`}
        >
          {numeral(amount).format("0,0.00")}
        </div>
      );

    case "account":
      const selectedCoaOption = coa.find((c) => c.id === tx.coaId) || null;

      if (!coa || coa.length === 0) {
        return <div>Loading accounts...</div>;
      }

      return (
        <CustomSelect
          options={coa}
          className="catengine-table__cell--coa"
          onChange={(option) => {
            onTransactionChange(tx.id, {
              coaId: option.id,
              coaAccountName: option.accountName,
              coaAccountCode: option.accountCode,
            });
          }}
          placeholder="Select Account"
          value={selectedCoaOption}
        />
      );

    default:
      return "N/A";
  }
};
