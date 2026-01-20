

// src/main_owner_esr.jsx
import React from "react";
import ReactDOM from "react-dom/client";

import { OwnerProvider } from "./owner/OwnerContext.jsx";
import OwnerESRPage from "./owner/OwnerESRPage.jsx";

import "./owner/OwnerUI.css";
import "./mango.css";

console.log("OWNER ESR ENTRY LOADED!");

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <OwnerProvider>
      <OwnerESRPage />
    </OwnerProvider>
  </React.StrictMode>
);