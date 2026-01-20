
// src/main_owner_coag.jsx
import React from "react";
import ReactDOM from "react-dom/client";

import { OwnerProvider } from "./owner/OwnerContext.jsx";
import OwnerCoagPage from "./owner/OwnerCoag.jsx";

import "./owner/OwnerUI.css";
import "./mango.css";

console.log("OWNER COAG ENTRY LOADED!");

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <OwnerProvider>
      <OwnerCoagPage />
    </OwnerProvider>
  </React.StrictMode>
);
