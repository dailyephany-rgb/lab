

import React, { useState, useEffect } from "react";
import "./BiochemistryMain.css";
import { db } from "../firebaseConfig.js";
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import hormoneRouting from "../hormone_testRouting.json";

export default function HormonesMain() {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);

  // 🔹 LOCAL scan state
  const [localScans, setLocalScans] = useState({});
  const [localScanTimes, setLocalScanTimes] = useState({}); 

  // Filters
  const [regSearch, setRegSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sourceFilter, setSourceFilter] = useState("All");

  const hormoneTests =
    hormoneRouting.MainAnalyzer?.tests || hormoneRouting?.tests || [];

  const normalizeSource = (raw) => {
    if (!raw) return "Unknown";
    const s = raw.trim().toLowerCase();
    if (s.includes("opd")) return "OPD";
    if (s.includes("ipd")) return "IPD";
    if (s.includes("third") || s.includes("3rd")) return "Third Floor";
    return "Unknown";
  };

  const parseDate = (entry) => {
    const fields = [
      entry.timePrinted,
      entry.timeCollected,
      entry.scannedTime,
      entry.savedTime,
      entry.createdAt,
    ];
    for (const f of fields) {
      if (!f) continue;
      if (typeof f === "object" && typeof f.toDate === "function")
        return f.toDate();
      if (typeof f === "string") {
        const d = new Date(f);
        if (!isNaN(d)) return d;
      }
      if (typeof f === "object" && typeof f.seconds === "number")
        return new Date(f.seconds * 1000);
    }
    return null;
  };

  // Default date to today
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    setDateFrom(today);
    setDateTo(today);
  }, []);

  // ---------------- MASTER SNAPSHOT ----------------
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "master_register"),
      async (snapshot) => {
        const allPatients = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));

        const filtered = allPatients.filter(
          (entry) =>
            Array.isArray(entry.selectedTests) &&
            entry.selectedTests.some((t) =>
              hormoneTests.includes(typeof t === "string" ? t : t.test)
            )
        );

        const merged = await Promise.all(
          filtered.map(async (entry) => {
            const regNo =
              entry.regNo ||
              entry.regno ||
              entry.RegNo ||
              entry.Regno ||
              entry.id;

            const docId = String(regNo);
            const ref = doc(db, "hormones_main", docId);
            const snap = await getDoc(ref);

            const timePrinted = entry.timePrinted || null;
            const timeCollected = entry.timeCollected || null;

            const base = {
              ...entry,
              regNo: String(regNo),
              source: normalizeSource(entry.source || entry.category),
              scanned: localScans[docId] ?? "No",
              status: "pending",
              timePrinted,
              timeCollected,
            };

            if (snap.exists()) {
              const saved = snap.data();
              return {
                ...base,
                ...saved,
                scanned: localScans[docId] ?? saved.scanned ?? "No",
                scannedTime: saved.scannedTime || null,
                status:
                  saved.status ||
                  (saved.saved === "Yes" ? "saved" : base.status),
                timePrinted: saved.timePrinted || timePrinted,
                timeCollected: saved.timeCollected || timeCollected,
              };
            }

            return base;
          })
        );

        setPatients(merged);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [localScans, hormoneTests]);

  // ---------------- SCAN (LOCAL ONLY) ----------------
  const handleScan = (id, value) => {
    const patient = patients.find((p) => p.id === id);
    if (!patient) return;

    const regKey = String(patient.regNo || id);

    setLocalScans((prev) => ({ ...prev, [regKey]: value }));

    setLocalScanTimes((prev) => ({
      ...prev,
      [regKey]: value === "Yes" ? new Date() : null,
    }));

    setPatients((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              scanned: value,
              status: value === "Yes" ? "scanned" : "pending",
            }
          : p
      )
    );
  };

  // ---------------- SAVE ----------------
  const handleSave = async (id) => {
    try {
      const patient = patients.find((p) => p.id === id);
      if (!patient) return;

      const regKey = String(patient.regNo || id);
      const ref = doc(db, "hormones_main", regKey);

      const scanTime = localScanTimes[regKey] || null;

      const payload = {
        regNo: regKey,
        name: patient.name || "",
        age: patient.age || "",
        gender: patient.gender || "-",
        source: patient.source || "-",
        category: patient.category || "-",
        // ✅ FIX APPLIED: Filter tests so only relevant hormone tests are saved
        selectedTests: (patient.selectedTests || [])
          .map((t) => (typeof t === "object" && t.test ? t.test : t))
          .filter((testName) => hormoneTests.includes(testName)),

        scanned: "Yes",
        scannedTime: scanTime ? Timestamp.fromDate(scanTime) : null,

        saved: "Yes",
        savedTime: serverTimestamp(),

        timePrinted: patient.timePrinted || null,
        timeCollected: patient.timeCollected || null,

        status: "saved",
      };

      await setDoc(ref, payload, { merge: true });

      setLocalScans((prev) => ({ ...prev, [regKey]: "No" }));
      setLocalScanTimes((prev) => ({ ...prev, [regKey]: null }));

      setPatients((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...payload } : p))
      );

      alert(`Saved Hormone Main entry for ${patient.name}`);
    } catch (error) {
      console.error("Error saving hormone entry:", error);
      alert("Error saving data.");
    }
  };

  if (loading) return <p>Loading Hormones Main data...</p>;

  // Apply filters
  const filteredPatients = patients.filter((p) => {
    if (regSearch.trim()) {
      const key = String(p.regNo || "").toLowerCase();
      if (!key.includes(regSearch.trim().toLowerCase())) return false;
    }
    if (sourceFilter !== "All" && p.source !== sourceFilter) return false;

    const eDate = parseDate(p);
    if (eDate) {
      if (dateFrom && eDate < new Date(dateFrom + "T00:00:00")) return false;
      if (dateTo && eDate > new Date(dateTo + "T23:59:59")) return false;
    }
    return true;
  });

  return (
    <div className="biochem-register-container">
      <h2 className="dept-header">Hormones Department — Main Analyzer</h2>

      <div className="filter-bar">
        <input
          className="reg-search"
          placeholder="Search Reg No..."
          value={regSearch}
          onChange={(e) => setRegSearch(e.target.value)}
        />

        <div className="date-filters">
          <label>Date:</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(today)} 
          />
          <span>to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>

        <div className="source-buttons">
          {["OPD", "IPD", "Third Floor", "All"].map((src) => (
            <button
              key={src}
              className={`source-btn ${sourceFilter === src ? "active" : ""}`}
              onClick={() => setSourceFilter(src)}
            >
              {src}
            </button>
          ))}
        </div>
      </div>

      <div className="table-wrapper">
        <table className="dept-table">
          <thead>
            <tr>
              <th>Reg No</th>
              <th>Patient Name</th>
              <th>Age</th>
              <th>Gender</th>
              <th>Source</th>
              <th>Category</th>
              <th>Selected Tests</th>
              <th>Scanned</th>
              <th>Action</th>
            </tr>
          </thead>

          <tbody>
            {filteredPatients.map((p) => (
              <tr
                key={p.id}
                className={
                  p.status === "saved" || p.saved === "Yes"
                    ? "row-green"
                    : p.status === "scanned" || p.scanned === "Yes"
                    ? "row-yellow"
                    : "row-normal"
                }
              >
                <td>{p.regNo || "—"}</td>
                <td>{p.name || "—"}</td>
                <td>{p.age || "—"}</td>
                <td>{p.gender || "-"}</td>
                <td>{p.source || "—"}</td>
                <td>{p.category || "—"}</td>

                <td>
                  {p.selectedTests
                    ?.filter((t) =>
                      hormoneTests.includes(
                        typeof t === "string" ? t : t.test
                      )
                    )
                    .map((t) => (typeof t === "string" ? t : t.test))
                    .join(", ") || "—"}
                </td>

                <td>
                  <select
                    value={p.scanned || "No"}
                    onChange={(e) => handleScan(p.id, e.target.value)}
                    disabled={p.status === "saved" || p.saved === "Yes"}
                  >
                    <option value="No">No</option>
                    <option value="Yes">Yes</option>
                  </select>
                </td>

                <td>
                  <button
                    className="save-btn"
                    onClick={() => handleSave(p.id)}
                    disabled={
                      p.status === "saved" ||
                      p.saved === "Yes" ||
                      p.scanned !== "Yes"
                    }
                  >
                    💾 Save
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
