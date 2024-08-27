import { Link } from "react-router-dom";
import Breadcrumb from "../../components/Breadcrumb/Breadcrumb";
import "./COA.scss";
import { FolderCog, TableProperties } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import { routes } from "../../utils/routes";
import { fetchCoa } from "../../services/CoaServices";
import { useCompany } from "../../utils/company";
import { BeatLoader } from "react-spinners";

export default function COA() {
  const { companyId } = useCompany();

  const [coaData, setCoaData] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [sortBy, setSortBy] = useState("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const [activeTab, setActiveTab] = useState("coa");

  const [coaColDefs, setCoaColDefs] = useState([
    {
      field: "accountCode",
      headerName: "Account Code",
      flex: 0.5,
      floatingFilter: false,
      checkboxSelection: true,
    },
    { field: "accountName", headerName: "Account Name", flex: 1.5 },
    { field: "accountTypeName", headerName: "Account Type" },
    { field: "accountElement", headerName: "Element" },
    { field: "balance", headerName: "Balance", flex: 0.75 },
  ]);
  const [rowData, setRowData] = useState([]);
  const defaultColDef = useMemo(() => {
    return {
      flex: 1,
      filter: true,
      sortable: true,
      floatingFilter: true,
    };
  }, []);

  const coaPageBreadcrumbs = [
    { text: "Accounting", icon: TableProperties, link: "/" },
    {
      text: "Setup",
      icon: FolderCog,
      hasDropdown: true,
      dropdownItems: [
        { text: "Chart of accounts", link: "/accounting/coa" },
        { text: "Contacts", link: "/accounting/contacts" },
        { text: "Projects", link: "/accounting/projects" },
        { text: "Financial Settings", link: "/accounting/settings" },
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
        }

        console.log(coa);
        console.log(coa.data);

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

  console.log(coaData);

  return (
    <div className="coa">
      <Breadcrumb items={coaPageBreadcrumbs} />
      <div className="coa-container">

        <div className="coa-tab">
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
            to={routes.accounting.setup.contacts(companyId)}
            className={`coa-tab__item ${
              activeTab === "contacts" ? "coa-tab__active" : ""
            }`}
            onClick={() => handleTabChange("contacts")}
          >
            Contacts
          </Link>
          <Link
            to={routes.accounting.setup.projects(companyId)}
            className={`coa-tab__item ${
              activeTab === "projects" ? "coa-tab__active" : ""
            }`}
            onClick={() => handleTabChange("projects")}
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
        </div>

        <div className="coa-body">
          <div className="coa-header">
            
          </div>
          <div className="ag-theme-quartz coa-table">
            <AgGridReact
              rowData={rowData}
              columnDefs={coaColDefs}
              defaultColDef={defaultColDef}
              rowSelection="multiple"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
