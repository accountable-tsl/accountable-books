import Breadcrumb from "../../components/Breadcrumb/Breadcrumb";
import "./COA.scss";
import { Archive, FolderCog, TableProperties, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import { routes } from "../../utils/routes";
import { fetchCoa } from "../../services/CoaServices";
import { useCompany } from "@/domains/company/store";
import { BeatLoader } from "react-spinners";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import Button from "../../components/Button/Button";
import { usePopup } from "../../contexts/PopupContext";
import { Coa, TabConfig } from "../../types/types";
import TabNavigation from "../../components/TabNavigation/TabNavigation";
import numeral from "numeral";
import { RowClickedEvent } from "ag-grid-community";
import { useNavigate } from "react-router-dom";

export default function COA() {
  const { companyId } = useCompany();

  const { openPopup } = usePopup();
  const navigate = useNavigate();

  const [coaData, setCoaData] = useState<Coa[] | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [sortBy] = useState("");
  const [sortOrder] = useState<"asc" | "desc">("asc");
  // const [totalPages, setTotalPages] = useState(1);
  // const [totalItems, setTotalItems] = useState(0);
  const [coaFilter, setCoaFilter] = useState("all");
  const [_activeTab, setActiveTab] = useState("coa");
  const [coaColDefs] = useState([
    {
      field: "accountCode",
      headerName: "Code",
      flex: 0.5,
      floatingFilter: false,
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
        return numeral(params.value).format("(0,0.00)");
      },
    },
  ]);
  const [rowData, setRowData] = useState<Coa[]>([]);
  const defaultColDef = useMemo(() => {
    return {
      flex: 1,
      filter: true,
      sortable: true,
    };
  }, []);

  const [selectedRowsCount, setSelectedRowsCount] = useState(0);
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

  const accountingSetupTabs: TabConfig<string>[] = [
    {
      label: "Chart of Accounts",
      key: "coa",
      link: routes.accounting.setup.coa(companyId),
      className: "coa-tab__first",
    },
    {
      label: "Contacts",
      key: "contacts",
      link: routes.accounting.setup.contacts(companyId),
      className: "coa-tab__item--contacts",
    },
    {
      label: "Projects",
      key: "projects",
      link: routes.accounting.setup.projects(companyId),
      className: "coa-tab__item--projects",
    },
    {
      label: "Financial Settings",
      key: "settings",
      link: routes.accounting.setup.finSettings(companyId),
      className: "coa-tab__item--fin-settings",
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
          // setTotalPages(coa.pagination.totalPages);
          // setTotalItems(coa.pagination.totalItems);
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

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
  };

  const handleCoaFilter = (filter: string) => {
    setCoaFilter(filter);
    if (coaData === null || coaData === undefined) return;

    if (!filter || filter.toLowerCase() === "all") {
      setRowData(coaData);
    } else {
      const newCoaData = coaData.filter(
        (item: any) => item.parentElement.toLowerCase() === filter.toLowerCase()
      );
      setRowData(newCoaData);
    }
  };

  const handleRowClick = (e: RowClickedEvent) => {
    navigate(
      `${routes.accounting.workspace.viewJournal(companyId, e.data.id)}`
    );
  };

  useEffect(() => {
    handleFetchCoa();
  }, [companyId, currentPage, limit, sortBy, sortOrder]);

  if (!coaData) {
    return <BeatLoader color="#ffcc99" />;
  }

  return (
    <div className="coa">
      <div className="coa-top">
        <Breadcrumb items={coaPageBreadcrumbs} />

        <TabNavigation
          tabs={accountingSetupTabs}
          activeTab="coa"
          onTabChange={handleTabChange}
        />
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
                onClick={() => handleCoaFilter("all")}
              >
                All
              </button>
              <button
                className={`coa-filterbox__button ${
                  coaFilter === "assets" ? "coa-filterbox__button--active" : ""
                }`}
                onClick={() => handleCoaFilter("assets")}
              >
                Assets
              </button>
              <button
                className={`coa-filterbox__button ${
                  coaFilter === "liabilities"
                    ? "coa-filterbox__button--active"
                    : ""
                }`}
                onClick={() => handleCoaFilter("liabilities")}
              >
                Liabilities
              </button>
              <button
                className={`coa-filterbox__button ${
                  coaFilter === "income" ? "coa-filterbox__button--active" : ""
                }`}
                onClick={() => handleCoaFilter("income")}
              >
                Income
              </button>
              <button
                className={`coa-filterbox__button ${
                  coaFilter === "expenses"
                    ? "coa-filterbox__button--active"
                    : ""
                }`}
                onClick={() => handleCoaFilter("expenses")}
              >
                Expenses
              </button>
              <button
                className={`coa-filterbox__button ${
                  coaFilter === "equity" ? "coa-filterbox__button--active" : ""
                }`}
                onClick={() => handleCoaFilter("equity")}
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
                customClass="coa-actions__right-button coa-actions__right-button2"
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
            gridOptions={{
              defaultColDef: defaultColDef,
              rowSelection: {
                mode: "multiRow",
              },
              columnDefs: coaColDefs,
            }}
            // domLayout="autoHeight"
            pagination={true}
            headerHeight={40}
            animateRows={true}
            ref={coaTableRef}
            onSelectionChanged={onSelectionChanged}
            onRowClicked={handleRowClick}
          />
        </div>
      </div>
    </div>
  );
}
