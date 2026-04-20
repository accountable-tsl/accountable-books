import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useState } from 'react';

type PopupContent = {
  id: string;
  component?: React.ReactNode;
};

type PopupContextType = {
  popups: string[];
  componentPopups: PopupContent[];
  openPopup: (popupId: string, component?: React.ReactNode) => void;
  closePopup: (popupId: string) => void;
};

const PopupContext = createContext<PopupContextType | undefined>(undefined);

interface PopupProviderProps {
  children: ReactNode;
}

export const PopupProvider: React.FC<PopupProviderProps> = ({ children }) => {
  const [popups, setPopups] = useState<string[]>([]);
  const [componentPopups, setComponentPopups] = useState<PopupContent[]>([]);

  const openPopup = useCallback(
    (popupId: string, component?: React.ReactNode) => {
      if (component) {
        setComponentPopups((prev) => [
          ...prev.filter((p) => p.id !== popupId),
          { id: popupId, component },
        ]);
      } else {
        setPopups((prev) =>
          prev.includes(popupId) ? prev : [...prev, popupId],
        );
      }
    },
    [],
  );

  const closePopup = useCallback((popupId: string) => {
    setPopups((prevPopups) => prevPopups.filter((id) => id !== popupId));
    setComponentPopups((prev) => prev.filter((p) => p.id !== popupId));
  }, []);

  return (
    <PopupContext.Provider
      value={{ popups, componentPopups, openPopup, closePopup }}
    >
      {children}
    </PopupContext.Provider>
  );
};

export const usePopup = () => {
  const context = useContext(PopupContext);
  if (!context) {
    throw new Error('usePopup must be used within a PopupProvider');
  }
  return context;
};
