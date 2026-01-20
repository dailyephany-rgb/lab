

import React from "react";
import ReactDOM from "react-dom/client";

import { OwnerProvider } from "./owner/OwnerContext.jsx";
import OwnerRapidPage from "./owner/OwnerRapidPage.jsx";

import "./owner/OwnerUI.css";
import "./mango.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <OwnerProvider>
      <OwnerRapidPage />
    </OwnerProvider>
  </React.StrictMode>
);