import "./JournalList.scss";
import { useEffect, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import numeral from "numeral";
import { CompanyData } from "../../types/types";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { Link, useNavigate } from "react-router-dom";
import { routes } from "../../utils/routes";
import { fetchJournals } from "../../services/JournalServices";
import { format } from "date-fns";
import { RowClickedEvent } from "ag-grid-community";

export default function JournalList({
  companyId,
  company,
}: {
  companyId: string | null;
  company?: CompanyData | null | undefined;
  data?: any;
}) {
  const reportingCurrency = company?.reportingCurrencyCode
    ? company?.reportingCurrencyCode
    : "";
  const [journalFilter, setJournalFilter] = useState<string>("all");
  const [journalData, setJournalData] = useState<any[]>([]);
  const [rowData, setRowData] = useState<any[]>([]);
  const [_selectedRowsCount, setSelectedRowsCount] = useState(0);
  const [columnDefs, setColumnDefs] = useState<any[]>([]);

  const journalTableRef = useRef<AgGridReact>(null);
  const navigate = useNavigate();

  const onSelectionChanged = () => {
    if (journalTableRef.current) {
      const selectedRows = journalTableRef.current.api.getSelectedRows();
      setSelectedRowsCount(selectedRows.length);
    }
  };

  const handleJournalFilter = (filter: string) => {
    setJournalFilter(filter);

    if (!filter || filter.toLowerCase() === "all") {
      setRowData(journalData);
    } else {
      if (journalData === null || journalData === undefined) return;
      const newJournalData = journalData.filter(
        (item: any) => item.parentElement.toLowerCase() === filter.toLowerCase()
      );
      setRowData(newJournalData);
    }
  };

  const handleJournalData = async () => {
    if (!companyId) return;

    const response = await fetchJournals(companyId);
    console.log(response);
    if (response.success) {
      setJournalData(response.data);
      setRowData(response.data.journals);
    }
  };

  const handleRowClick = (e: RowClickedEvent) => {
    navigate(
      `${routes.accounting.workspace.viewJournal(companyId, e.data.id)}`
    );
  };

  useEffect(() => {
    const newColDefs = [
      {
        field: "description",
        headerName: "Narration",
        flex: 1.5,
        sortable: true,
        cellClass: "jl-link",
      },
      {
        field: "date",
        headerName: "Date",
        sortable: true,
        valueFormatter: (params: any) =>
          format(new Date(params.value), "dd MMM yyyy"),
      },
      {
        field: "totalDebit",
        headerName: `Debit ${reportingCurrency}`,
        valueFormatter: (params: any) =>
          numeral(params.value).format("(0,0.00)"),
        sortable: false,
        cellStyle: { textAlign: "right" },
      },
      {
        field: "totalCredit",
        headerName: `Credit ${reportingCurrency}`,
        valueFormatter: (params: any) =>
          numeral(params.value).format("(0,0.00)"),
        sortable: false,
        cellStyle: { textAlign: "right" },
      },
      {
        field: "status",
        headerName: "Status",
        sortable: true,
        cellClass: "jl-link",
      },
    ];
    setColumnDefs(newColDefs);
  }, [reportingCurrency]);

  useEffect(() => {
    handleJournalData();
  }, [companyId]);

  console.log(rowData);

  return (
    <div className="journal-list">
      <div className="journal-filter">
        <hr className="journal-filter__line" />
        <div className="journal-filterbox">
          <button
            className={`journal-filterbox__button ${
              journalFilter === "all" ? "journal-filterbox__button--active" : ""
            }`}
            onClick={() => handleJournalFilter("all")}
          >
            All
          </button>
          <button
            className={`journal-filterbox__button ${
              journalFilter === "draft"
                ? "journal-filterbox__button--active"
                : ""
            }`}
            onClick={() => handleJournalFilter("draft")}
          >
            Draft
          </button>
          <button
            className={`journal-filterbox__button ${
              journalFilter === "posted"
                ? "journal-filterbox__button--active"
                : ""
            }`}
            onClick={() => handleJournalFilter("posted")}
          >
            Posted
          </button>
          <button
            className={`journal-filterbox__button ${
              journalFilter === "voided"
                ? "journal-filterbox__button--active"
                : ""
            }`}
            onClick={() => handleJournalFilter("voided")}
          >
            Voided
          </button>
          <button
            className={`journal-filterbox__button ${
              journalFilter === "recurring"
                ? "journal-filterbox__button--active"
                : ""
            }`}
            onClick={() => handleJournalFilter("recurring")}
          >
            Recurring
          </button>
        </div>
        <hr className="journal-filter__line" />
      </div>

      <div className="journal-list-button">
        <div className="journal-list-button__group">
          <Link
            to={routes.accounting.workspace.newJournal(companyId)}
            className="journal-list-button__add"
          >
            <FontAwesomeIcon
              icon={faPlus}
              className="journal-list-button__icon"
            />
            <span className="journal-list-button__label">New Journal</span>
          </Link>
          <Link
            to={routes.accounting.workspace.newRecurringJournal(companyId)}
            className="journal-list-button__add"
          >
            <FontAwesomeIcon
              icon={faPlus}
              className="journal-list-button__icon"
            />
            <span className="journal-list-button__label">
              New Recurring Journal
            </span>
          </Link>
        </div>

        <div className="journal-list-button__group">
          <div className="journal-list-button__search">
            <input
              className="journal-list-button__input"
              type="search"
              name=""
              id=""
              placeholder="Search..."
            />
          </div>
          <div className="journal-list-button__add">
            <FontAwesomeIcon
              icon={faPlus}
              className="journal-list-button__icon"
            />
            <span className="journal-list-button__label">Import</span>
          </div>
        </div>
      </div>

      <div className="ag-theme-quartz coa-table">
        <AgGridReact
          rowData={rowData}
          // domLayout="autoHeight"
          columnDefs={columnDefs}
          //   defaultColDef={defaultColDef}
          pagination={true}
          headerHeight={40}
          animateRows={true}
          ref={journalTableRef}
          onSelectionChanged={onSelectionChanged}
          onRowClicked={handleRowClick}
        />
      </div>
    </div>
  );
}
