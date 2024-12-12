import { Brain, Expand, ListFilter, Menu, TableProperties } from "lucide-react";
import Breadcrumb from "../../components/Breadcrumb/Breadcrumb";
import { useCompany } from "../../utils/company";
import { routes } from "../../utils/routes";
import { DatePicker } from "antd";

import "./CategorisationEngine.scss";
import { useEffect, useState } from "react";
import { RangePickerProps } from "antd/es/date-picker";
import { AgGridReact } from "ag-grid-react";

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

  const [filterDates, setFilterDates] = useState<{
    startDate?: Date | string;
    endDate?: Date | string;
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

  const getBankTransactions = [];
  useEffect(() => {}, [companyId, filterDates]); //bankAccountId,

  console.log(filterDates);

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
              {/* <div className="catengine-body__top-search">
                <input type="search" name="" id="" />
              </div> */}

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
