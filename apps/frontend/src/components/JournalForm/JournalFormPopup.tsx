import { BounceLoader } from "react-spinners";
import "./JournalForm.scss";
import { useEffect, useState } from "react";
import { usePopup } from "../../contexts/PopupContext";

interface JournalFormPopupProps {
  isLoading?: boolean;
  isSuccess?: boolean;
  isDelete?: boolean;
  errors?: string[];
  onClose?: () => void;
  successMessage?: string;
}

export default function JournalFormPopup({
  errors = [],
  isLoading = false,
  isSuccess = false,
  isDelete = false,
  onClose,
  successMessage = "Journal created successfully!",
}: JournalFormPopupProps) {
  const { closePopup } = usePopup();

  const [state, setState] = useState<
    "loading" | "error" | "success" | "delete"
  >("loading");

  useEffect(() => {
    if (isLoading) {
      setState("loading");
      return;
    }

    if (isDelete) {
      setState("delete");
      return;
    }

    const timer = setTimeout(() => {
      if (isDelete) {
        setState("delete");
      } else if (isSuccess && errors.length === 0) {
        setState("success");
      } else {
        setState("error");
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [isLoading, isSuccess, isDelete, errors]);

  return (
    <div className="jf-pop">
      <div className="jf-pop-top">
        <div className="jf-pop-icon">
          {state === "loading" && <BounceLoader speedMultiplier={0.75} />}

          {(state === "error" || state === "delete") && (
            <video
              src="/alert.webm"
              autoPlay
              loop
              muted
              onLoadedMetadata={(e) => (e.currentTarget.playbackRate = 0.5)}
            />
          )}
          {state === "success" && (
            <video src="/success.webm" autoPlay loop muted />
          )}
        </div>

        <div className="jf-pop-title">
          {state === "loading" && "Processing..."}
          {state === "error" && "Validation Issues"}
          {state === "success" && "Success"}
          {state === "delete" && "Confirm Delete?"}
        </div>
      </div>

      <div className="jf-pop-body">
        {(state === "error" || state === "delete") && (
          <>
            {errors.length > 0 ? (
              <div className="jf-pop-errors">
                {errors.map((error, index) => (
                  <div className="jf-pop-error" key={index}>
                    {error}
                  </div>
                ))}
              </div>
            ) : (
              <p>An unexpected error occurred. Please try again.</p>
            )}
          </>
        )}

        {state === "success" && <p>{successMessage}</p>}
      </div>
      <div className="jf-pop-footer">
        {!isDelete && (
          <button
            className="jf-pop-close"
            onClick={onClose ? onClose : () => closePopup("journalFormPopup")}
          >
            {errors.length > 0 ? "Close and fix errors" : "Close"}
          </button>
        )}

        {isDelete && (
          <>
            <button
              className="jf-pop-close jf-pop-close__no"
              onClick={() => closePopup("journalFormPopup")}
            >
              Cancel
            </button>
            <button
              className="jf-pop-close jf-pop-close__yes"
              onClick={onClose ? onClose : () => closePopup("journalFormPopup")}
            >
              Delete
            </button>
          </>
        )}
      </div>
    </div>
  );
}
