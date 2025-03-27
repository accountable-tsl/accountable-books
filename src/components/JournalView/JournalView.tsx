import { useParams } from "react-router-dom";
import {
  CompanyData,
  JournalBatchData,
  JournalStatus,
} from "../../types/types";
import "./JournalView.scss";
import { BeatLoader } from "react-spinners";
import { useEffect, useState } from "react";
import { fetchJournalById } from "../../services/JournalServices";
import numeral from "numeral";
import { toTitleCase } from "../../utils/utils";
import { format } from "date-fns";

export default function JournalView({
  companyId,
}: {
  company?: CompanyData | null;
  companyId?: string;
}) {
  const { "*": journalId } = useParams();

  const [journalData, setJournalData] = useState<JournalBatchData | null>(null);

  const retrieveJournalData = async () => {
    if (!companyId || !journalId) return;
    const response = await fetchJournalById(companyId, journalId);
    console.log(response);
    if (response.success) {
      setJournalData(response.data);
    }
  };

  useEffect(() => {
    retrieveJournalData();
  }, [companyId, journalId]);

  const statusClassMap: Record<JournalStatus, string> = {
    [JournalStatus.DRAFT]: "journal-form-status__draft",
    [JournalStatus.POSTED]: "journal-form-status__posted",
    [JournalStatus.VOIDED]: "journal-form-status__voided",
  };

  const statusClassName = journalData?.status
    ? statusClassMap[journalData.status] || ""
    : "";

  const isLoading = !companyId || !journalId || !journalData;

  console.log("journalData", journalData);
  return (
    <div className="jv">
      {isLoading ? (
        <div className="journal-loading">
          <BeatLoader />
        </div>
      ) : (
        <>
          <div className="journal-form-header jv-header">
            <span className="journal-form-title jv-title">{`JNL-${numeral(
              journalData?.sequenceNumber
            ).format("000")}`}</span>
            <span
              className={`jv-status journal-form-status ${statusClassName}`}
            >
              {toTitleCase(String(journalData?.status))}
            </span>
          </div>
          <hr />

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

          <div className="jv-view-body"></div>
        </>
      )}
    </div>
  );
}
