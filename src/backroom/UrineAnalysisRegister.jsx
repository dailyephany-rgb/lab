


import React, { useState, useEffect } from "react";
import { db } from "../firebaseConfig";
import {
  collection,
  onSnapshot,
  setDoc,
  doc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";
import routing from "../backroom_routing.json";
import "./Backroom.css";

// 🌟 FINAL FIX: Class-based synchronization with Backroom.css
const tableFixStyles = `
.table-container {
  overflow-x: auto; 
  width: 100%;      
}

.backroom-table tbody tr {
  background-color: white; 
}

.sticky-col {
  position: sticky;
  z-index: 2; 
  background-color: white; 
  border-right: 1px solid #e5e7eb;
}

.col-regno { left: 0px; }
.col-name { left: 80px; } 
.col-age { left: 160px; } 
.col-gender { left: 200px; } 
.col-source { left: 250px; } 

.backroom-table thead th.sticky-col {
  z-index: 3;
  background-color: #f8fafc; 
}

/* Scanned State (Yellow) */
.row-yellow, 
.row-yellow td {
  background-color: #fff9c4 !important; 
}
.row-yellow .sticky-col {
  background-color: #fff9c4 !important;
}

/* Saved State (Green) */
.row-green, 
.row-green td {
  background-color: #c8e6c9 !important;
}
.row-green .sticky-col {
  background-color: #c8e6c9 !important;
}
`;

export default function UrineAnalysisRegister() {
  const [entries, setEntries] = useState([]);
  const [saving, setSaving] = useState(false);

  const [regSearch, setRegSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sourceFilter, setSourceFilter] = useState("All");

  const [localScans, setLocalScans] = useState({});
  const [savedSet, setSavedSet] = useState(new Set());

  const testsForRegister =
    routing.UrineAnalysisRegister || [
      "URINE ANALYSIS",
      "URINE FOR ALBUMIN",
      "URINE FOR SUGAR",
      "URINE FOR BILE SALTS",
      "URINE FOR BILE PIGMENTS",
      "URINE FOR KETONE BODIES",
      "PREGNANCY TEST, URINE",
    ];

  const normalize = (s) =>
    (s || "").toLowerCase().replace(/[\s,_-]+/g, "").trim();

  const parameterFields = [
    { key: "albumin", label: "Albumin", match: "albumin" },
    { key: "sugar", label: "Sugar", match: "sugar" },
    { key: "bileSalts", label: "Bile Salts", match: "bilesalts" },
    { key: "bilePigments", label: "Bile Pigments", match: "bilepigments" },
    { key: "ketoneBodies", label: "Ketone Bodies", match: "ketonebodies" },
    { key: "pregnancy", label: "Pregnancy Test", match: "pregnancy" },
  ];

  const routineExtraFields = [
    { key: "sg", label: "SG" },
    { key: "ph", label: "pH" },
    { key: "color", label: "Color" },
    { key: "appearance", label: "Appearance" },
    { key: "rbc", label: "RBC" },
    { key: "pus", label: "Pus Cells" },
    { key: "epithelium", label: "Epithelium" },
  ];

  const dropdownOptions = {
    albumin: ["Nil", "Trace", "1+", "2+", "3+", "4+"],
    sugar: ["Nil", "Trace", "1+", "2+", "3+", "4+"],
    color: ["Pale Yellow", "Yellow", "Deep Yellow"],
    appearance: ["Clear", "Hazy", "Cloudy"],
  };

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
      entry.savedTime,
      entry.scannedTime,
    ];
    for (const f of fields) {
      if (!f) continue;
      if (typeof f === "object" && f?.toDate) return f.toDate();
      if (typeof f === "object" && f?.seconds)
        return new Date(f.seconds * 1000);
    }
    return null;
  };

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    setDateFrom(today);
    setDateTo(today);
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "urine_analysis_register"), (snap) => {
      const s = new Set();
      snap.docs.forEach((d) => {
        if (d.data()?.saved === "Yes") {
          s.add(String(d.data().regNo || d.id));
        }
      });
      setSavedSet(s);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "master_register"), async (snapshot) => {
      const all = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

      const filtered = all.filter((entry) =>
        Array.isArray(entry.selectedTests) &&
        entry.selectedTests.some((t) =>
          testsForRegister.some((ref) =>
            normalize(typeof t === "string" ? t : t?.test).includes(
              normalize(ref)
            )
          )
        )
      );

      const merged = await Promise.all(
        filtered.map(async (entry) => {
          const regNo = String(entry.regNo || entry.id);
          const snap = await getDoc(doc(db, "urine_analysis_register", regNo));

          const base = {
            ...entry,
            regNo,
            source: normalizeSource(entry.source || entry.category),
            timePrinted: entry.timePrinted ?? null,
            timeCollected: entry.timeCollected ?? null,
            results: Object.fromEntries(
              [...parameterFields, ...routineExtraFields].map((f) => [
                f.key,
                "",
              ])
            ),
            scanned: localScans[regNo]?.scanned ?? "No",
            scannedTime: localScans[regNo]?.scannedTime ?? null,
            status: "pending",
          };

          if (snap.exists()) {
            const saved = snap.data();
            return {
              ...base,
              ...saved,
              results: { ...base.results, ...(saved.results || {}) },
            };
          }
          return base;
        })
      );

      setEntries(merged);
    });

    return () => unsub();
  }, [localScans]);

  const hasTest = (entry, matchText) =>
    (entry.selectedTests || []).some((t) =>
      normalize(typeof t === "string" ? t : t?.test).includes(
        normalize(matchText)
      )
    );

  const hasRoutineTest = (entry) => hasTest(entry, "urineanalysis");

  const getUrineSelectedTests = (entry) => {
    return (entry.selectedTests || []).filter((t) => {
      const name = typeof t === "string" ? t : t?.test || "";
      return testsForRegister.some((ref) =>
        normalize(name).includes(normalize(ref))
      );
    });
  };

  const mapSelectedTestsToRequiredKeys = (entry) => {
    const required = new Set();
    const routine = hasRoutineTest(entry);

    if (routine) {
      parameterFields.forEach(
        (p) => p.key !== "pregnancy" && required.add(p.key)
      );
      routineExtraFields.forEach((f) => required.add(f.key));
    } else {
      parameterFields.forEach(
        (p) => hasTest(entry, p.match) && required.add(p.key)
      );
    }
    return [...required];
  };

  const areRequiredFieldsFilled = (e) =>
    mapSelectedTestsToRequiredKeys(e).every(
      (k) => e.results?.[k]?.toString().trim()
    );

  const isReadyToSave = (e) => e.scanned === "Yes" && areRequiredFieldsFilled(e);

  const handleChange = (regNo, field, value) => {
    setEntries((prev) =>
      prev.map((e) =>
        String(e.regNo) === String(regNo)
          ? { ...e, results: { ...e.results, [field]: value } }
          : e
      )
    );
  };

  const handleScan = (regNo, value) => {
    setLocalScans((prev) => ({
      ...prev,
      [regNo]: {
        scanned: value,
        scannedTime: value === "Yes" ? new Date() : null,
      },
    }));
  };

  const handleSave = async (entry) => {
    if (!isReadyToSave(entry)) return;
    setSaving(true);

    const requiredKeys = mapSelectedTestsToRequiredKeys(entry);
    const filteredResults = {};
    requiredKeys.forEach((key) => {
      filteredResults[key] = entry.results[key] || "";
    });

    const filteredTests = getUrineSelectedTests(entry).map((t) => 
      typeof t === "object" ? t.test : t
    );

    try {
      await setDoc(
        doc(db, "urine_analysis_register", entry.regNo),
        {
          ...entry,
          selectedTests: filteredTests, 
          results: filteredResults,
          scanned: "Yes",
          scannedTime: entry.scannedTime,
          saved: "Yes",
          savedTime: serverTimestamp(),
          status: "saved",
        },
        { merge: true }
      );

      setSavedSet((s) => new Set(s).add(entry.regNo));
      alert(`Saved Urine Analysis for ${entry.name}`);
    } catch (err) {
      console.error(err);
      alert("Error saving results.");
    } finally {
      setSaving(false);
    }
  };

  const filteredEntries = entries.filter((e) => {
    if (regSearch && !String(e.regNo).toLowerCase().includes(regSearch.toLowerCase()))
      return false;
    if (sourceFilter !== "All" && e.source !== sourceFilter) return false;
    const d = parseDate(e);
    if (!d) return true;
    if (dateFrom && d < new Date(dateFrom + "T00:00:00")) return false;
    if (dateTo && d > new Date(dateTo + "T23:59:59")) return false;
    return true;
  });

  return (
    <div className="register-section">
      <style>{tableFixStyles}</style>
      <h3>🧪 Urine Analysis Register</h3>
      <div className="filter-bar">
        <input
          className="reg-search"
          placeholder="Search Reg No..."
          value={regSearch}
          onChange={(e) => setRegSearch(e.target.value)}
        />
        <div className="date-filters">
          <label>Date:</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <span>to</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <div className="source-buttons">
          {["OPD", "IPD", "Third Floor", "All"].map((src) => (
            <button
              key={src}
              /* UPDATED: Added source-btn class */
              className={sourceFilter === src ? "source-btn active" : "source-btn"}
              onClick={() => setSourceFilter(src)}
            >
              {src}
            </button>
          ))}
        </div>
      </div>

      <div className="table-container">
        <table className="backroom-table">
          <thead>
            <tr>
              <th className="sticky-col col-regno">Reg No</th>
              <th className="sticky-col col-name">Name</th>
              <th className="sticky-col col-age">Age</th>
              <th className="sticky-col col-gender">Gender</th>
              <th className="sticky-col col-source">Source</th>
              <th>Selected Tests</th>
              {parameterFields.map((p) => (<th key={p.key}>{p.label}</th>))}
              {routineExtraFields.map((f) => (<th key={f.key}>{f.label}</th>))}
              <th>Scanned</th>
              <th>Save</th>
            </tr>
          </thead>
          <tbody>
            {filteredEntries.map((e) => {
              const isSaved = savedSet.has(String(e.regNo));
              const isScanned = e.scanned === "Yes";
              const routine = hasRoutineTest(e);
              
              const rowClass = isSaved ? "row-green" : isScanned ? "row-yellow" : "";

              return (
                <tr key={e.regNo} className={rowClass}>
                  <td className="sticky-col col-regno">{e.regNo}</td>
                  <td className="sticky-col col-name">{e.name}</td>
                  <td className="sticky-col col-age">{e.age}</td>
                  <td className="sticky-col col-gender">{e.gender}</td>
                  <td className="sticky-col col-source">{e.source}</td>
                  <td>
                    {getUrineSelectedTests(e).map((t) => (typeof t === "object" ? t.test : t)).join(", ") || "—"}
                  </td>
                  {parameterFields.map((p) => {
                    const show = p.key === "pregnancy" ? hasTest(e, p.match) : routine || hasTest(e, p.match);
                    if (!show) return <td key={p.key}>-</td>;
                    return (
                      <td key={p.key}>
                        {p.key === "pregnancy" ? (
                          <select
                            value={e.results[p.key] || ""}
                            disabled={!isScanned || isSaved}
                            onChange={(ev) => handleChange(e.regNo, p.key, ev.target.value)}
                          >
                            <option value="">Select</option>
                            <option value="Negative">Negative</option>
                            <option value="Positive">Positive</option>
                          </select>
                        ) : (
                          dropdownOptions[p.key] ? (
                            <select
                              value={e.results[p.key] || ""}
                              disabled={!isScanned || isSaved}
                              onChange={(ev) => handleChange(e.regNo, p.key, ev.target.value)}
                            >
                              <option value="">Select</option>
                              {dropdownOptions[p.key].map((opt) => (<option key={opt} value={opt}>{opt}</option>))}
                            </select>
                          ) : (
                            <input
                              value={e.results[p.key] || ""}
                              disabled={!isScanned || isSaved}
                              onChange={(ev) => handleChange(e.regNo, p.key, ev.target.value)}
                              style={{ textAlign: "center", fontWeight: "bold", padding: "5px 10px", border: "1px solid #ccc", borderRadius: "4px", height: "30px", boxSizing: "border-box" }}
                            />
                          )
                        )}
                      </td>
                    );
                  })}
                  {routineExtraFields.map((f) => (
                    <td key={f.key}>
                      {routine ? (
                        dropdownOptions[f.key] ? (
                          <select
                            value={e.results[f.key] || ""}
                            disabled={!isScanned || isSaved}
                            onChange={(ev) => handleChange(e.regNo, f.key, ev.target.value)}
                          >
                            <option value="">Select</option>
                            {dropdownOptions[f.key].map((opt) => (<option key={opt} value={opt}>{opt}</option>))}
                          </select>
                        ) : (
                          <input
                            value={e.results[f.key] || ""}
                            disabled={!isScanned || isSaved}
                            onChange={(ev) => handleChange(e.regNo, f.key, ev.target.value)}
                            style={{ textAlign: "center", fontWeight: "bold", padding: "5px 10px", border: "1px solid #ccc", borderRadius: "4px", height: "30px", boxSizing: "border-box" }}
                          />
                        )
                      ) : ("-")}
                    </td>
                  ))}
                  <td>
                    <select value={isScanned ? "Yes" : "No"} disabled={isSaved} onChange={(ev) => handleScan(e.regNo, ev.target.value)}>
                      <option>No</option>
                      <option>Yes</option>
                    </select>
                  </td>
                  <td>
                    {/* UPDATED: Added save-btn class */}
                    <button 
                      className="save-btn"
                      disabled={isSaved || saving || !isReadyToSave(e)} 
                      onClick={() => handleSave(e)}
                    >
                      Save
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
