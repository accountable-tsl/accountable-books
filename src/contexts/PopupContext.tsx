import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useState,
} from "react";

type PopupContextType = {
  popups: string[];
  openPopup: (popupId: string) => void;
  closePopup: (popupId: string) => void;
};

const PopupContext = createContext<PopupContextType | undefined>(undefined);

interface PopupProviderProps {
  children: ReactNode;
}

export const PopupProvider: React.FC<PopupProviderProps> = ({ children }) => {
  const [popups, setPopups] = useState<string[]>([]);

  const openPopup = useCallback((popupId: string) => {
    setPopups((prevPopups) =>
      prevPopups.includes(popupId) ? prevPopups : [...prevPopups, popupId]
    );
  }, []);

  const closePopup = useCallback((popupId: string) => {
    setPopups((prevPopups) => prevPopups.filter((id) => id !== popupId));
  }, []);

  return (
    <PopupContext.Provider value={{ popups, openPopup, closePopup }}>
      {children}
    </PopupContext.Provider>
  );
};

export const usePopup = () => {
  const context = useContext(PopupContext);
  if (!context) {
    throw new Error("usePopup must be used within a PopupProvider");
  }
  return context;
};
