

// src/main_owner_hormones.jsx

import React from "react";
import ReactDOM from "react-dom/client";

import { OwnerProvider } from "./owner/OwnerContext.jsx";
import OwnerHormonesPage from "./owner/OwnerHormones.jsx";

import "./owner/OwnerUI.css";
import "./mango.css";

console.log("OWNER HORMONES ENTRY LOADED!");

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <OwnerProvider>
      <OwnerHormonesPage />
    </OwnerProvider>
  </React.StrictMode>
);