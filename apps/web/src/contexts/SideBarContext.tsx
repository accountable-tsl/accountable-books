import { createContext, ReactNode, useContext, useState } from 'react';

type SideBarProviderProps = {
  children: ReactNode;
};

type SideBarContextType = {
  sideBarType: 'small' | 'large';
  toggle: () => void;
  setSideBarType: (type: 'small' | 'large') => void;
};

const SideBarContext = createContext<SideBarContextType | null>(null);

export function useSideBarContext() {
  const value = useContext(SideBarContext);
  if (value == null) throw Error('Cannot use outside of Sidebar Provider');
  return value;
}

export default function SideBarProvider({ children }: SideBarProviderProps) {
  const [sideBarType, setSideBarType] = useState<'small' | 'large'>('small');

  function toggle() {
    setSideBarType((prev) => (prev === 'small' ? 'large' : 'small'));
  }

  return (
    <SideBarContext.Provider value={{ sideBarType, toggle, setSideBarType }}>
      {children}
    </SideBarContext.Provider>
  );
}
