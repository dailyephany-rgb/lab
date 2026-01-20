
import React from "react";
import ReactDOM from "react-dom/client";

import OwnerBiochem from "./owner/OwnerBiochem.jsx";
import { OwnerProvider } from "./owner/OwnerContext.jsx";

import "./owner/OwnerUI.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <OwnerProvider>
      <OwnerBiochem />
    </OwnerProvider>
  </React.StrictMode>
);