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
import { useEffect, useMemo, useState } from "react";
import { BeatLoader } from "react-spinners";
import { AgGridReact } from "ag-grid-react";
import numeral from "numeral";
import {
  findDateRange,
  formatDate,
  getValue,
  parseDateString,
} from "../../utils/utils";
import { getBankAccounts } from "../../services/BankAccountServices";
import { BankAccount, BankAccounts, BankTransaction } from "../../types/types";
import { userId } from "../../utils/user";
import { ValueGetterParams } from "ag-grid-community";

export default function UploadBS() {
  const { companyId } = useCompany();

  const [bankAccounts, setBankAccounts] = useState<BankAccounts>([]);
  const [selectedBankAccount, setSelectedBankAccount] =
    useState<BankAccount | null>(null);
  const [bankData, setBankData] = useState<BankTransaction[]>([]);
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

        const possibleFields = ["*Date", "Date", "Date*", "date"];
        for (const field of possibleFields) {
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

        const possibleFields = ["*Amount", "Amount", "Amount*", "amount"];
        for (const field of possibleFields) {
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

        const possibleFields = ["*Amount", "Amount", "Amount*", "amount"];
        for (const field of possibleFields) {
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
  ]);

  // const [previewData, setPreviewData] = useState<any>([]);
  const defaultColDef = useMemo(() => {
    return {
      // flex: 1,
      filter: false,
      sortable: false,
    };
  }, []);

  useEffect(() => {
    companyId && fetchBankAccounts(companyId);
  }, [companyId]);

  const possibleAmountFields = ["*Amount", "Amount", "Amount*", "amount"];
  const possibleDateFields = ["*Date", "Date", "Date*", "date"];
  const possiblePayeeFields = [
    "Contact / Payee",
    "Payee",
    "payee",
    "contact",
    "Contact/Payee",
    "contact / payee",
  ];
  const possibleDescriptionFields = ["Description", "description"];
  const possibleReferenceFields = ["Reference", "reference"];

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    event.preventDefault();

    const file = event.target.files?.[0];
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
      // 5MB
      setError("File size exceeds 5MB limit.");
      return;
    }

    setIsLoading(true);

    Papa.parse(file, {
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

          // const columnArray = results.data.map((item) => Object.keys(item));
          const columnArray = results.meta.fields || [];
          const valuesArray = results.data.map((item) =>
            Object.values(item as { [key: string]: any })
          );

          const transformedData: BankTransaction[] = results.data.map(
            (item: any) => {
              const amountValue = getValue(item, possibleAmountFields);
              const dateValue = getValue(item, possibleDateFields);
              const payeeValue = getValue(item, possiblePayeeFields);
              const descriptionValue = getValue(
                item,
                possibleDescriptionFields
              );
              const referenceValue = getValue(item, possibleReferenceFields);

              return {
                date: parseDateString(dateValue),
                payee: payeeValue,
                reference: referenceValue,
                description: descriptionValue,
                isReconciled: false,
                amount: amountValue,
                type:
                  amountValue &&
                  (parseFloat(amountValue) < 0 ? "Debit" : "Credit"),
              };
            }
          );

          setBankData(transformedData as BankTransaction[]);
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
    let amount = null;

    // Find the first matching field name
    for (const field of possibleAmountFields) {
      if (field in item) {
        amount = numeral(item[field]).value();
        break;
      }
    }

    // Skip if amount is undefined or null
    if (amount === undefined || amount === null) {
      continue;
    }

    if (amount && amount > 0) {
      totalMoneyIn += amount;
    } else if (amount && amount < 0) {
      totalMoneyOut += Math.abs(amount);
    }
  }

  const fetchBankAccounts = async (companyId: string | number) => {
    const response = await getBankAccounts(companyId);
    response.success && setBankAccounts(response.data.bankAccounts);
    !response.success && console.error(response);
  };

  const handleBankAccountChange = (
    event: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const selectedId = event.target.value;
    const selectedAccount = bankAccounts.find(
      (account) => account.id === selectedId
    );
    setSelectedBankAccount(selectedAccount || null);
  };

  const dateRange = findDateRange(bankData, "date");

  const bankTransactionData = {
    startDate: dateRange && dateRange.earliestDate,
    endDate: dateRange && dateRange.latestDate,
    bankAccountId: selectedBankAccount?.id,
    source: "FILE_IMPORT",
    createdById: userId,
    bankTransactions: bankData,
  };

  console.log(bankTransactionData);

  const handleUpload = () => {};

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
                    customClass={
                      !selectedBankAccount?.id || bankData.length === 0
                        ? "uploadbs-button__disabled"
                        : "uploadbs-button__continue"
                    }
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
                      onClick={() => {
                        setCurrPage(1);
                        setBankData([]);
                      }}
                    />
                    <Button
                      text="Complete Import"
                      customClass={`uploadbs-button__continue ${
                        bankData.length === 0 ? "uploadbs-button__disabled" : ""
                      }`}
                      onClick={() => {
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
