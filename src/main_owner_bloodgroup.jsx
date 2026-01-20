

import React from "react";
import ReactDOM from "react-dom/client";
import OwnerBloodGroup from "./owner/OwnerBloodGroup.jsx";
import { OwnerProvider } from "./owner/OwnerContext.jsx";
import "./owner/OwnerUI.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <OwnerProvider>
      <OwnerBloodGroup />
    </OwnerProvider>
  </React.StrictMode>
);