import { CloudUpload, FileX, TableProperties } from "lucide-react";
import Breadcrumb from "../../components/Breadcrumb/Breadcrumb";
import { routes } from "../../utils/routes";
import "./UploadBS.scss";
import { useCompany } from "../../utils/company";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowUpRightFromSquare,
  faCircleCheck,
  faX,
} from "@fortawesome/free-solid-svg-icons";
import Button from "../../components/Button/Button";
import Papa from "papaparse";
import { useMemo, useState } from "react";
import { BeatLoader } from "react-spinners";
import { AgGridReact } from "ag-grid-react";
import numeral from "numeral";
import { parseDate } from "../../utils/utils";

export default function UploadBS() {
  const { companyId } = useCompany();

  const [bankData, setBankData] = useState<any>([]);
  const [columnArray, setColumnArray] = useState<any>([]);
  const [values, setValues] = useState<any>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [currPage, setCurrPage] = useState<number>(1);

  const uploadBSBreadcrumbs = [
    {
      text: "Accounting",
      icon: TableProperties,
      link: routes.accounting.root(companyId),
    },
    {
      text: "Upload Bank Statement",
      icon: CloudUpload,
      link: routes.accounting.workspace.uploadBank(companyId),
    },
  ];

  const [previewColDefs, setPreviewColDefs] = useState<any>([
    {
      headerName: "SN",
      width: 40,
      valueGetter: (params: any) => params.node.rowIndex + 1,
      cellClass: "uploadbs-rvw__cell--sn text-center",
      headerClass: "header-center",
    },
    {
      headerName: "Date",
      field: "*Date",
      flex: 1,
      valueFormatter: (params: any) => parseDate(params.value),
      cellClass: "uploadbs-rvw__cell",
    },
    {
      headerName: "Description",
      field: "Description",
      flex: 1.5,
      cellClass: "uploadbs-rvw__cell",
    },
    {
      headerName: "Money In",
      field: "*Amount",
      flex: 1,
      valueFormatter: (params: any) => {
        const amount = numeral(params.value).value();
        return amount !== null && amount > 0
          ? numeral(amount).format("0,0.00")
          : "";
      },
      cellClass: "uploadbs-rvw__money-in",
    },
    {
      headerName: "Money Out",
      field: "*Amount",
      flex: 1,
      valueFormatter: (params: any) => {
        const amount = numeral(params.value).value();
        return amount !== null && amount < 0
          ? numeral(Math.abs(amount)).format("0,0.00")
          : "";
      },
      cellClass: "uploadbs-rvw__money-out",
      headerClass: "uploadbs-rvw__header--right",
    },
  ]);

  // const [previewData, setPreviewData] = useState<any>([]);
  const defaultColDef = useMemo(() => {
    return {
      // flex: 1,
      filter: false,
      sortable: false,
    };
  }, []);

  const handleFile = (event: any) => {
    event.preventDefault();

    const file = event.target.files[0];
    setError(null);

    if (!file) {
      setError("Please select a file.");
      return;
    }

    if (file.type !== "text/csv") {
      setError("Please upload a CSV file.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("File size exceeds 5MB limit.");
      return;
    }

    setIsLoading(true);

    Papa.parse(event.target.files[0], {
      header: true,
      skipEmptyLines: true,
      complete: function (results) {
        setIsLoading(false);

        try {
          if (results.errors.length) {
            console.error("Errors while parsing:", results.errors);
            setError("Error parsing CSV file. Please check the file format.");
            return;
          }

          const columnArray = results.data.map((item) => Object.keys(item));
          const valuesArray = results.data.map((item) => Object.values(item));
          setBankData(results.data);
          setColumnArray(columnArray);
          setValues(valuesArray);
        } catch (error) {
          console.error("Error processing file:", error);
          setError("Error processing file. Please try again.");
        }
      },
      error: function (error) {
        setIsLoading(false);
        console.error("Error reading file:", error);
        setError("Error reading file. Please try again.");
      },
    });
  };

  let totalMoneyIn = 0;
  let totalMoneyOut = 0;

  for (const item of bankData) {
    const amount = numeral(item["*Amount"]).value();

    if (amount === undefined || amount === null) {
      continue;
    }

    if (amount && amount > 0) {
      totalMoneyIn += amount;
    } else if (amount && amount < 0) {
      totalMoneyOut += Math.abs(amount);
    }
  }

  console.log(bankData);
  console.log(columnArray);
  console.log(values);

  return (
    <>
      <div className="uploadbs">
        <Breadcrumb items={uploadBSBreadcrumbs} />

        <div className="uploadbs-body">
          <div
            className={`uploadbs-container ${
              currPage === 2 ? "uploadbs-container__2" : ""
            }`}
          >
            <div className="uploadbs-header">
              <FontAwesomeIcon icon={faX} className="uploadbs-cancel" />
              <div className="uploadbs-progress">
                <div
                  className={`uploadbs-progress__upload ${
                    currPage === 2 ? "uploadbs-progress__upload-done" : ""
                  }`}
                >
                  <FontAwesomeIcon
                    icon={faCircleCheck}
                    className={`uploadbs-progress__icon ${
                      currPage === 2 ? "uploadbs-progress__icon-done" : ""
                    }`}
                  />
                  Upload
                </div>
                <hr className="uploadbs-line" />
                <div className="uploadbs-progress__review">
                  <FontAwesomeIcon
                    icon={faCircleCheck}
                    className="uploadbs-progress__icon"
                  />
                  Review
                </div>
              </div>
            </div>
            <div className="uploadbs-descr">
              <div className="uploadbs-descr__title">
                {currPage === 1
                  ? "Fill out this CSV template, Save and Upload"
                  : null}
                {currPage === 2 ? "Review and Complete Import" : null}
              </div>
              <div className="uploadbs-descr__link">
                <span>
                  {currPage === 1 ? "Download Accountable CSV Template" : null}
                </span>
                <span>
                  {currPage === 2
                    ? "Get help with importing bank transactions"
                    : null}
                </span>
                <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
              </div>
              <div className="uploadbs-descr__note">
                {currPage === 1
                  ? "Currently, we only accept bank statements in this CSV format."
                  : null}
                {currPage === 2
                  ? "Please make sure to review your transactions for accuracy."
                  : null}
              </div>
            </div>
            <form action="" className="uploadbs-form">
              {currPage === 1 && (
                <div className="uploadbs-input">
                  <div className="uploadbs-input__grid uploadbs-input__header">
                    <div className="uploadbs-input__item">Select Bank</div>
                    <div className="uploadbs-input__item">Upload CSV</div>
                    <div className="uploadbs-input__item">Currency</div>
                  </div>
                  <div className="uploadbs-input__grid uploadbs-input__body">
                    <div className="uploadbs-input__grid--item">
                      <select
                        name="selectbank"
                        id="selectbank"
                        className="uploadbs-input__select"
                      >
                        <option value="">--Select Bank--</option>
                      </select>
                    </div>
                    <div className="uploadbs-input__grid--item">
                      <input
                        id="uploadBankStatement"
                        type="file"
                        className="uploadbs-input__upload"
                        accept=".csv"
                        onChange={handleFile}
                      />
                    </div>
                    <div className="uploadbs-input__grid--item">
                      <span className="uploadbs-input__currency">NGN</span>
                    </div>
                  </div>
                  {isLoading && <BeatLoader color="#ffcc99" />}
                </div>
              )}

              {currPage === 2 && (
                <div className="uploadbs-rvw">
                  <div className="uploadbs-rvw__header">
                    Import Summary
                    <hr />
                  </div>

                  <div className="uploadbs-rvw__body">
                    <div className="uploadbs-rvw__summary">
                      <div className="uploadbs-rvw__item">
                        <span className="uploadbs-rvw__item--header1">
                          Money In
                        </span>
                        <span className="uploadbs-rvw__item--value1 uploadbs-rvw__valid">
                          +{numeral(totalMoneyIn).format("0,0.00")}
                        </span>
                      </div>
                      <div className="uploadbs-rvw__item">
                        <span className="uploadbs-rvw__item--header2">
                          Money Out
                        </span>
                        <span className="uploadbs-rvw__item--value2 uploadbs-rvw__invalid">
                          -{numeral(totalMoneyOut).format("0,0.00")}
                        </span>
                      </div>
                      <div className="uploadbs-rvw__item">
                        <span className="uploadbs-rvw__item--header3">
                          {bankData.length} Lines
                        </span>
                        <span className="uploadbs-rvw__item--value3">
                          <span className="uploadbs-rvw__valid">
                            {bankData.length} Valid{" "}
                          </span>{" "}
                          |{" "}
                          <span className="uploadbs-rvw__invalid">
                            0 Invalid
                          </span>
                        </span>
                      </div>
                    </div>

                    {/* <div className="uploadbs-rvw__table"> */}
                    <div className="ag-theme-quartz uploadbs-rvw__table">
                      <AgGridReact
                        rowData={bankData}
                        columnDefs={previewColDefs}
                        defaultColDef={defaultColDef}
                        headerHeight={30}
                        animateRows={true}
                        rowHeight={30}
                      />
                    </div>
                    {/* </div> */}
                  </div>
                </div>
              )}
              <div className="uploadbs-button">
                {currPage === 1 && (
                  <Button
                    text="Continue"
                    variant="outlined"
                    customClass="uploadbs-button__continue"
                    onClick={(e) => {
                      e.preventDefault();
                      setCurrPage(2);
                    }}
                  />
                )}

                {currPage === 2 && (
                  <>
                    <Button
                      text="Back"
                      variant="outlined"
                      customClass="uploadbs-button__continue"
                      onClick={(e) => {
                        e.preventDefault();
                        setCurrPage(1);
                        setBankData([]);
                      }}
                    />
                    <Button
                      text="Complete Import"
                      customClass={`uploadbs-button__continue ${
                        bankData.length === 0
                          ? "uploadbs-button__continue--disabled"
                          : ""
                      }`}
                      onClick={(e) => {
                        e.preventDefault();
                        setCurrPage(2);
                      }}
                    />
                  </>
                )}
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
