


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
} from "firebase/firestore";
import hormoneRouting from "../hormone_testRouting.json";

export default function HormonesMain() {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);

  // ✅ Filters
  const [regSearch, setRegSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sourceFilter, setSourceFilter] = useState("All");

  const hormoneTests =
    hormoneRouting.MainAnalyzer?.tests || hormoneRouting?.tests || [];

  // Normalize source names
  const normalizeSource = (raw) => {
    if (!raw) return "Unknown";
    const s = raw.trim().toLowerCase();
    if (s.includes("opd")) return "OPD";
    if (s.includes("ipd")) return "IPD";
    if (s.includes("third") || s.includes("3rd")) return "Third Floor";
    return "Unknown";
  };

  // ✅ Updated to include timePrinted
  const parseDate = (entry) => {
    const fields = [entry.timePrinted, entry.savedTime, entry.scannedTime, entry.createdAt];
    for (const f of fields) {
      if (!f) continue;
      if (typeof f === "object" && typeof f.toDate === "function") return f.toDate();
      if (typeof f === "string") {
        const d = new Date(f);
        if (!isNaN(d)) return d;
      }
      if (typeof f === "object" && typeof f.seconds === "number")
        return new Date(f.seconds * 1000);
    }
    return null;
  };

  // Set default date to today
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    setDateFrom(today);
    setDateTo(today);
  }, []);

  // 🔄 Real-time listener for master register with timePrinted
  useEffect(() => {
    console.log("🧬 Listening to Hormones Main Analyzer data...");

    const unsubscribe = onSnapshot(collection(db, "master_register"), async (snapshot) => {
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

          const ref = doc(db, "hormones_main", String(regNo));
          const snap = await getDoc(ref);

          // ✅ Extract timePrinted safely
          const timePrinted =
            entry.timePrinted && entry.timePrinted.toDate
              ? entry.timePrinted.toDate().toISOString()
              : entry.timePrinted || null;

          const baseDefaults = {
            ...entry,
            regNo: String(regNo),
            source: normalizeSource(entry.source || entry.category),
            scanned: "No",
            status: "pending",
            timePrinted, // ✅ Added here
          };

          if (snap.exists()) {
            const savedData = snap.data();
            return {
              ...baseDefaults,
              ...savedData,
              source: savedData.source || baseDefaults.source,
              scanned: savedData.scanned ?? "No",
              scannedTime: savedData.scannedTime || null,
              status: savedData.status || "saved",
              timePrinted: savedData.timePrinted || baseDefaults.timePrinted, // ✅ Keep both
            };
          } else {
            return baseDefaults;
          }
        })
      );

      setPatients(merged);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // 🟡 Handle scan toggle
  const handleScan = async (id, value) => {
    try {
      const updated = patients.map((p) => {
        if (p.id === id) {
          return {
            ...p,
            scanned: value,
            status:
              value === "Yes"
                ? "scanned"
                : p.status === "saved"
                ? "saved"
                : "pending",
            scannedTime: value === "Yes" ? new Date().toISOString() : null,
          };
        }

        if (p.status === "saved" || p.saved === "Yes") return p;
        return { ...p, scanned: "No", status: "pending" };
      });

      setPatients(updated);

      const patient = updated.find((p) => p.id === id);
      if (!patient) return;

      const regNo =
        patient.regNo ||
        patient.regno ||
        patient.RegNo ||
        patient.Regno ||
        patient.id;

      const ref = doc(db, "hormones_main", String(regNo));
      await setDoc(
        ref,
        {
          scanned: patient.scanned,
          status: patient.status,
          scannedTime:
            patient.scanned === "Yes" ? serverTimestamp() : null,
        },
        { merge: true }
      );
    } catch (err) {
      console.error("❌ Error updating scan:", err);
    }
  };

  // 💾 Handle Save — includes timePrinted
  const handleSave = async (id) => {
    try {
      const patient = patients.find((p) => p.id === id);
      if (!patient) return;

      const regNo =
        patient.regNo ||
        patient.regno ||
        patient.RegNo ||
        patient.Regno ||
        patient.id;

      const ref = doc(db, "hormones_main", String(regNo));

      const payload = {
        regNo: String(regNo),
        name: patient.name || "",
        age: patient.age || "",
        gender: patient.gender || "-",
        source: patient.source || "-",
        selectedTests:
          (patient.selectedTests || []).map((t) =>
            typeof t === "object" && t.test ? t.test : t
          ) || [],
        scanned: patient.scanned || "No",
        scannedTime:
          patient.scanned === "Yes"
            ? patient.scannedTime || new Date().toISOString()
            : null,
        saved: "Yes",
        savedTime: serverTimestamp(),
        timePrinted: patient.timePrinted || null, // ✅ Added
        status: "saved",
      };

      await setDoc(ref, payload, { merge: true });

      setPatients((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...payload } : p))
      );

      alert(`✅ Hormone Main entry saved for ${patient.name}`);
    } catch (error) {
      console.error("❌ Error saving hormone entry:", error);
      alert("Error saving hormone entry.");
    }
  };

  if (loading) return <p>Loading Hormones Main data...</p>;

  // ✅ Apply filters
  const filteredPatients = patients.filter((p) => {
    if (regSearch.trim()) {
      const key = String(p.regNo || "").toLowerCase();
      if (!key.includes(regSearch.trim().toLowerCase())) return false;
    }

    if (sourceFilter !== "All" && p.source !== sourceFilter) return false;

    if (dateFrom || dateTo) {
      const eDate = parseDate(p);
      if (eDate) {
        if (dateFrom && eDate < new Date(dateFrom + "T00:00:00")) return false;
        if (dateTo && eDate > new Date(dateTo + "T23:59:59")) return false;
      }
    }
    return true;
  });

  // 🧾 Render table
  return (
    <div className="biochem-register-container">
      <h2 className="dept-header">Hormones Department — Main Analyzer</h2>

      {/* ✅ Filter Bar */}
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
            onChange={(e) => setDateFrom(e.target.value)}
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

      {/* ✅ Table */}
      <div className="table-wrapper">
        <table className="dept-table">
          <thead>
            <tr>
              <th>Reg No</th>
              <th>Patient Name</th>
              <th>Age</th>
              <th>Gender</th>
              <th>Source</th>
              <th>Selected Tests</th>
              {hormoneTests.map((test, idx) => (
                <th key={idx}>{test}</th>
              ))}
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
                <td>
                  {p.selectedTests
                    ?.filter((t) =>
                      hormoneTests.includes(typeof t === "string" ? t : t.test)
                    )
                    .map((t) => (typeof t === "string" ? t : t.test))
                    .join(", ") || "—"}
                </td>

                {hormoneTests.map((test, idx2) => (
                  <td key={idx2}>
                    {p.selectedTests?.some(
                      (t) => (typeof t === "string" ? t : t.test) === test
                    ) ? (
                      <span className="tick">✅</span>
                    ) : (
                      "-"
                    )}
                  </td>
                ))}

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
                    disabled={p.status === "saved" || p.saved === "Yes"}
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