import { useParams } from "react-router-dom";
import {
  CompanyData,
  DebitCredit,
  JournalBatchData,
  JournalGridData,
  JournalStatus,
} from "../../types/types";
import "./JournalView.scss";
import { BeatLoader } from "react-spinners";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchJournalById } from "../../services/JournalServices";
import numeral from "numeral";
import { normalizeDate, toTitleCase } from "../../utils/utils";
import { format } from "date-fns";
import EntryGrid, {
  EntryGridColumnInputType,
  EntryGridOption,
} from "../EntryGrid/EntryGrid";
import Decimal from "decimal.js";
import { fetchCoa } from "../../services/CoaServices";
import {
  JournalDateField,
  sumAmounts,
  transformJournalTransactions,
  validateJournalData,
} from "../JournalForm/JournalForm";
import { validatePlaceholder } from "../DatePlaceholderInput/DatePlaceholderInput";
import { DatePickerProps } from "antd";
import dayjs from "dayjs";
import JournalFormPopup from "../JournalForm/JournalFormPopup";
import { usePopup } from "../../contexts/PopupContext";

export default function JournalView({
  companyId,
  company,
}: {
  company?: CompanyData | null;
  companyId?: string;
}) {
  const { openPopup } = usePopup();
  const narrationRef = useRef<HTMLInputElement>(null);
  const { "*": journalId } = useParams();
  const reportingCurrencyCode = company?.reportingCurrencyCode;

  const [journalData, setJournalData] = useState<JournalBatchData | null>(null);
  const [editable, setEditable] = useState(false);
  const [accounts, setAccounts] = useState<EntryGridOption[]>([]);
  const [tempJournalGridData, setTempJournalGridData] = useState<any>();
  const [journalGridData, setJournalGridData] = useState<JournalGridData[]>();
  const [narration, setNarration] = useState<string>("");
  const [isNarrationValid, setIsNarrationValid] = useState(true);
  const [journalDate, setJournalDate] = useState<Date | dayjs.Dayjs | null>(
    dayjs()
  );

  const retrieveJournalData = async () => {
    if (!companyId || !journalId) return;
    const response = await fetchJournalById(companyId, journalId);
    console.log(response);
    if (response.success) {
      setJournalData(response.data);
      setNarration(response.data.description);
      setJournalDate(dayjs(response.data.date));
    }
  };

  const rowData = useMemo(() => {
    return journalData && journalData.journalTransactions
      ? journalData.journalTransactions.map((item) => {
          return {
            description: item.description || "",
            account: item.coaAccount
              ? {
                  label: item.coaAccount?.accountName,
                  value: item.coaAccountId,
                }
              : null,
            debit:
              item.side === DebitCredit.Debit
                ? numeral(new Decimal(item.amount).abs()).format("0,0.00")
                : "",
            credit:
              item.side === DebitCredit.Credit
                ? numeral(new Decimal(item.amount).abs()).format("0,0.00")
                : "",
          };
        })
      : null;
  }, [journalData]);

  const handleFetchCoa = useCallback(async () => {
    try {
      if (!companyId) return null;

      const coa = await fetchCoa({
        companyId,
      });

      if (coa.success) {
        const coaData = coa.data
          .filter((acc: any) => acc.accountTypeName !== "Bank")
          .map((acc: any) => ({
            label: acc.accountName,
            value: acc.id,
          }));

        setAccounts(coaData);
      }
    } catch (error) {
      console.error("Failed to fetch COA:", error);
    }
  }, [companyId]);

  const handleJournalGridChange = (updatedRows: any) => {
    setTempJournalGridData(updatedRows);
  };

  const handleNarrationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setNarration(value);
    setIsNarrationValid(validatePlaceholder(value));
  };

  const handleJournalDateChange: DatePickerProps["onChange"] = (
    date,
    dateString
  ) => {
    setJournalDate(date);
    console.log(date, dateString);
  };

  const handleJournalUpdate = async (status: JournalStatus) => {
    try {
      openPopup("journalFormPopup", <JournalFormPopup isLoading />);

      let validationErrors: string[] = [];
      if (!companyId || !journalGridData || !journalDate) {
        openPopup(
          "journalFormPopup",
          <JournalFormPopup errors={["Missing required fields"]} />
        );
        return;
      }

      validationErrors = validateJournalData(
        companyId,
        journalGridData,
        journalDate,
        narration
        // reversalDate
      );

      if (validationErrors.length > 0) {
        openPopup(
          "journalFormPopup",
          <JournalFormPopup errors={validationErrors} />
        );
        return;
      }

      const payload = {
        journalId,
        date: normalizeDate(journalDate),
        description: narration,
        status: status || journalData?.status || JournalStatus.DRAFT,
        transactions: transformJournalTransactions(journalGridData),
      };

      
    } catch (error) {}
  };

  const entryGridColumnData = [
    {
      key: "description",
      label: "Description",
      inputType: EntryGridColumnInputType.TEXT,
    },
    {
      key: "account",
      label: "Account",
      inputType: EntryGridColumnInputType.DROPDOWN,
      ...(editable ? { options: accounts } : {}),
    },
    {
      key: "debit",
      label: `Debit ${reportingCurrencyCode || ""}`,
      inputType: EntryGridColumnInputType.AMOUNT,
    },
    {
      key: "credit",
      label: `Credit ${reportingCurrencyCode || ""}`,
      inputType: EntryGridColumnInputType.AMOUNT,
    },
  ];

  const customClassNames = {
    root: "jv-eg journal-form-eg",
    cell: "jv-eg-cell",
  };

  const totals = useMemo(() => {
    return sumAmounts(tempJournalGridData, entryGridColumnData);
  }, [tempJournalGridData, entryGridColumnData]);

  useEffect(() => {
    retrieveJournalData();
  }, [companyId, journalId]);

  useEffect(() => {
    handleFetchCoa();
  }, [companyId, handleFetchCoa]);

  useEffect(() => {
    setTempJournalGridData(rowData);
  }, [rowData]);

  useEffect(() => {
    if (tempJournalGridData !== null) {
      setJournalGridData(tempJournalGridData);
    }
  }, [tempJournalGridData]);

  const statusClassMap: Record<JournalStatus, string> = {
    [JournalStatus.DRAFT]: "journal-form-status__draft",
    [JournalStatus.POSTED]: "journal-form-status__posted",
    [JournalStatus.VOIDED]: "journal-form-status__voided",
  };

  const statusClassName = journalData?.status
    ? statusClassMap[journalData.status] || ""
    : "";

  const isLoading =
    !companyId ||
    !journalId ||
    !journalData ||
    !rowData ||
    (editable && !accounts);

  console.log(journalData, tempJournalGridData);
  return (
    <div className="jv journal-form">
      {isLoading ? (
        <div className="journal-loading">
          <BeatLoader />
        </div>
      ) : (
        <>
          <div className="journal-form-header jv-header">
            <div className="jv-header-c">
              <span className="journal-form-title jv-title">{`JNL-${numeral(
                journalData?.sequenceNumber
              ).format("000")}`}</span>
              <span
                className={`jv-status journal-form-status ${statusClassName}`}
              >
                {toTitleCase(String(journalData?.status))}
              </span>
            </div>

            {journalData.status !== JournalStatus.VOIDED && (
              <div className="jv-header-r">
                <button
                  className={`jv-header-btn ${
                    editable ? "jv-header-btn-edit" : ""
                  }`}
                  onClick={() => setEditable(true)}
                >
                  Edit
                </button>

                <button
                  className={`jv-header-btn ${
                    editable ? "jv-header-btn-edit" : ""
                  } ${
                    (journalData.status as JournalStatus) !==
                    JournalStatus.VOIDED
                      ? "jv-header-btn-del"
                      : ""
                  }`}
                  // onClick={() => setEditable(true)}
                >
                  {journalData.status === JournalStatus.DRAFT
                    ? "Delete"
                    : "Void"}
                </button>
              </div>
            )}
          </div>
          <hr />

          {editable ? (
            <div className="journal-form-meta">
              <div className="journal-form-meta__group">
                <JournalDateField
                  required
                  onChange={handleJournalDateChange}
                  defaultValue={journalDate ? dayjs(journalDate) : dayjs()}
                />
                <div
                  className={`journal-form-meta__item journal-form-narration`}
                >
                  <div className="journal-form-input journal-form-narration__text">
                    <span className="journal-form-narration__label">
                      Narration<span>*</span> :
                    </span>
                    <input
                      ref={narrationRef}
                      value={narration}
                      type="text"
                      name=""
                      id=""
                      placeholder="Enter Journal Narration"
                      className={`journal-form-narration__input ${
                        isNarrationValid
                          ? ""
                          : "journal-form-narration__error-input"
                      }`}
                      onChange={handleNarrationChange}
                    />
                    {!isNarrationValid && (
                      <span className="journal-form-narration__error-text">
                        One or more placeholders are invalid
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="jv-meta">
              <div className="jv-meta-group">
                <div className="jv-meta-item">
                  <span className="jv-meta-label">Date:</span>
                  <span className="jv-meta-date">
                    {journalData?.date &&
                      format(new Date(journalData?.date), "dd MMM yyyy")}
                  </span>
                </div>

                <div className="jv-meta-item">
                  <span className="jv-meta-label">Narration:</span>
                  <span className="jv-meta-narration">
                    {journalData.description}
                  </span>
                </div>
              </div>

              {/* <div className="jv-meta-status">{journalData.status}</div> */}
            </div>
          )}

          <div className="jv-view-body journal-form-body">
            <EntryGrid
              columns={entryGridColumnData}
              isEditable={editable}
              data={rowData}
              customClassNames={customClassNames}
              onChange={handleJournalGridChange}
            />

            <dl className="journal-form-eg__summary">
              <div className="journal-form-eg__summary-container">
                <div className="journal-form-eg__summary-inner">
                  <div className="journal-form-eg__summary-row">
                    <dt className="journal-form-eg__summary-label">
                      Total Debits
                    </dt>
                    <dd className="journal-form-eg__summary-amount journal-form-eg__summary-debit">
                      {numeral(totals.debit.toString()).format("0,0.00")}
                    </dd>
                  </div>
                  <div className="journal-form-eg__summary-equal">
                    {totals.debit.sub(totals.credit).isZero() ? "=" : "≠"}
                  </div>
                  <div className="journal-form-eg__summary-row">
                    <dt className="journal-form-eg__summary-label">
                      Total Credits
                    </dt>
                    <dd className="journal-form-eg__summary-credit">
                      {numeral(totals.credit.toString()).format("0,0.00")}
                    </dd>
                  </div>
                </div>
                <div className="journal-form-eg__summary-diff">
                  <dt className="journal-form-eg__summary-label">
                    Difference:
                  </dt>
                  <dd
                    className={`journal-form-eg__summary-diffamt ${
                      totals.debit.sub(totals.credit).isZero()
                        ? "journal-form-eg__summary-diffamt--zero"
                        : ""
                    }`}
                  >
                    {numeral(totals.debit.sub(totals.credit).toString()).format(
                      "0,0.00"
                    )}
                  </dd>
                </div>
              </div>
            </dl>
          </div>
          <div className="journal-form-bottom">
            {editable && journalData.status !== JournalStatus.VOIDED && (
              <div className="journal-form-submit">
                <button
                  className="journal-form-submit__button journal-form-submit__button--draft"
                  onClick={() => {
                    handlePostJournal(JournalStatus.DRAFT);
                  }}
                >
                  {journalData.status === JournalStatus.DRAFT
                    ? "Update draft"
                    : "Cancel"}
                </button>
                <button
                  className="journal-form-submit__button journal-form-submit__button--post"
                  onClick={() => {
                    handlePostJournal(JournalStatus.POSTED);
                  }}
                >
                  {journalData.status === JournalStatus.DRAFT
                    ? "Post Journal"
                    : "Update Journal"}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
