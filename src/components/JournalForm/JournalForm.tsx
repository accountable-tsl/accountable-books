import { useCallback, useEffect, useRef, useState } from "react";
import "./JournalForm.scss";
import EntryGrid, {
  ColumnConfig,
  EntryGridColumnInputType,
  EntryGridOption,
} from "../EntryGrid/EntryGrid";
import JournalRecurrenceSettings from "../JournalRecurrenceSettings/JournalRecurrenceSettings";
import type { DatePickerProps } from "antd";
import { DatePicker, Space } from "antd";
import { CompanyData, JournalStatus } from "../../types/types";
import { toTitleCase } from "../../utils/utils";
import dayjs from "dayjs";
import DatePlaceholderInput, {
  usePlaceholderInput,
  validatePlaceholder,
} from "../DatePlaceholderInput/DatePlaceholderInput";
import { BeatLoader } from "react-spinners";
import { fetchCoa } from "../../services/CoaServices";

interface JournalFormProps {
  journalStatus: JournalStatus;
  type?: "recurring" | undefined;
  company?: CompanyData | null;
  companyId?: string;
}

export default function JournalForm({
  type,
  journalStatus,
  company,
  companyId,
}: JournalFormProps) {
  const [accounts, setAccounts] = useState<EntryGridOption[]>([]);
  const [_journalGridData, setJournalGridData] = useState<any>();
  const [tempJournalGridData, setTempJournalGridData] = useState<any>();
  const [isRecurring, _setIsRecurring] = useState(type === "recurring");
  const [_journalDate, setJournalDate] = useState<Date | dayjs.Dayjs | null>(
    dayjs()
  );
  const [_reversalDate, setReversalDate] = useState<Date | dayjs.Dayjs | null>(
    null
  );
  const [_recurringStartDate, setRecurringStartDate] = useState<
    Date | dayjs.Dayjs | null
  >(null);

  const [_recurringEndDate, setRecurringEndDate] = useState<
    Date | dayjs.Dayjs | null
  >(null);

  const [saveStatus, setSaveStatus] = useState<JournalStatus | String>(
    JournalStatus.DRAFT
  );

  const [neverExpires, setNeverExpires] = useState(true);
  const [narration, setNarration] = useState<string>("");
  const [isNarrationValid, setIsNarrationValid] = useState(true);

  const narrationRef = useRef<HTMLInputElement>(null);

  const handleJournalDateChange: DatePickerProps["onChange"] = (
    date,
    dateString
  ) => {
    console.log(date, dateString);
    setJournalDate(date);
  };
  const handleReversalDateChange: DatePickerProps["onChange"] = (
    date,
    dateString
  ) => {
    console.log(date, dateString);
    setReversalDate(date);
  };
  const handleRecurringStartDateChange: DatePickerProps["onChange"] = (
    date,
    dateString
  ) => {
    console.log(date, dateString);
    setRecurringStartDate(date);
  };
  const handleRecurringEndDateChange: DatePickerProps["onChange"] = (
    date,
    dateString
  ) => {
    console.log(date, dateString);
    setRecurringEndDate(date);
    if (date) setNeverExpires(false);
  };

  const handleNeverExpiresChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNeverExpires(e.target.checked);
    if (e.target.checked) setRecurringEndDate(null);
  };

  const handleRecurringSaveStatus = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setSaveStatus(e.target.value);
  };

  const handleNarrationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setNarration(value);
    setIsNarrationValid(validatePlaceholder(value));
  };

  const { insertPlaceholderAtCursor } = usePlaceholderInput({
    value: narration,
    setValue: setNarration,
    inputRef: narrationRef,
  });

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
            label: acc.accountCode
              ? `${acc.accountCode} - ${acc.accountName}`
              : acc.accountName,
            value: acc.id,
          }));

        setAccounts(coaData);
      }
    } catch (error) {
      console.error("Failed to fetch COA:", error);
    }
  }, [companyId]);

  const handleJournalGridChange = (updatedRows: any) => {
    console.log("Updated Data:", updatedRows);
    setTempJournalGridData(updatedRows);
  };

  const statusClassMap: Record<JournalStatus, string> = {
    [JournalStatus.DRAFT]: "journal-form-status__draft",
    [JournalStatus.POSTED]: "journal-form-status__posted",
    [JournalStatus.VOIDED]: "journal-form-status__voided",
  };

  const statusClassName = statusClassMap[journalStatus] || "";

  const reportingCurrencyCode = company?.reportingCurrencyCode;

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
      options: accounts,
    },
    {
      key: "debit",
      label: `Debit ${reportingCurrencyCode || ""}`,
      inputType: EntryGridColumnInputType.AMOUNT,
    },
    {
      key: "credit",
      label: `Credit ${reportingCurrencyCode || ""}`,
      inputType: EntryGridColumnInputType.TEXT,
    },
  ];

  const sumAmounts = (
    tempJournalData: any[],
    entryGridColumnData: {
      key: string;
      label: string;
      inputType: EntryGridColumnInputType;
    }[]
  ) => {
    return entryGridColumnData
      .filter((col) => col.inputType === EntryGridColumnInputType.AMOUNT)
      .reduce((totals, col) => {
        const key = col.key;
        totals[key] = tempJournalData.reduce(
          (sum, entry) => sum + (Number(entry[key]) || 0),
          0
        );
        return totals;
      }, {} as Record<string, number>);
  };

  const totals = useCallback(() => {
    sumAmounts(tempJournalGridData, entryGridColumnData);
  }, [tempJournalGridData, entryGridColumnData]);

  console.log(totals);

  const isLoading =
    !companyId || !company || !accounts || accounts.length === 0;

  useEffect(() => {
    handleFetchCoa();
  }, [companyId, handleFetchCoa]);

  useEffect(() => {
    if (tempJournalGridData !== null) {
      setJournalGridData(tempJournalGridData);
    }
  }, [tempJournalGridData]);

  return (
    <div className="journal-form">
      {isLoading ? (
        <div className="journal-loading">
          <BeatLoader />
        </div>
      ) : (
        <>
          <div className="journal-form-top">
            <div className="journal-form-header">
              <span className="journal-form-title">
                {isRecurring ? "New Recurring Journal" : "New Journal Entry"}
              </span>
              <span className={`journal-form-status ${statusClassName}`}>
                {toTitleCase(journalStatus)}
              </span>
            </div>
            <hr />
            <form>
              {isRecurring ? (
                <JournalRecurrenceSettings
                  handleRecurringStartDateChange={
                    handleRecurringStartDateChange
                  }
                  handleRecurringEndDateChange={handleRecurringEndDateChange}
                  handleNeverExpiresChange={handleNeverExpiresChange}
                  neverExpires={neverExpires}
                  handleRecurringSaveStatus={handleRecurringSaveStatus}
                  saveStatus={saveStatus}
                />
              ) : null}

              <div className="journal-form-meta">
                <div className="journal-form-meta__group">
                  {!isRecurring && (
                    <JournalDateField
                      required
                      onChange={handleJournalDateChange}
                    />
                  )}

                  <div
                    className={`journal-form-meta__item journal-form-narration ${
                      isRecurring ? "journal-form-narration__rc" : ""
                    }`}
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

                    {isRecurring && (
                      <DatePlaceholderInput
                        onInsert={insertPlaceholderAtCursor}
                        className={"journal-form-narration__placeholder"}
                      />
                    )}
                  </div>
                </div>

                <div className="journal-form-meta__group">
                  {!isRecurring && (
                    <JournalDateField
                      onChange={handleReversalDateChange}
                      label="Auto-Reversal Date"
                      parentClassName="journal-form-meta__item journal-form-date journal-form-date__reversal"
                      labelClassName="journal-form-label journal-form-date__label"
                    />
                  )}
                </div>
              </div>
            </form>
          </div>
          <div className="journal-form-body">
            <EntryGrid
              columns={entryGridColumnData as ColumnConfig[]}
              showDeleteIconPerRow={true}
              initialRows={5}
              onChange={handleJournalGridChange}
              customClassNames={{ root: "journal-form-eg" }}
            />

            <dl className="journal-form-eg__summary">
              <div className="journal-form-eg__summary-container">
                <div className="journal-form-eg__summary-inner">
                  <div className="journal-form-eg__summary-row">
                    <dt className="journal-form-eg__summary-label">
                      Total Debits
                    </dt>
                    <dd className="journal-form-eg__summary-amount journal-form-eg__summary-debit">
                      0.00
                    </dd>
                  </div>
                  <div className="journal-form-eg__summary-equal">= / ≠</div>
                  <div className="journal-form-eg__summary-row">
                    <dt className="journal-form-eg__summary-label">
                      Total Credits
                    </dt>
                    <dd className="journal-form-eg__summary-credit">0.00</dd>
                  </div>
                </div>
                <div className="journal-form-eg__summary-diff">
                  <dt className="journal-form-eg__summary-label">
                    Difference:
                  </dt>
                  <dd className="journal-form-eg__summary-diffamt">0.00</dd>
                </div>
              </div>
            </dl>
          </div>
          <div className="journal-form-bottom"></div>
        </>
      )}
    </div>
  );
}

interface JournalDateFieldProps extends DatePickerProps {
  dateFormat?: string;
  onChange: NonNullable<DatePickerProps["onChange"]>;
  label?: string;
  required?: boolean;
  defaultValue?: dayjs.Dayjs | null;
  parentClassName?: string;
  labelClassName?: string;
  datePickerClassName?: string;
}
export function JournalDateField({
  onChange,
  dateFormat = "DD MMM YYYY",
  label = "Date",
  required = false,
  defaultValue = dayjs(),
  parentClassName = "journal-form-meta__item journal-form-date journal-form-date__journal",
  labelClassName = "journal-form-label journal-form-date__label",
  datePickerClassName = "journal-form-date__picker",
}: JournalDateFieldProps) {
  return (
    <div className={parentClassName}>
      <div className={labelClassName}>
        {label}
        {required && <span>*</span>}
        {" :"}
      </div>
      <Space direction="vertical" className={datePickerClassName}>
        <DatePicker
          onChange={onChange}
          format={dateFormat}
          defaultValue={defaultValue}
        />
      </Space>
    </div>
  );
}
