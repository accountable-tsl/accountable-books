import {
  Brain,
  CirclePlay,
  Expand,
  ListFilter,
  Menu,
  TableProperties,
} from "lucide-react";
import Breadcrumb from "../../components/Breadcrumb/Breadcrumb";
import { useCompany } from "../../utils/company";
import { routes } from "../../utils/routes";
import { DatePicker } from "antd";

import "./CategorisationEngine.scss";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RangePickerProps } from "antd/es/date-picker";
import { AgGridReact } from "ag-grid-react";
import { retrieveBankTransactions } from "../../services/BankTransactionServices";
import {
  BankAccount,
  BankAccounts,
  BankTransaction,
  BankTransactionFilters,
} from "../../types/types";
import { formatDate, formatNumericValue } from "../../utils/utils";
import Decimal from "decimal.js";
import {
  getBankAccountById,
  getBankAccounts,
} from "../../services/BankAccountServices";
import {
  ColDef,
  ICellRendererParams,
  ValueGetterParams,
} from "ag-grid-community";
import numeral from "numeral";

const catEngineColumns = [
  "Bank",
  "Date",
  "FS Date",
  "Contact",
  "Reference",
  "Description",
  "Projects",
  "Account",
  "Curr",
  "Bank Amount",
  "Ex. Rate",
  "Amount",
  "",
];

const columnDefinitions = catEngineColumns.map((item) => ({ field: item }));

export default function CategorisationEngine() {
  const { companyId } = useCompany();

  const [columnDefs, setColumnDefs] = useState([
    {
      headerName: "Bank",
      cellClass: "catengine-table__bank",
      cellRenderer: (params: ICellRendererParams) => {
        const bankAccount = params.data?.bankAccount;
        const bank = params.data?.bankAccount?.bank;

        if (!bank) {
          return "";
        }

        return (
          <div className="catengine-table__bank">
            <img
              className="catengine-table__bank--img"
              src={bank.bankLogo}
              alt={`${bank.name} logo`}
            />
            <span className="catengine-table__bank--name">
              {bankAccount.displayName}
            </span>
          </div>
        );
      },
      pinned: "left",
      width: 150,
    },
    {
      headerName: "Date",
      valueGetter: (p: ValueGetterParams) => {
        if (!p.data || !p.data["date"]) return "";
        const dateValue = new Date(p.data["date"]);
        if (isNaN(dateValue.getTime())) return "Invalid Date";
        return formatDate(dateValue, "dd MMM yyyy");
      },
      width: 120,
      pinned: "left",
    },
    { headerName: "FS Date", width: 120 },
    { headerName: "Contact", field: "payee", flex: 1, minWidth: 120 },
    { headerName: "Reference", field: "reference", flex: 1, minWidth: 120 },
    { headerName: "Project", field: "project", flex: 1, minWidth: 120 },
    {
      headerName: "Description",
      field: "description",
      flex: 3,
      minWidth: 200,
      pinned: "left",
    },
    {
      headerName: "Curr",
      valueGetter: (p: ValueGetterParams) =>
        `${p.data?.bankAccount?.currency?.code} (${p.data?.bankAccount?.currency?.symbol})`,
      width: 90,
    },
    {
      headerName: "Bank Amount",
      width: 150,
      cellRenderer: (params: ICellRendererParams) => {
        if (!params.data.amount) return "";
        const amount = new Decimal(params.data?.amount);
        const amount2 = numeral(params.data?.amount).format("0,0.00");
        return (
          <div
            className={`catengine-table__amount ${
              amount.greaterThan(0)
                ? "catengine-table__amount--plus"
                : "catengine-table__amount--minus"
            }`}
          >
            {amount2}
          </div>
        );
      },
      cellClass: "catengine-table__amount",
      sortable: true,
    },
    { headerName: "Exr", width: 80 },
    { headerName: "Amount", pinned: "right", width: 150 },
    { headerName: "Account", pinned: "right", flex: 4, minWidth: 200 },
  ]);

  const [error, setError] = useState<string | null>(null);
  const [fetchedBankTransactions, setFetchedBankTransactions] = useState([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccounts>([]);
  const [selectedBankAccount, setSelectedBankAccount] =
    useState<BankAccount | null>(null);
  const [isCategorised, setIsCategorised] = useState();
  const [filterAmounts, setFilterAmounts] = useState({
    minAmount: "",
    maxAmount: "",
  });

  const [filterDates, setFilterDates] = useState<{
    startDate?: Date;
    endDate?: Date;
  }>({});

  const [rowHeight, setRowHeight] = useState(37.5);

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
          const response = await retrieveBankTransactions(companyId, filters);
          if (response.success) {
            if (response.data.transactions.length === 0) {
              setError("No transactions matching filter conditions found");
            } else {
              setFetchedBankTransactions(response.data.transactions);
            }
          } else {
            setError("Failed to fetch transactions");
          }
        }
      } catch (error) {
        console.error("Error fetching bank transactions:", error);
        setError("An error occurred while fetching bank transactions.");
      }
    },
    [companyId]
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

  const uniqueBankAccountIds = useMemo(() => {
    return Array.from(
      new Set(
        fetchedBankTransactions.map((tx: BankTransaction) => tx.bankAccountId)
      )
    ).filter((id) => id);
  }, [fetchedBankTransactions]);

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

  const returnBankDetails = async (bankAccountId: string) => {
    const result = await getBankAccountById(companyId, bankAccountId);
    if (result.success) {
      return result;
    } else {
      return {};
    }
  };

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
                    <Menu strokeWidth={1} onClick={() => setRowHeight(30)} />
                  </div>
                  <div
                    className="catengine-body__top-rowheight--item"
                    onClick={() => setRowHeight(37.5)}
                  >
                    <Menu strokeWidth={2.5} />
                  </div>
                  <div className="catengine-body__top-rowheight--item">
                    <Menu strokeWidth={4} onClick={() => setRowHeight(45)} />
                  </div>
                </div>
                <div className="catengine-body__top-vr"></div>
                <div className="catengine-body__top-fullscreen">
                  <Expand className="catengine-body__top-fullscreen--icon" />
                </div>
              </div>
            </div>
          </div>
          <div className="catengine-body__bottom">
            <div className="catengine-table ag-theme-quartz">
              <AgGridReact
                rowData={fetchedBankTransactions}
                columnDefs={columnDefs}
                headerHeight={30}
                animateRows={true}
                rowHeight={rowHeight}
                pagination={true}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
