import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./JournalForm.scss";
import EntryGrid, {
  ColumnConfig,
  EntryGridColumnInputType,
  EntryGridOption,
} from "../EntryGrid/EntryGrid";
import JournalRecurrenceSettings from "../JournalRecurrenceSettings/JournalRecurrenceSettings";
import type { DatePickerProps } from "antd";
import { DatePicker, Space } from "antd";
import {
  CompanyData,
  DebitCredit,
  JournalGridData,
  JournalStatus,
  JournalTransaction,
  PostJournalPayload,
} from "../../types/types";
import { normalizeDate, parseDecimal, toTitleCase } from "../../utils/utils";
import dayjs from "dayjs";
import DatePlaceholderInput, {
  usePlaceholderInput,
  validatePlaceholder,
} from "../DatePlaceholderInput/DatePlaceholderInput";
import { BeatLoader } from "react-spinners";
import { fetchCoa } from "../../services/CoaServices";
import Decimal from "decimal.js";
import numeral from "numeral";
import { postJournal } from "../../services/JournalServices";
import { usePopup } from "../../contexts/PopupContext";
import JournalFormPopup from "./JournalFormPopup";

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
  const { openPopup } = usePopup();

  const [accounts, setAccounts] = useState<EntryGridOption[]>([]);
  const [journalGridData, setJournalGridData] = useState<JournalGridData[]>();
  const [tempJournalGridData, setTempJournalGridData] = useState<any>();
  const [isRecurring, _setIsRecurring] = useState(type === "recurring");
  const [journalDate, setJournalDate] = useState<Date | dayjs.Dayjs | null>(
    dayjs()
  );
  const [reversalDate, setReversalDate] = useState<Date | dayjs.Dayjs | null>(
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
    setJournalDate(date);
    console.log(date, dateString);
  };
  const handleReversalDateChange: DatePickerProps["onChange"] = (date) => {
    setReversalDate(date);
  };
  const handleRecurringStartDateChange: DatePickerProps["onChange"] = (
    date
  ) => {
    setRecurringStartDate(date);
  };
  const handleRecurringEndDateChange: DatePickerProps["onChange"] = (date) => {
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
            label: acc.accountName,
            // ? `${acc.accountCode} - ${acc.accountName}`
            // : acc.accountName,
            value: acc.id,
          }));

        setAccounts(coaData);
      }
    } catch (error) {
      console.error("Failed to fetch COA:", error);
    }
  }, [companyId]);

  const handlePostJournal = async (saveAs: JournalStatus) => {
    if (!companyId) return;

    try {
      openPopup("journalFormPopup", <JournalFormPopup isLoading />);

      const journalValidationErrors: string[] = [];

      if (!journalGridData || journalGridData.length === 0) {
        journalValidationErrors.push("Transactions: No transactions found");
        openPopup(
          "journalFormPopup",
          <JournalFormPopup errors={journalValidationErrors} />
        );
        return;
      }

      if (!journalDate) {
        journalValidationErrors.push("Date: Valid journal date is required");
      } else if (isNaN(normalizeDate(journalDate).getTime())) {
        journalValidationErrors.push("Date: Invalid journal date format");
      }

      if (reversalDate) {
        if (isNaN(normalizeDate(reversalDate).getTime())) {
          journalValidationErrors.push("Reversal Date: Invalid date format");
        } else if (
          normalizeDate(journalDate).getTime() >
          normalizeDate(reversalDate).getTime()
        ) {
          journalValidationErrors.push(
            "Reversal Date: Must be after journal date"
          );
        }
      }

      if (!narration || narration.trim() === "") {
        journalValidationErrors.push("Narration: Valid narration is required");
      } else if (narration.length > 255) {
        journalValidationErrors.push(
          "Narration: Must be less than 255 characters"
        );
      }

      if (journalGridData && journalGridData.length < 2) {
        journalValidationErrors.push(
          "Transactions: At least two transactions required"
        );
      }

      // const totalDebit =
      //   journalGridData?.reduce((sum, entry) => {
      //     if (entry.debit) {
      //       try {
      //         const debitAmt = new Decimal(entry.debit.replace(/,/g, ""));
      //         return debitAmt.greaterThan(0) ? sum.plus(debitAmt) : sum;
      //       } catch {
      //         return sum;
      //       }
      //     }
      //     return sum;
      //   }, new Decimal(0)) || new Decimal(0);

      // const totalCredit =
      //   journalGridData?.reduce((sum, entry) => {
      //     if (entry.credit) {
      //       try {
      //         const creditAmt = new Decimal(entry.credit.replace(/,/g, ""));
      //         return creditAmt.greaterThan(0) ? sum.plus(creditAmt) : sum;
      //       } catch {
      //         return sum;
      //       }
      //     }
      //     return sum;
      //   }, new Decimal(0)) || new Decimal(0);

      // if (totalDebit.equals(totalCredit)) {
      //   journalValidationErrors.push(
      //     "Transactions: Total debit and credit must be equal"
      //   );
      // }

      const { totalDebit, totalCredit, amountErrors } = journalGridData.reduce(
        (acc, entry, index) => {
          // Validate individual transaction amounts first
          const debitStr = entry.debit?.replace(/[^0-9.]/g, "") || "";
          const creditStr = entry.credit?.replace(/[^0-9.]/g, "") || "";

          // Validate only one side is populated
          if (!!debitStr && !!creditStr) {
            acc.amountErrors.push(
              `Transaction ${index + 1}: Cannot have both debit and credit`
            );
            return acc;
          }

          // Parse amounts safely
          const parseAmount = (str: string) => {
            try {
              const clean = str.replace(/,/g, "");
              return new Decimal(clean);
            } catch {
              return new Decimal(NaN);
            }
          };

          const debitAmount = parseAmount(debitStr);
          const creditAmount = parseAmount(creditStr);

          // Validate amounts are positive numbers
          if (debitAmount.isNaN() || debitAmount.lessThanOrEqualTo(0)) {
            if (debitStr)
              acc.amountErrors.push(
                `Transaction ${index + 1}: Invalid debit amount`
              );
          }
          if (creditAmount.isNaN() || creditAmount.lessThanOrEqualTo(0)) {
            if (creditStr)
              acc.amountErrors.push(
                `Transaction ${index + 1}: Invalid credit amount`
              );
          }

          // Only sum valid amounts
          if (debitAmount.greaterThan(0)) {
            acc.totalDebit = acc.totalDebit.plus(debitAmount);
          } else if (creditAmount.greaterThan(0)) {
            acc.totalCredit = acc.totalCredit.plus(creditAmount);
          }

          return acc;
        },
        {
          totalDebit: new Decimal(0),
          totalCredit: new Decimal(0),
          amountErrors: [] as string[],
        }
      );

      // Add amount errors to validation errors
      journalValidationErrors.push(...amountErrors);

      // Now check balance (THIS WAS YOUR MAIN ISSUE - INVERTED CONDITION)
      if (!totalDebit.equals(totalCredit)) {
        journalValidationErrors.push(
          `Transactions: Debits (${numeral(totalDebit).format(
            "0,0.00"
          )}) do not match credits (${numeral(totalCredit).format("0,0.00")})`
        );
      }

      journalGridData.forEach((entry, index) => {
        const prefix = `Transaction ${index + 1}`;

        if (entry.description && entry.description.length > 255) {
          journalValidationErrors.push(
            `${prefix}: Description must be less than 255 characters`
          );
        }

        if (
          entry.description &&
          (!entry.account || (!entry.debit && !entry.credit))
        ) {
          journalValidationErrors.push(
            `${prefix}: Account and debit or credit required`
          );
        }

        if (
          (entry.account || entry.debit || entry.credit) &&
          !entry.description
        ) {
          journalValidationErrors.push(`${prefix}: Description required`);
        }

        if (entry.account && !entry.account.value) {
          journalValidationErrors.push(`${prefix}: Valid account required`);
        }

        let debitAmt = null;
        let creditAmt = null;

        if (entry.debit) {
          try {
            debitAmt = new Decimal(entry.debit.replace(/,/g, ""));
            if (debitAmt.lessThanOrEqualTo(0)) {
              journalValidationErrors.push(`${prefix}: Debit must be positive`);
            }
          } catch {
            journalValidationErrors.push(`${prefix}: Debit has invalid format`);
          }
        }

        if (entry.credit) {
          try {
            creditAmt = new Decimal(entry.credit.replace(/,/g, ""));
            if (creditAmt.lessThanOrEqualTo(0)) {
              journalValidationErrors.push(
                `${prefix}: Credit must be positive`
              );
            }
          } catch {
            journalValidationErrors.push(
              `${prefix}: Credit has invalid format`
            );
          }
        }

        if (debitAmt && creditAmt) {
          journalValidationErrors.push(
            `${prefix}: Cannot have both debit and credit`
          );
        }

        if (entry.account && !debitAmt && !creditAmt) {
          journalValidationErrors.push(`${prefix}: Debit or credit required`);
        }
      });

      if (journalValidationErrors.length > 0) {
        openPopup(
          "journalFormPopup",
          <JournalFormPopup errors={journalValidationErrors} />
        );
        return;
      }

      const payload: PostJournalPayload = {
        data: [
          {
            date: normalizeDate(journalDate),
            description: narration,
            status: saveAs || JournalStatus.DRAFT,
            ...(reversalDate && {
              autoReverseDate: normalizeDate(reversalDate),
            }),
            transactions: transformJournalTransactions(journalGridData),
          },
        ],
      };

      const response = await postJournal(companyId, payload);
      console.log(response.data);

      if (response.success) {
        openPopup("journalFormPopup", <JournalFormPopup isSuccess />);
      } else {
        openPopup(
          "journalFormPopup",
          <JournalFormPopup
            errors={[
              response.data.error ||
                response.data.message ||
                "Submission failed",
            ]}
          />
        );
      }
    } catch (error) {
      console.error("Error posting journal:", error);
      openPopup(
        "journalFormPopup",
        <JournalFormPopup
          errors={[
            error instanceof Error
              ? error.message
              : "An unexpected error occurred",
          ]}
        />
      );
    }
  };

  const handleJournalGridChange = (updatedRows: any) => {
    // console.log("Updated Data:", updatedRows);
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
      hasDatePlaceholder: isRecurring,
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
      exclusiveWith: "credit",
    },
    {
      key: "credit",
      label: `Credit ${reportingCurrencyCode || ""}`,
      inputType: EntryGridColumnInputType.AMOUNT,
      exclusiveWith: "debit",
    },
  ];

  const entryGridCustomClassNames = {
    root: "journal-form-eg",
    textCell: "journal-form-eg__text--cell",
  };

  const totals = useMemo(() => {
    return sumAmounts(tempJournalGridData, entryGridColumnData);
  }, [tempJournalGridData, entryGridColumnData]);

  const transformJournalTransactions = (
    journalData: JournalGridData[]
  ): JournalTransaction[] => {
    return journalData
      .filter(
        (
          tx
        ): tx is JournalGridData &
          (
            | { debit: string; account: { value: string } }
            | { credit: string; account: { value: string } }
          ) => {
          return Boolean(
            tx.account?.value && tx.description && (tx.debit || tx.credit)
          );
        }
      )
      .map((tx) => {
        const { description, account, debit, credit } = tx;
        const isDebit = !!debit;
        const amountString = String(isDebit ? debit : credit) as string;
        const cleanedAmount = amountString.replace(/[,\s]/g, "");

        if (!cleanedAmount) {
          throw new Error(
            `Invalid empty amount in transaction: ${JSON.stringify(tx)}`
          );
        }

        try {
          const amount = new Decimal(cleanedAmount);

          if (amount.isZero()) {
            throw new Error("Zero value transactions are not allowed.");
          }

          return {
            description: description.trim() || undefined,
            side: isDebit ? DebitCredit.Debit : DebitCredit.Credit,
            amount: isDebit ? amount : amount.negated(),
            coaAccountId: account.value,
          };
        } catch (error: any) {
          throw new Error(
            `Invalid amount value '${amountString}' in transaction: ${error.message}`
          );
        }
      });
  };

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

  console.log(tempJournalGridData)

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
              initialRows={3}
              onChange={handleJournalGridChange}
              customClassNames={entryGridCustomClassNames}
              isEditable={true}
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
            <div className="journal-form-submit">
              <button
                className="journal-form-submit__button journal-form-submit__button--draft"
                onClick={() => {
                  handlePostJournal(JournalStatus.DRAFT);
                }}
              >
                Save as draft
              </button>
              <button
                className="journal-form-submit__button journal-form-submit__button--post"
                onClick={() => {
                  handlePostJournal(JournalStatus.POSTED);
                }}
              >
                Post Journal
              </button>
            </div>
          </div>
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

export const sumAmounts = (
  journalData: any[],
  entryGridColumnData: {
    key: string;
    label: string;
    inputType: EntryGridColumnInputType;
  }[]
) => {
  if (!journalData || !Array.isArray(journalData) || journalData.length === 0) {
    return entryGridColumnData
      .filter((col) => col.inputType === EntryGridColumnInputType.AMOUNT)
      .reduce(
        (emptyTotals, col) => ({
          ...emptyTotals,
          [col.key]: new Decimal(0),
        }),
        {} as Record<string, Decimal>
      );
  }
  try {
    return entryGridColumnData
      .filter((col) => col.inputType === EntryGridColumnInputType.AMOUNT)
      .reduce((totals, col) => {
        const key = col.key;
        totals[key] = journalData.reduce(
          (sum, entry) => sum.plus(parseDecimal(entry?.[key])),
          new Decimal(0)
        );
        return totals;
      }, {} as Record<string, Decimal>);
  } catch (error) {
    console.error("Error calculating amount totals:", error);
    return {} as Record<string, Decimal>;
  }
};
