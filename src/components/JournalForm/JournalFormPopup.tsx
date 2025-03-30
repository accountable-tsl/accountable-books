import { BounceLoader } from "react-spinners";
import "./JournalForm.scss";
import { useEffect, useState } from "react";
import { usePopup } from "../../contexts/PopupContext";

interface JournalFormPopupProps {
  isLoading?: boolean;
  isSuccess?: boolean;
  errors?: string[];
  onClose?: () => void;
}

export default function JournalFormPopup({
  errors = [],
  isLoading = false,
  isSuccess = false,
  onClose,
}: JournalFormPopupProps) {
  const { closePopup } = usePopup();

  const [state, setState] = useState<"loading" | "error" | "success">(
    "loading"
  );

  useEffect(() => {
    if (isLoading) {
      setState("loading");
      return;
    }
    const timer = setTimeout(() => {
      setState(isSuccess && errors.length === 0 ? "success" : "error");
    }, 3000);

    return () => clearTimeout(timer);
  }, [errors, isSuccess]);

  return (
    <div className="jf-pop">
      <div className="jf-pop-top">
        <div className="jf-pop-icon">
          {state === "loading" && <BounceLoader speedMultiplier={0.75} />}

          {state === "error" && (
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
        </div>
      </div>

      <div className="jf-pop-body">
        {state === "error" && (
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

        {state === "success" && <p>Journal created successfully!</p>}
      </div>
      <div className="jf-pop-footer">
        <button
          className="jf-pop-close"
          onClick={onClose ? onClose : () => closePopup("journalFormPopup")}
        >
          {errors.length > 0 ? "Close and fix errors" : "Close"}
        </button>
      </div>
    </div>
  );
}
