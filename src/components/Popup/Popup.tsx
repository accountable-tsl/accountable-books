import { useRef } from "react";
import ReactDOM from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleXmark } from "@fortawesome/free-solid-svg-icons";
import { usePopup } from "../../contexts/PopupContext";
import "./Popup.scss";

export default function Popup({ popupId, children }: any) {
  const { popups, closePopup } = usePopup();

  const popupRef = useRef(null);

  const handleOutsideClick = (event: any) => {
    if (popupRef.current && !popupRef.current.contains(event.target)) {
      closePopup(popupId);
    }
  };

  if (!popups.includes(popupId)) {
    return null;
  }

  return ReactDOM.createPortal(
    <div className="popup" onClick={handleOutsideClick}>
      <div className="popup-content" ref={popupRef}>
        {children}
        <button className="popup-close" onClick={() => closePopup(popupId)}>
          <FontAwesomeIcon icon={faCircleXmark} />
        </button>
      </div>
    </div>,
    document.getElementById("portal-root")
  );
}
