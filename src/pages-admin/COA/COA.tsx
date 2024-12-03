import { Link } from "react-router-dom";
import Breadcrumb from "../../components/Breadcrumb/Breadcrumb";
import "./COA.scss";
import { Archive, FolderCog, TableProperties, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import { routes } from "../../utils/routes";
import { fetchCoa } from "../../services/CoaServices";
import { useCompany } from "../../utils/company";
import { BeatLoader } from "react-spinners";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import Button from "../../components/Button/Button";
import AccountingSetup from "../../components/AccountingSetup/AccountingSetup";
import { usePopup } from "../../contexts/PopupContext";

export default function COA() {
  const { companyId } = useCompany();
  const { openPopup } = usePopup();

  const [coaData, setCoaData] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [sortBy, setSortBy] = useState("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [coaFilter, setCoaFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("coa");
  const [coaColDefs, setCoaColDefs] = useState([
    {
      field: "accountCode",
      headerName: "Code",
      flex: 0.5,
      floatingFilter: false,
      checkboxSelection: true,
      headerCheckboxSelection: true,
      headerCheckboxSelectionFilteredOnly: true,
      // pinned: "left",
      cellClass: "coa-table__link",
    },
    {
      field: "accountName",
      headerName: "Account Name",
      flex: 1.5,
      cellClass: "coa-table__link",
    },
    { field: "accountTypeName", headerName: "Account Type" },
    { field: "accountElement", headerName: "Element" },
    {
      field: "balance",
      headerName: "Balance",
      flex: 0.75,
      cellClass: "coa-table__balance",
      valueFormatter: (params: any) => {
        return parseFloat(params.value).toFixed(2);
      },
    },
  ]);
  const [rowData, setRowData] = useState([]);
  const defaultColDef = useMemo(() => {
    return {
      flex: 1,
      filter: true,
      sortable: true,
    };
  }, []);

  const [selectedRowsCount, setSelectedRowsCount] = useState(0);
  const [selectedRowsData, setSelectedRowsData] = useState([]);

  const [comingSoon, setComingSoon] = useState(false);

  const coaTableRef = useRef<AgGridReact>(null);

  const onSelectionChanged = () => {
    if (coaTableRef.current) {
      const selectedRows = coaTableRef.current.api.getSelectedRows();
      setSelectedRowsCount(selectedRows.length);
    }
  };

  const coaPageBreadcrumbs = [
    {
      text: "Workspace",
      icon: TableProperties,
      link: routes.accounting.workspace.root(companyId),
    },
    {
      text: "Setup",
      icon: FolderCog,
      hasDropdown: true,
      dropdownItems: [
        {
          text: "Chart of accounts",
          link: routes.accounting.setup.coa(companyId),
        },
        { text: "Contacts" },
        { text: "Projects" },
        {
          text: "Financial Settings",
          link: routes.accounting.setup.finSettings(companyId),
        },
      ],
    },
  ];

  const handleFetchCoa = async () => {
    if (companyId) {
      try {
        const params = {
          companyId,
          currentPage,
          limit,
          sortBy,
          sortOrder: sortOrder,
        };
        const coa = await fetchCoa(params);

        if (coa.success) {
          setCoaData(coa.data);
          setRowData(coa.data);
          setCurrentPage(coa.pagination.currentPage);
          setTotalPages(coa.pagination.totalPages);
          setTotalItems(coa.pagination.totalItems);
          setLimit(coa.pagination.totalItems);
        }

        if (!coa.success) {
          console.error("Failed to fetch COA:", coa);
        }
      } catch (error) {
        console.error("Failed to fetch COA:", error);
      }
    }
  };

  useEffect(() => {
    handleFetchCoa();
  }, [companyId, currentPage, limit, sortBy, sortOrder]);

  if (!coaData) {
    return <BeatLoader color="#ffcc99" />;
  }

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
  };

  const handleCOAFilter = (filter: string) => {
    setCoaFilter(filter);

    if (!filter || filter.toLowerCase() === "all") {
      setRowData(coaData);
    } else {
      const newCoaData = coaData.filter(
        (item: any) => item.parentElement.toLowerCase() === filter.toLowerCase()
      );
      setRowData(newCoaData);
    }
  };

  return (
    <div className="coa">
      <div className="coa-top">
        <Breadcrumb items={coaPageBreadcrumbs} />

        {/* <div className="coa-tab">
          <Link
            to={routes.accounting.setup.coa(companyId)}
            className={`coa-tab__item coa-tab__first ${
              activeTab === "coa" ? "coa-tab__active" : ""
            }`}
            onClick={() => handleTabChange("coa")}
          >
            Chart of Accounts
          </Link>
          <Link
            // to={routes.accounting.setup.contacts(companyId)}
            className={`coa-tab__item ${
              activeTab === "contacts" ? "coa-tab__active" : ""
            }`}
            // onClick={() => handleTabChange("contacts")}
          >
            Contacts
          </Link>
          <Link
            // to={routes.accounting.setup.projects(companyId)}
            className={`coa-tab__item ${
              activeTab === "projects" ? "coa-tab__active" : ""
            }`}
            // onClick={() => handleTabChange("projects")}
          >
            Projects
          </Link>
          <Link
            to={routes.accounting.setup.finSettings(companyId)}
            className={`coa-tab__item coa-tab__last ${
              activeTab === "settings" ? "coa-tab__active" : ""
            }`}
            onClick={() => handleTabChange("settings")}
          >
            Financial Settings
          </Link>
        </div> */}
        <AccountingSetup activeTab="coa" onTabChange={handleTabChange} />
      </div>
      <div className="coa-bottom">
        <div className="coa-bottom__header">
          <div className="coa-filter">
            <hr className="coa-filter__line" />
            <div className="coa-filterbox">
              <button
                className={`coa-filterbox__button ${
                  coaFilter === "all" ? "coa-filterbox__button--active" : ""
                }`}
                onClick={() => handleCOAFilter("all")}
              >
                All
              </button>
              <button
                className={`coa-filterbox__button ${
                  coaFilter === "assets" ? "coa-filterbox__button--active" : ""
                }`}
                onClick={() => handleCOAFilter("assets")}
              >
                Assets
              </button>
              <button
                className={`coa-filterbox__button ${
                  coaFilter === "liabilities"
                    ? "coa-filterbox__button--active"
                    : ""
                }`}
                onClick={() => handleCOAFilter("liabilities")}
              >
                Liabilities
              </button>
              <button
                className={`coa-filterbox__button ${
                  coaFilter === "income" ? "coa-filterbox__button--active" : ""
                }`}
                onClick={() => handleCOAFilter("income")}
              >
                Income
              </button>
              <button
                className={`coa-filterbox__button ${
                  coaFilter === "expenses"
                    ? "coa-filterbox__button--active"
                    : ""
                }`}
                onClick={() => handleCOAFilter("expenses")}
              >
                Expenses
              </button>
              <button
                className={`coa-filterbox__button ${
                  coaFilter === "equity" ? "coa-filterbox__button--active" : ""
                }`}
                onClick={() => handleCOAFilter("equity")}
              >
                Equity
              </button>
            </div>
            <hr className="coa-filter__line" />
          </div>
          <div className="coa-actions">
            <div className="coa-actions__left">
              <button
                className="coa-actions__left-button coa-actions__left-delete coa-actions__left-disabled"
                onClick={() => setComingSoon(!comingSoon)}
              >
                <Trash2 size={14} /> Delete
              </button>
              <button
                className="coa-actions__left-button coa-actions__left-archive coa-actions__left-delete coa-actions__left-disabled"
                onClick={() => setComingSoon(!comingSoon)}
              >
                <Archive size={14} /> Archive
              </button>
              <div className="coa-actions__left-line"></div>
              <button className="coa-actions__left-count">
                {selectedRowsCount} selected
              </button>
              {comingSoon && (
                <div className="coa-actions__left-comingsoon">
                  Coming Soon...
                </div>
              )}
            </div>
            <div className="coa-actions__spacer"></div>
            <div className="coa-actions__right">
              <Button
                text="Add account"
                icon={faPlus}
                variant="outlined"
                customClass="coa-actions__right-button"
                onClick={() => openPopup("")}
              />
              <Button
                text="Add bank account"
                icon={faPlus}
                variant="outlined"
                customClass="coa-actions__right-button"
                onClick={() => openPopup("addBankAccount")}
              />
              {/* <div className="coa-actions__right-button">
                <FontAwesomeIcon icon={faPlus} /> <span> Add account</span>
              </div>
              <div className="coa-actions__right-button">
                <FontAwesomeIcon icon={faPlus} /> <span> Add bank account</span>
              </div> */}
            </div>
          </div>
        </div>

        <div className="ag-theme-quartz coa-table">
          <AgGridReact
            rowData={rowData}
            columnDefs={coaColDefs}
            defaultColDef={defaultColDef}
            rowSelection="multiple"
            domLayout="autoHeight"
            pagination={true}
            headerHeight={40}
            animateRows={true}
            ref={coaTableRef}
            onSelectionChanged={onSelectionChanged}
          />
        </div>
      </div>
    </div>
  );
}
