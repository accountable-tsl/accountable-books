import './Popup.scss';

import { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';

//
import { usePopup } from '../../contexts/PopupContext';

interface PopupProps {
  popupId: string;
  children: React.ReactNode;
}
export default function Popup({ popupId, children }: PopupProps) {
  const { popups, componentPopups, closePopup } = usePopup();

  const popupRef = useRef<HTMLDivElement>(null);

  const isVisible =
    popups.includes(popupId) || componentPopups.some((p) => p.id === popupId);

  useEffect(() => {
    if (!isVisible) return;

    const handleOutsideClick = (event: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(event.target as Node))
        closePopup(popupId);
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isVisible, popupId, closePopup]);

  if (!isVisible) return null;

  const portalRoot = document.getElementById('portal-root');
  if (!portalRoot) {
    throw new Error('Portal root element not found');
  }

  return ReactDOM.createPortal(
    <div className="popup">
      <div className="popup-content" ref={popupRef}>
        {children}
        <button className="popup-close" onClick={() => closePopup(popupId)}>
          {/* <FontAwesomeIcon icon={faCircleXmark} /> */}
        </button>
      </div>
    </div>,
    portalRoot,
  );
}
