

import React from "react";
import ReactDOM from "react-dom/client";

import { OwnerProvider } from "./owner/OwnerContext.jsx";
import OwnerBloodGroupPage from "./owner/OwnerBloodGroup.jsx";

import "./owner/OwnerUI.css";
import "./mango.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <OwnerProvider>
      <OwnerBloodGroupPage />
    </OwnerProvider>
  </React.StrictMode>
);