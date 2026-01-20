

// src/main_owner_serology.jsx
import React from "react";
import ReactDOM from "react-dom/client";

import { OwnerProvider } from "./owner/OwnerContext.jsx";
import OwnerSerologyPage from "./owner/OwnerSerology.jsx";

import "./owner/OwnerUI.css";
import "./mango.css";

console.log("OWNER SEROLOGY ENTRY LOADED!");

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <OwnerProvider>
      <OwnerSerologyPage />
    </OwnerProvider>
  </React.StrictMode>
);