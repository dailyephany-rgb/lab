

import React, { useState, useEffect } from "react";
import "./BiochemistryBackup.css";
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

export default function HormonesBackup() {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [regSearch, setRegSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sourceFilter, setSourceFilter] = useState("All");

  // Local tracking
  const [localScans, setLocalScans] = useState({});
  const [localScanTimes, setLocalScanTimes] = useState({});
  const [savedSet, setSavedSet] = useState(new Set());
  const [saving, setSaving] = useState(false);

  const hormoneTests =
    hormoneRouting.BackupAnalyzer?.tests || hormoneRouting?.tests || [];

  // Default date
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    setDateFrom(today);
    setDateTo(today);
  }, []);

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

  const getRequiredForPatient = (patient) => {
    const selected = (patient.selectedTests || []).map((t) =>
      typeof t === "string" ? t : t?.test || ""
    );
    return selected.filter((t) => hormoneTests.includes(t));
  };

  const areRequiredFieldsFilled = (patient) => {
    const required = getRequiredForPatient(patient);
    if (!required.length) return true;
    return required.every(
      (test) =>
        patient.results?.[test] &&
        String(patient.results[test]).trim() !== ""
    );
  };

  /* =============================
        REAL-TIME LISTENERS
     ============================= */
  useEffect(() => {
    const unsubMaster = onSnapshot(
      collection(db, "master_register"),
      async (snapshot) => {
        const allPatients = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
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

            const regKey = String(regNo);
            const ref = doc(db, "hormones_backup", regKey);
            const snap = await getDoc(ref);

            const timePrinted = entry.timePrinted || null;
            const timeCollected = entry.timeCollected || null;

            const defaultResults = Object.fromEntries(
              hormoneTests.map((t) => [t, ""])
            );

            const base = {
              ...entry,
              id: entry.id,
              regNo: regKey,
              source: normalizeSource(entry.source),
              results: defaultResults,
              scanned: localScans[regKey] ?? "No",
              status: "pending",
              timePrinted,
              timeCollected,
            };

            if (snap.exists()) {
              const data = snap.data();
              return {
                ...base,
                ...data,
                results: { ...base.results, ...(data.results || {}) },
                scanned: localScans[regKey] ?? data.scanned ?? "No",
                scannedTime: data.scannedTime || null,
                status:
                  data.saved === "Yes" || data.status === "saved"
                    ? "saved"
                    : localScans[regKey] === "Yes"
                    ? "scanned"
                    : "pending",
                timePrinted: data.timePrinted || timePrinted,
                timeCollected: data.timeCollected || timeCollected,
              };
            }

            return base;
          })
        );

        const unique = new Map();
        merged.forEach((p) => unique.set(p.regNo, p));

        setPatients(Array.from(unique.values()));
        setLoading(false);
      }
    );

    const unsubBackup = onSnapshot(collection(db, "hormones_backup"), (snap) => {
      const s = new Set();
      snap.docs.forEach((d) => {
        const data = d.data();
        if (data.saved === "Yes" || data.status === "saved") {
          s.add(String(data.regNo || d.id));
        }
      });
      setSavedSet(s);
    });

    return () => {
      unsubMaster();
      unsubBackup();
    };
  }, [localScans, hormoneTests]);

  /* =============================
          INPUT
     ============================= */
  const handleInputChange = (e, id, field) => {
    const val = e.target.value;
    setPatients((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, results: { ...p.results, [field]: val } } : p
      )
    );
  };

  /* =============================
          SCAN — LOCAL ONLY
     ============================= */
  const handleScan = (id, value) => {
    const patient = patients.find((p) => p.id === id);
    if (!patient) return;

    const regKey = patient.regNo;

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
              status:
                value === "Yes"
                  ? "scanned"
                  : p.status === "saved"
                  ? "saved"
                  : "pending",
            }
          : p
      )
    );
  };

  /* =============================
             SAVE
     ============================= */
  const handleSave = async (id) => {
    try {
      setSaving(true);

      const patient = patients.find((p) => p.id === id);
      const regKey = patient.regNo;

      if (patient.scanned !== "Yes" && localScans[regKey] !== "Yes") {
        alert("Please scan before saving.");
        setSaving(false);
        return;
      }

      if (!areRequiredFieldsFilled(patient)) {
        alert("Fill all required test fields.");
        setSaving(false);
        return;
      }

      const scanTime = localScanTimes[regKey];

      // ✅ BUG FIX: Filter cleanedResults to only include tests selected for THIS patient
      const requiredTestsForThisPatient = getRequiredForPatient(patient);
      const cleanedResults = Object.fromEntries(
        requiredTestsForThisPatient.map((t) => [t, patient.results?.[t] || ""])
      );

      const payload = {
        regNo: String(regKey),
        name: patient.name || "",
        age: patient.age || "",
        gender: patient.gender || "-",
        source: patient.source || "-",
        selectedTests: requiredTestsForThisPatient,
        results: cleanedResults,

        scanned: "Yes",
        scannedTime: scanTime ? Timestamp.fromDate(scanTime) : null,

        saved: "Yes",
        savedTime: serverTimestamp(),

        timePrinted: patient.timePrinted || null,
        timeCollected: patient.timeCollected || null,

        status: "saved",
      };

      await setDoc(
        doc(db, "hormones_backup", String(regKey)),
        payload,
        { merge: true }
      );

      setPatients((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...payload } : p))
      );

      setSavedSet((prev) => new Set(prev).add(String(regKey)));

      alert(`Saved Hormones Backup entry for ${patient.name}`);
    } catch (err) {
      console.error("Save error:", err);
    } finally {
      setSaving(false);
    }
  };

  /* =============================
             FILTERS
     ============================= */
  const filteredPatients = patients.filter((p) => {
    if (
      regSearch.trim() &&
      !String(p.regNo).toLowerCase().includes(regSearch.toLowerCase())
    )
      return false;

    if (sourceFilter !== "All" && p.source !== sourceFilter) return false;

    const d = parseDate(p);
    if (dateFrom && d < new Date(dateFrom + "T00:00:00")) return false;
    if (dateTo && d > new Date(dateTo + "T23:59:59")) return false;

    return true;
  });

  if (loading) return <p>Loading Hormones Backup data...</p>;

  return (
    <div className="biochem-register-container">
      <h2 className="dept-header">
        Hormones Department — Backup Analyzer
      </h2>

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
              className={`source-btn ${
                sourceFilter === src ? "active" : ""
              }`}
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
              <th>Selected Tests</th>
              {hormoneTests.map((t, i) => (
                <th key={i}>{t}</th>
              ))}
              <th>Scanned</th>
              <th>Action</th>
            </tr>
          </thead>

          <tbody>
            {filteredPatients.map((p) => {
              const regKey = p.regNo;
              const isSaved =
                savedSet.has(regKey) ||
                p.status === "saved" ||
                p.saved === "Yes";

              const isScanned =
                localScans[regKey] === "Yes" || p.scanned === "Yes";

              const requiredFilled = areRequiredFieldsFilled(p);

              return (
                <tr
                  key={p.id}
                  className={
                    isSaved
                      ? "row-green"
                      : isScanned
                      ? "row-yellow"
                      : "row-normal"
                  }
                >
                  <td>{p.regNo}</td>
                  <td>{p.name}</td>
                  <td>{p.age}</td>
                  <td>{p.gender}</td>
                  <td>{p.source}</td>

                  <td>
                    {(p.selectedTests || [])
                      .filter((t) =>
                        hormoneTests.includes(
                          typeof t === "string" ? t : t.test
                        )
                      )
                      .map((t) =>
                        typeof t === "string" ? t : t.test
                      )
                      .join(", ")}
                  </td>

                  {hormoneTests.map((test, i) => (
                    <td key={i}>
                      {p.selectedTests?.some(
                        (t) =>
                          (typeof t === "string"
                            ? t
                            : t.test) === test
                      ) ? (
                        <input
                          type="text"
                          value={p.results?.[test] || ""}
                          onChange={(e) =>
                            handleInputChange(e, p.id, test)
                          }
                          disabled={isSaved || !isScanned}
                          className="editable-cell"
                        />
                      ) : (
                        "-"
                      )}
                    </td>
                  ))}

                  <td>
                    <select
                      value={isScanned ? "Yes" : "No"}
                      disabled={isSaved}
                      onChange={(e) =>
                        handleScan(p.id, e.target.value)
                      }
                    >
                      <option value="No">No</option>
                      <option value="Yes">Yes</option>
                    </select>
                  </td>

                  <td>
                    <button
                      className="save-btn"
                      disabled={
                        saving ||
                        isSaved ||
                        !isScanned ||
                        !requiredFilled
                      }
                      onClick={() => handleSave(p.id)}
                    >
                      💾 Save
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
