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
import { useEffect, useState } from "react";
import { RangePickerProps } from "antd/es/date-picker";
import { AgGridReact } from "ag-grid-react";
import { retrieveBankTransactions } from "../../services/BankTransactionServices";
import { BankTransactionFilters } from "../../types/types";
import { formatNumericValue } from "../../utils/utils";
import Decimal from "decimal.js";

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

  const [colDefs, setColDefs] = useState(columnDefinitions);
  const [fetchedBankTransactions, setFetchedBankTransactions] = useState([]);
  const [bankAccountId, setBankAccountId] = useState<string>("");
  const [filterAmounts, setFilterAmounts] = useState({
    minAmount: "",
    maxAmount: "",
  });

  const [filterDates, setFilterDates] = useState<{
    startDate?: Date;
    endDate?: Date;
  }>({});

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

      console.log("Start Date:", value[0]?.format("YYYY-MM-DD"));
      console.log("End Date:", value[1]?.format("YYYY-MM-DD"));
    } else {
      setFilterDates({});
    }
  };

  let filters: BankTransactionFilters = {};
  if (filterDates.startDate) filters.startDate = filterDates.startDate;
  if (filterDates.endDate) filters.endDate = filterDates.endDate;
  if (bankAccountId) filters.bankAccountId = bankAccountId;
  if (filterAmounts.minAmount)
    filters.minAmount = new Decimal(filterAmounts.minAmount);
  if (filterAmounts.maxAmount)
    filters.maxAmount = new Decimal(filterAmounts.maxAmount);

  const getBankTransactions = async (
    companyId: string | number,
    filters: BankTransactionFilters
  ) => {
    const response = await retrieveBankTransactions(companyId, filters);
    if (response.success) {
      console.log(response);
      setFetchedBankTransactions(response.data?.transactions);
    }
  };

  useEffect(() => {
    try {
      // getBankTransactions();
    } catch (error) {}
  }, [companyId, filterDates]); //bankAccountId,

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

  console.log(filterDates, filterAmounts.minAmount, filterAmounts.maxAmount);

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
            <div className="catengine-summary__bank-label">
              All Bank Accounts
            </div>
            <select
              name="selectBankAccounts"
              id=""
              className="catengine-summary__bank-select"
            >
              <option value="">Select Bank(s)</option>
              <option value="">Bank 1</option>
              <option value="">Bank 2</option>
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
                    name=""
                    id=""
                    className="catengine-body__top-filter--select"
                  >
                    <option value="">Unclassified Lines</option>
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
                    <Menu strokeWidth={1} />
                  </div>
                  <div className="catengine-body__top-rowheight--item">
                    <Menu strokeWidth={2.5} />
                  </div>
                  <div className="catengine-body__top-rowheight--item">
                    <Menu strokeWidth={4} />
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
            <div className="catengine-table">
              {/* <AgGridReact rowData={rowData} columnDefs={colDefs} /> */}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
