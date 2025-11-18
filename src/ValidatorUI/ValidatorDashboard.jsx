

import React, { useEffect, useState } from "react";
import "./ValidatorDashboard.css";
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebaseConfig.js";
import ValidatorTable from "./ValidatorTable.jsx";

export default function ValidatorDashboard() {
  const [activeMainTab, setActiveMainTab] = useState("biochem");
  const [activeSubTab, setActiveSubTab] = useState("main");
  const [activeBackroomTab, setActiveBackroomTab] = useState("esr");
  const [activeBloodSubTab, setActiveBloodSubTab] = useState("testing");

  const [collections, setCollections] = useState({});

  // 🔹 Live Firestore listener
  useEffect(() => {
    const unsubscribes = [];

    const collectionNames = [
      "biochemistry_register",
      "hormones_main", // ✅ changed from "hormones_register"
      "biochem_backup",
      "hormones_backup",
      "coagulation_register",
      "haematology_register",
      "esr_register",
      "bloodgroup_testing_register",
      "bloodgroup_retesting_register",
      "serology_register",
      "rapid_card_register",
      "urine_analysis_register",
    ];

    collectionNames.forEach((col) => {
      const unsub = onSnapshot(collection(db, col), (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setCollections((prev) => ({ ...prev, [col]: docs }));
      });
      unsubscribes.push(unsub);
    });

    return () => unsubscribes.forEach((u) => u());
  }, []);

  // ✅ Validation logic (update DB + local UI)
  const handleValidate = async (entry, collectionName) => {
    try {
      const ref = doc(db, collectionName, entry.id);
      await updateDoc(ref, {
        validated: true,
        validatedTime: serverTimestamp(),
        status: "validated",
      });

      // Update locally to show green immediately
      setCollections((prev) => ({
        ...prev,
        [collectionName]: prev[collectionName].map((item) =>
          item.id === entry.id
            ? { ...item, validated: true, status: "validated" }
            : item
        ),
      }));
    } catch (err) {
      console.error("❌ Error during validation:", err);
    }
  };

  // ✅ Helper: choose correct collection
  const getCollectionName = () => {
    if (activeMainTab === "biochem")
      return activeSubTab === "hormones"
        ? "hormones_main" // ✅ changed from "hormones_register"
        : "biochemistry_register";
    if (activeMainTab === "backup")
      return activeSubTab === "hormoneBackup"
        ? "hormones_backup"
        : "biochem_backup";
    if (activeMainTab === "coag") return "coagulation_register";
    if (activeMainTab === "haem") return "haematology_register";
    if (activeMainTab === "backroom") {
      if (activeBackroomTab === "esr") return "esr_register";
      if (activeBackroomTab === "blood")
        return activeBloodSubTab === "retesting"
          ? "bloodgroup_retesting_register"
          : "bloodgroup_testing_register";
      if (activeBackroomTab === "serology") return "serology_register";
      if (activeBackroomTab === "rapid") return "rapid_card_register";
      if (activeBackroomTab === "urine") return "urine_analysis_register";
    }
    return "";
  };

  const activeCollection = getCollectionName();
  const currentData = collections[activeCollection] || [];

  return (
    <div className="validator-dashboard">
      <h2>🧪 Validator Interface</h2>

      {/* === MAIN TABS === */}
      <div className="tab-container">
        {["biochem", "backup", "coag", "haem", "backroom"].map((tab) => (
          <button
            key={tab}
            className={`tab-btn ${activeMainTab === tab ? "active" : ""}`}
            onClick={() => setActiveMainTab(tab)}
          >
            {tab === "biochem"
              ? "Biochemistry"
              : tab === "backup"
              ? "Backup"
              : tab === "coag"
              ? "Coagulation"
              : tab === "haem"
              ? "Haematology"
              : "Backroom"}
          </button>
        ))}
      </div>

      {/* === SUBTABS === */}
      {activeMainTab === "biochem" && (
        <div className="sub-tabs">
          <button
            className={`tab-btn ${activeSubTab === "main" ? "active" : ""}`}
            onClick={() => setActiveSubTab("main")}
          >
            Biochemistry — Main Analyzer
          </button>
          <button
            className={`tab-btn ${activeSubTab === "hormones" ? "active" : ""}`}
            onClick={() => setActiveSubTab("hormones")}
          >
            Hormones — Main Analyzer
          </button>
        </div>
      )}

      {activeMainTab === "backup" && (
        <div className="sub-tabs">
          <button
            className={`tab-btn ${activeSubTab === "bioBackup" ? "active" : ""}`}
            onClick={() => setActiveSubTab("bioBackup")}
          >
            Biochemistry — Backup Analyzer
          </button>
          <button
            className={`tab-btn ${activeSubTab === "hormoneBackup" ? "active" : ""}`}
            onClick={() => setActiveSubTab("hormoneBackup")}
          >
            Hormones — Backup Analyzer
          </button>
        </div>
      )}

      {/* === BACKROOM TABS === */}
      {activeMainTab === "backroom" && (
        <div className="sub-tabs">
          {[
            { id: "esr", label: "ESR Register" },
            { id: "blood", label: "Blood Group & Rh Type" },
            { id: "serology", label: "Serology Register" },
            { id: "rapid", label: "Rapid Card Register" },
            { id: "urine", label: "Urine Analysis Register" },
          ].map((tab) => (
            <button
              key={tab.id}
              className={`tab-btn ${activeBackroomTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveBackroomTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* === BLOODGROUP SUBTABS === */}
      {activeMainTab === "backroom" && activeBackroomTab === "blood" && (
        <div className="sub-tabs inner-sub">
          <button
            className={`tab-btn ${activeBloodSubTab === "testing" ? "active" : ""}`}
            onClick={() => setActiveBloodSubTab("testing")}
          >
            Testing
          </button>
          <button
            className={`tab-btn ${activeBloodSubTab === "retesting" ? "active" : ""}`}
            onClick={() => setActiveBloodSubTab("retesting")}
          >
            Retesting
          </button>
        </div>
      )}

      {/* === TABLE === */}
      <ValidatorTable
        title={getTitle(activeMainTab, activeSubTab, activeBackroomTab)}
        data={currentData}
        onValidate={(entry) => handleValidate(entry, activeCollection)}
      />
    </div>
  );
}

// Helper: Generate section title
function getTitle(main, sub, backroom) {
  if (main === "biochem")
    return sub === "hormones"
      ? "Hormones — Main Analyzer"
      : "Biochemistry — Main Analyzer";
  if (main === "backup")
    return sub === "hormoneBackup"
      ? "Hormones — Backup Analyzer"
      : "Biochemistry — Backup Analyzer";
  if (main === "coag") return "Coagulation Department";
  if (main === "haem") return "Haematology Department";
  if (main === "backroom") {
    if (backroom === "esr") return "ESR Register";
    if (backroom === "blood") return "Blood Group & Rh Type";
    if (backroom === "serology") return "Serology Register";
    if (backroom === "rapid") return "Rapid Card Register";
    if (backroom === "urine") return "Urine Analysis Register";
  }
  return "Validator Table";
}