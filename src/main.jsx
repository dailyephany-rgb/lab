// src/main.jsx
import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import Mango from "./mango.jsx";
import MasterView_Table from "./master/MasterView_Table.jsx";
import MasterView_Rectangle from "./master_register_2/MasterView_Rectangle.jsx";
import "./mango.css"; // Keep global styling consistent

function App() {
  const [activeView, setActiveView] = useState("mango");

  return (
    <div>
      {/* 🌟 Simple Top Navigation Bar */}
      <nav
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: "20px",
          padding: "15px",
          backgroundColor: "#1e40af",
          color: "white",
          fontWeight: "600",
        }}
      >
        <button
          onClick={() => setActiveView("mango")}
          style={{
            background: activeView === "mango" ? "#2563eb" : "transparent",
            color: "white",
            border: "none",
            cursor: "pointer",
            fontSize: "16px",
          }}
        >
          🧾 Data Entry
        </button>

        <button
          onClick={() => setActiveView("table")}
          style={{
            background: activeView === "table" ? "#2563eb" : "transparent",
            color: "white",
            border: "none",
            cursor: "pointer",
            fontSize: "16px",
          }}
        >
          📊 Master Register (Table)
        </button>

        <button
          onClick={() => setActiveView("rectangle")}
          style={{
            background: activeView === "rectangle" ? "#2563eb" : "transparent",
            color: "white",
            border: "none",
            cursor: "pointer",
            fontSize: "16px",
          }}
        >
          📋 Master Register (Card)
        </button>
      </nav>

      {/* 🔄 Dynamic View Rendering */}
      <div style={{ padding: "20px" }}>
        {activeView === "mango" && <Mango />}
        {activeView === "table" && <MasterView_Table />}
        {activeView === "rectangle" && <MasterView_Rectangle />}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
