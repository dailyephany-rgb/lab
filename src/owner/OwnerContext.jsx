

import React, { createContext, useState } from "react";

export const OwnerContext = createContext();

export function OwnerProvider({ children }) {
  const today = new Date().toISOString().slice(0, 10);

  const [dateRange, setDateRange] = useState({
    from: today,
    to: today
  });

  const [source, setSource] = useState("All");

  return (
    <OwnerContext.Provider
      value={{
        dateRange,
        setDateRange,
        source,
        setSource
      }}
    >
      {children}
    </OwnerContext.Provider>
  );
}