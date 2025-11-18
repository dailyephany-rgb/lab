

import React, { useState } from "react";
import "./Backroom.css";

// Individual register components
import ESRRegister from "./ESRRegister.jsx";
import BloodGroupRegister from "./BloodGroupRegister.jsx";
import SerologyRegister from "./SerologyRegister.jsx";
import RapidCardRegister from "./RapidCardRegister.jsx";
import UrineAnalysisRegister from "./UrineAnalysisRegister.jsx";

export default function BackroomMain() {
  const [activeTab, setActiveTab] = useState("esr");

  const renderActiveTab = () => {
    switch (activeTab) {
      case "esr":
        return <ESRRegister />;
      case "blood":
        return <BloodGroupRegister />;
      case "serology":
        return <SerologyRegister />;
      case "rapid":
        return <RapidCardRegister />;
      case "urine":
        return <UrineAnalysisRegister />;
      default:
        return <ESRRegister />;
    }
  };

  return (
    <div className="backroom-container">
      {/* Header */}
      <div className="header-bar">
        <h2>🧪 Backroom Registers Dashboard</h2>
        <p className="sub-heading">Routine backend testing sections</p>
      </div>

      {/* Tabs */}
      <div className="tab-container">
        <button
          className={`tab-btn ${activeTab === "esr" ? "active" : ""}`}
          onClick={() => setActiveTab("esr")}
        >
          ESR Register
        </button>

        <button
          className={`tab-btn ${activeTab === "blood" ? "active" : ""}`}
          onClick={() => setActiveTab("blood")}
        >
          Blood Group & Rh Type
        </button>

        <button
          className={`tab-btn ${activeTab === "serology" ? "active" : ""}`}
          onClick={() => setActiveTab("serology")}
        >
          Serology Register
        </button>

        <button
          className={`tab-btn ${activeTab === "rapid" ? "active" : ""}`}
          onClick={() => setActiveTab("rapid")}
        >
          Rapid Card Register
        </button>

        <button
          className={`tab-btn ${activeTab === "urine" ? "active" : ""}`}
          onClick={() => setActiveTab("urine")}
        >
          Urine Analysis Register
        </button>
      </div>

      {/* Register Content */}
      <div className="register-content">{renderActiveTab()}</div>
    </div>
  );
}