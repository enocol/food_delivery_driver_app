import React, { createContext, useContext, useState } from "react";

const OnlineContext = createContext({
  isOnline: false,
  setIsOnline: () => {},
  statusLabel: null,
  setStatusLabel: () => {},
});

export function OnlineProvider({ children }) {
  const [isOnline, setIsOnline] = useState(false);
  const [statusLabel, setStatusLabel] = useState(null);
  return (
    <OnlineContext.Provider
      value={{ isOnline, setIsOnline, statusLabel, setStatusLabel }}
    >
      {children}
    </OnlineContext.Provider>
  );
}

export function useOnlineStatus() {
  return useContext(OnlineContext);
}
