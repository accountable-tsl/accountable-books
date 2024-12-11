import { CloudUpload, TableProperties } from "lucide-react";
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
import { useEffect, useState } from "react";
import { BeatLoader, MoonLoader } from "react-spinners";
import { AgGridReact } from "ag-grid-react";
import numeral from "numeral";
import {
  findDateRange,
  formatDate,
  getValue,
  parseDateString,
} from "../../utils/utils";
import { getBankAccounts } from "../../services/BankAccountServices";
import {
  BankAccount,
  BankAccounts,
  BankTransaction,
  BankTransactionBatch,
} from "../../types/types";
import { userId } from "../../utils/user";
import { ColDef, ValueGetterParams } from "ag-grid-community";
import { postBankTransactions } from "../../services/BankTransactionServices";

/**
 * Configuration & Constants
 */

// Possible field names for different transaction attributes in the CSV
const possibleAmountFields = ["*Amount", "Amount", "Amount*", "amount"];
const possibleDateFields = ["*Date", "Date", "Date*", "date"];
const possiblePayeeFields = [
  "Contact / Payee",
  "Contact/Payee",
  "Payee",
  "payee",
  "contact",
  "contact / payee",
];
const possibleDescriptionFields = ["Description", "description"];
const possibleReferenceFields = ["Reference", "reference"];

// Maximum file size in bytes (5MB)
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// Column definitions for the preview grid
const columnDefs: ColDef<BankTransaction>[] = [
  {
    headerName: "SN",
    width: 45,
    valueGetter: (params: any) =>
      params.node ? params.node.rowIndex + 1 : null,
    cellClass: "uploadbs-rvw__cell--sn text-center",
    headerClass: "header-center",
  },
  {
    headerName: "Date",
    flex: 1,
    valueGetter: (params: ValueGetterParams) => {
      if (!params.data) return null;

      // Retrieve the date from the CSV data using the possible fields
      for (const field of possibleDateFields) {
        if (field in params.data) {
          const parsedDate = parseDateString(String(params.data[field]));
          if (parsedDate) return formatDate(parsedDate);
        }
      }
      return null;
    },
    cellClass: "uploadbs-rvw__cell",
  },
  {
    headerName: "Description",
    field: "description",
    flex: 1.5,
    cellClass: "uploadbs-rvw__cell",
  },
  {
    headerName: "Money In",
    valueGetter: (params: any) => {
      if (!params.data) return "";
      for (const field of possibleAmountFields) {
        if (field in params.data) {
          const amount = numeral(params.data[field]).value();
          if (amount !== null && amount > 0)
            return numeral(amount).format("0,0.00");
        }
      }
      return "";
    },
    flex: 1,
    cellClass: "uploadbs-rvw__money-in",
  },
  {
    headerName: "Money Out",
    flex: 1,
    valueGetter: (params: any) => {
      if (!params.data) return "";
      for (const field of possibleAmountFields) {
        if (field in params.data) {
          const amount = numeral(params.data[field]).value();
          if (amount !== null && amount < 0) {
            return numeral(Math.abs(amount)).format("0,0.00");
          }
        }
      }
      return "";
    },
    cellClass: "uploadbs-rvw__money-out",
    headerClass: "uploadbs-rvw__header--right",
  },
];

const defaultColDef = {
  filter: false,
  sortable: false,
};

export default function UploadBS() {
  const { companyId } = useCompany();

  // Step and State Management
  // currStep: 1 => Upload Screen, 2 => Review Screen
  const [currStep, setCurrStep] = useState<number>(1);

  // Data related states
  const [bankAccounts, setBankAccounts] = useState<BankAccounts>([]);
  const [selectedBankAccount, setSelectedBankAccount] =
    useState<BankAccount | null>(null);
  const [bankData, setBankData] = useState<BankTransaction[]>([]);

  //UI and Status States
  const [isLoading, setIsLoading] = useState(false);
  const [uploadSuccessful, setUploadSuccessful] = useState<boolean | null>();
  const [error, setError] = useState<string | null>(null);

  // const [columnArray, setColumnArray] = useState<any>([]);
  // const [values, setValues] = useState<any>([]);

  const breadcrumbs = [
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

  /**
   * Effects
   */

  useEffect(() => {
    companyId && fetchBankAccounts(companyId);
  }, [companyId]);

  /**
   * Fetch & Data Handling Functions
   */

  const fetchBankAccounts = async (companyId: string | number) => {
    const response = await getBankAccounts(companyId);
    if (response.success) {
      setBankAccounts(response.data.bankAccounts);
    } else {
      console.error("Failed to fetch bank accounts:", response);
      setError("Failed to fetch bank accounts. Please try again later.");
    }
  };

  const handleBankAccountChange = (
    event: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const selectedId = event.target.value;
    const account = bankAccounts.find((acc) => acc.id === selectedId) || null;
    setSelectedBankAccount(account);
  };

  /**
   * handleFile:
   * - Validates the uploaded file (type and size)
   * - Parses CSV using Papa Parse
   * - Transforms data into the BankTransaction format
   */
  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    event.preventDefault();
    const file = event.target.files?.[0];
    setError(null);

    //Basic File Checks
    if (!file) {
      setError("Please select a file.");
      return;
    }
    if (file.type !== "text/csv") {
      setError("Please upload a CSV file.");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setError("File size exceeds 5MB limit.");
      return;
    }

    setIsLoading(true);

    //Parse CSV
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: function (results) {
        setIsLoading(false);
        if (results.errors.length) {
          console.error("Errors while parsing:", results.errors);
          setError("Error parsing CSV file. Please check the file format.");
          return;
        }

        try {
          const parsedData = transformCsvData(results.data);
          setBankData(parsedData);
        } catch (err) {
          console.error("Error processing file:", err);
          setError("Error processing file. Please try again.");
        }
      },
      error: function (err) {
        setIsLoading(false);
        console.error("Error reading file:", err);
        setError("Error reading file. Please try again.");
      },
    });
  };

  /**
   * transformCsvData:
   * Converts raw CSV rows into BankTransaction objects.
   */
  const transformCsvData = (data: any[]): BankTransaction[] => {
    return data.map((row: any) => {
      const amountValue = getValue(row, possibleAmountFields);
      const dateValue = getValue(row, possibleDateFields);
      const payeeValue = getValue(row, possiblePayeeFields);
      const descriptionValue = getValue(row, possibleDescriptionFields);
      const referenceValue = getValue(row, possibleReferenceFields);

      return {
        date: parseDateString(dateValue),
        payee: payeeValue,
        reference: referenceValue,
        description: descriptionValue,
        isReconciled: false,
        amount: amountValue,
        type: amountValue && parseFloat(amountValue) < 0 ? "Debit" : "Credit",
      };
    });
  };

  /**
   * handleUpload:
   * Posts the prepared bank transactions to the server.
   */
  const handleUpload = async () => {
    if (!companyId || !selectedBankAccount) return;

    setUploadSuccessful(null);

    const dateRange = findDateRange(bankData, "date");
    if (!dateRange?.earliestDate || !dateRange?.latestDate) {
      console.error("Invalid date range:", dateRange);
      setError("Invalid date range. Please check your uploaded file.");
      return;
    }
    const bankTransactionData: BankTransactionBatch = {
      startDate: dateRange?.earliestDate,
      endDate: dateRange?.latestDate,
      bankAccountId: String(selectedBankAccount.id),
      source: "FILE_IMPORT",
      createdById: userId,
      bankTransactions: bankData,
    };

    try {
      const result = await postBankTransactions(companyId, bankTransactionData);

      if (result?.success === true) {
        setTimeout(() => setUploadSuccessful(true), 500);
        setTimeout(() => {
          setCurrStep(1);
          setBankData([]);
          setSelectedBankAccount(null);
          setUploadSuccessful(null);
        }, 1000);
      } else {
        console.error("Transaction upload failed:", result);
        setError("Upload failed. Please check the file and try again.");
        setTimeout(() => setUploadSuccessful(null), 500);
      }
    } catch (error) {
      console.error("An unexpected error occurred during upload:", error);
      setError("An unexpected error occurred. Please try again.");
      setTimeout(() => setUploadSuccessful(null), 500);
    }
  };

  /**
   * Calculations for Summary
   */

  let totalMoneyIn = 0;
  let totalMoneyOut = 0;

  for (const item of bankData) {
    let amount = null;

    for (const field of possibleAmountFields) {
      if (field in item) {
        amount = numeral(item[field as keyof BankTransaction]).value();
        break;
      }
    }

    if (amount !== undefined && amount !== null) {
      if (amount > 0) totalMoneyIn += amount;
      if (amount < 0) totalMoneyOut += Math.abs(amount);
    }
  }

  return (
    <div className="uploadbs">
      <Breadcrumb items={breadcrumbs} />

      <div className="uploadbs-body">
        <div
          className={`uploadbs-container ${
            currStep === 2 ? "uploadbs-container__2" : ""
          }`}
        >
          <div className="uploadbs-header">
            <FontAwesomeIcon icon={faX} className="uploadbs-cancel" />
            <div className="uploadbs-progress">
              <div
                className={`uploadbs-progress__upload ${
                  currStep === 2 ? "uploadbs-progress__upload-done" : ""
                }`}
              >
                <FontAwesomeIcon
                  icon={faCircleCheck}
                  className={`uploadbs-progress__icon ${
                    currStep === 2 ? "uploadbs-progress__icon-done" : ""
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
          <div
            className={`uploadbs-wrap1 ${
              currStep === 2 && uploadSuccessful === null
                ? "uploadbs-wrap2"
                : ""
            }`}
          >
            <div
              className={`uploadbs-wrap1 ${
                currStep === 2 && uploadSuccessful === null
                  ? "uploadbs-wrap__loader"
                  : ""
              }`}
            >
              {currStep === 2 && uploadSuccessful === null && <MoonLoader />}
            </div>
            <div className="uploadbs-descr">
              <div className="uploadbs-descr__title">
                {currStep === 1
                  ? "Fill out this CSV template, Save and Upload"
                  : null}
                {currStep === 2 ? "Review and Complete Import" : null}
              </div>
              <div className="uploadbs-descr__link">
                <span>
                  {currStep === 1 ? "Download Accountable CSV Template" : null}
                </span>
                <span>
                  {currStep === 2
                    ? "Get help with importing bank transactions"
                    : null}
                </span>
                <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
              </div>
              <div className="uploadbs-descr__note">
                {currStep === 1
                  ? "Currently, we only accept bank statements in this CSV format."
                  : null}
                {currStep === 2
                  ? "Please make sure to review your transactions for accuracy."
                  : null}
              </div>
            </div>
            <form action="" className="uploadbs-form">
              {currStep === 1 && (
                <div className="uploadbs-input">
                  <div className="uploadbs-input__grid uploadbs-input__header">
                    <div className="uploadbs-input__item">Select Bank</div>
                    <div className="uploadbs-input__item">Upload CSV</div>
                    <div className="uploadbs-input__item">Currency</div>
                  </div>
                  <div
                    className={`uploadbs-input__grid uploadbs-input__body ${
                      selectedBankAccount?.id && bankData.length !== 0
                        ? "uploadbs-input__body--2"
                        : ""
                    }`}
                  >
                    <div className="uploadbs-input__grid--item">
                      <select
                        name="selectBankAccount"
                        id="selectBankAccount"
                        className="uploadbs-input__select"
                        onChange={handleBankAccountChange}
                        value={selectedBankAccount?.id}
                      >
                        <option value="">--Select Bank--</option>
                        {bankAccounts.map((bankAccount) => (
                          <option key={bankAccount.id} value={bankAccount.id}>
                            {bankAccount.displayName} (
                            {bankAccount.bankAccountNo})
                          </option>
                        ))}
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
                      <span className="uploadbs-input__currency">
                        {selectedBankAccount?.currency?.code}
                      </span>
                    </div>
                  </div>
                  {isLoading && <BeatLoader color="#ffcc99" />}
                </div>
              )}
              {currStep === 2 && (
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
                        columnDefs={columnDefs}
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
                {currStep === 1 && (
                  <Button
                    text="Continue"
                    variant="outlined"
                    customClass={
                      !selectedBankAccount?.id || bankData.length === 0
                        ? "uploadbs-button__disabled"
                        : "uploadbs-button__continue"
                    }
                    onClick={(e) => {
                      e.preventDefault();
                      setCurrStep(2);
                    }}
                  />
                )}
                {currStep === 2 && (
                  <>
                    <div
                      className={`uploadbs-status ${
                        uploadSuccessful ? "uploadbs-status__success" : ""
                      }`}
                    >
                      {uploadSuccessful === null && ""}
                      {uploadSuccessful === false && "Import Error"}
                      {uploadSuccessful === true && "Import Successful"}
                    </div>
                    <Button
                      text="Back"
                      variant="outlined"
                      customClass="uploadbs-button__continue"
                      onClick={() => {
                        setCurrStep(1);
                        setBankData([]);
                      }}
                    />
                    <Button
                      text="Complete Import"
                      customClass={`uploadbs-button__continue ${
                        bankData.length === 0 ? "uploadbs-button__disabled" : ""
                      }`}
                      onClick={handleUpload}
                    />
                  </>
                )}
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
