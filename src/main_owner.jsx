

// src/owner/main_owner.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { OwnerProvider } from "./owner/OwnerContext.jsx";
import OwnerApp from "./owner/OwnerApp.jsx";
import "./owner/OwnerUI.css";
import "./mango.css";

console.log("OWNER MAIN ENTRY LOADED!");

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <OwnerProvider>
      <OwnerApp />
    </OwnerProvider>
  </React.StrictMode>
);