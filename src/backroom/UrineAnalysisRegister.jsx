
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

export default function UrineAnalysisRegister() {
  const [entries, setEntries] = useState([]);
  const [saving, setSaving] = useState(false);

  // Filters
  const [regSearch, setRegSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sourceFilter, setSourceFilter] = useState("All");

  // Valid tests (cotinine removed)
  const testsForRegister =
    routing.UrineAnalysisRegister || [
      "URINE ANALYSIS, ROUTINE",
      "URINE FOR ALBUMIN",
      "URINE FOR SUGAR",
      "URINE FOR BILE SALTS",
      "URINE FOR BILE PIGMENTS",
      "URINE FOR KETONE BODIES",
      "PREGNANCY TEST, URINE",
    ];

  const normalize = (s) =>
    (s || "").toLowerCase().replace(/[\s,_-]+/g, "").trim();

  // Parameter columns (cotinine removed)
  const parameterFields = [
    { key: "albumin", label: "Albumin", match: "albumin" },
    { key: "sugar", label: "Sugar", match: "sugar" },
    { key: "bileSalts", label: "Bile Salts", match: "bilesalts" },
    { key: "bilePigments", label: "Bile Pigments", match: "bilepigments" },
    { key: "ketoneBodies", label: "Ketone Bodies", match: "ketonebodies" },
    { key: "pregnancy", label: "Pregnancy Test", match: "pregnancy" },
  ];

  // Extra fields for routine test
  const routineExtraFields = [
    { key: "sg", label: "SG" },
    { key: "ph", label: "pH" },
    { key: "color", label: "Color" },
    { key: "appearance", label: "Appearance" },
    { key: "rbc", label: "RBC" },
    { key: "pus", label: "Pus Cells" },
    { key: "epithelium", label: "Epithelium" },
  ];

  const normalizeSource = (raw) => {
    if (!raw) return "Unknown";
    const s = raw.trim().toLowerCase();
    if (s.includes("opd")) return "OPD";
    if (s.includes("ipd")) return "IPD";
    if (s.includes("third") || s.includes("3rd")) return "Third Floor";
    return "Unknown";
  };

  const parseDate = (entry) => {
    const fields = [entry.timePrinted, entry.savedTime, entry.scannedTime];
    for (const f of fields) {
      if (!f) continue;

      // Firestore timestamp
      if (typeof f === "object" && typeof f.toDate === "function")
        return f.toDate();

      // String date
      if (typeof f === "string") {
        const d = new Date(f);
        if (!isNaN(d)) return d;
      }

      // Unix seconds
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

  // Fetch master register + merge urine register
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "master_register"), async (snapshot) => {
      const all = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

      const filtered = all.filter((entry) => {
        const selected = entry.selectedTests;
        if (!Array.isArray(selected)) return false;

        return selected.some((testObj) => {
          const testName = typeof testObj === "string" ? testObj : testObj?.test || "";
          return testsForRegister.some((ref) =>
            normalize(testName).includes(normalize(ref))
          );
        });
      });

      const merged = await Promise.all(
        filtered.map(async (entry) => {
          const ref = doc(db, "urine_analysis_register", String(entry.regNo));
          const snap = await getDoc(ref);

          const timePrinted =
            entry.timePrinted?.toDate?.()
              ? entry.timePrinted.toDate().toISOString()
              : entry.timePrinted || null;

          const base = {
            ...entry,
            source: normalizeSource(entry.source || entry.category),
            results: {
              albumin: "",
              sugar: "",
              bileSalts: "",
              bilePigments: "",
              ketoneBodies: "",
              pregnancy: "",
              sg: "",
              ph: "",
              color: "",
              appearance: "",
              rbc: "",
              pus: "",
              epithelium: "",
            },
            scanned: "No",
            status: "pending",
            timePrinted,
          };

          return snap.exists()
            ? { ...base, ...snap.data() }
            : base;
        })
      );

      setEntries(merged);
    });

    return () => unsubscribe();
  }, []);

  const handleChange = (index, key, val) => {
    const updated = [...entries];
    updated[index].results[key] = val;
    setEntries(updated);
  };

  const handleScan = (index, value) => {
    const updated = entries.map((row, i) => {
      if (i === index) {
        return {
          ...row,
          scanned: value,
          status: value === "Yes" ? "scanned" : "pending",
          scannedTime: value === "Yes" ? new Date().toISOString() : null,
        };
      }
      if (row.status === "saved") return row;
      return { ...row, scanned: "No", status: "pending" };
    });

    setEntries(updated);
  };

  const hasTest = (entry, matchText) => {
    const selected = entry.selectedTests || [];
    return selected.some((t) => {
      const name = typeof t === "string" ? t : t?.test || "";
      return normalize(name).includes(normalize(matchText));
    });
  };

  const hasRoutineTest = (entry) => hasTest(entry, "urineanalysisroutine");

  const handleSave = async (entry) => {
    try {
      setSaving(true);

      const reg = String(entry.regNo);
      const ref = doc(db, "urine_analysis_register", reg);

      await setDoc(
        ref,
        {
          ...entry,
          saved: "Yes",
          status: "saved",
          savedTime: serverTimestamp(),
        },
        { merge: true }
      );

      setEntries((prev) =>
        prev.map((p) =>
          p.regNo === entry.regNo ? { ...p, status: "saved" } : p
        )
      );
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
      <h3>🧪 Urine Analysis Register</h3>

      {/* Filters */}
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
              className={sourceFilter === src ? "active" : ""}
              onClick={() => setSourceFilter(src)}
            >
              {src}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <table className="backroom-table">
        <thead>
          <tr>
            <th>Reg No</th>
            <th>Name</th>
            <th>Age</th>
            <th>Gender</th>
            <th>Source</th>
            <th>Selected Tests</th>

            {/* Parameter fields */}
            {parameterFields.map((p) => (
              <th key={p.key}>{p.label}</th>
            ))}

            {/* Routine extra fields */}
            {routineExtraFields.map((f) => (
              <th key={f.key}>{f.label}</th>
            ))}

            <th>Scanned</th>
            <th>Save</th>
          </tr>
        </thead>

        <tbody>
          {filteredEntries.map((e, i) => {
            const isSaved = e.status === "saved";
            const isScanned = e.scanned === "Yes";
            const routine = hasRoutineTest(e);

            return (
              <tr
                key={e.regNo}
                className={isSaved ? "row-green" : isScanned ? "row-yellow" : ""}
              >
                <td>{e.regNo}</td>
                <td>{e.name}</td>
                <td>{e.age}</td>
                <td>{e.gender}</td>
                <td>{e.source}</td>
                <td>
                  {(e.selectedTests || [])
                    .map((t) => (typeof t === "object" ? t.test : t))
                    .join(", ")}
                </td>

                {/* Parameter Columns */}
                {parameterFields.map((p) => {
                  const showField =
                    p.key === "pregnancy"
                      ? hasTest(e, p.match) // only if pregnancy test selected
                      : routine || hasTest(e, p.match); // routine OR specific test

                  if (!showField) return <td key={p.key}>-</td>;

                  if (p.key === "pregnancy") {
                    return (
                      <td key={p.key}>
                        <select
                          value={e.results[p.key] || ""}
                          disabled={!isScanned || isSaved}
                          onChange={(ev) =>
                            handleChange(i, p.key, ev.target.value)
                          }
                        >
                          <option value="">Select</option>
                          <option value="Negative">Negative</option>
                          <option value="Positive">Positive</option>
                        </select>
                      </td>
                    );
                  }

                  return (
                    <td key={p.key}>
                      <input
                        type="text"
                        value={e.results[p.key] || ""}
                        disabled={!isScanned || isSaved}
                        onChange={(ev) =>
                          handleChange(i, p.key, ev.target.value)
                        }
                        placeholder={p.label}
                      />
                    </td>
                  );
                })}

                {/* Routine Only Extra Fields */}
                {routineExtraFields.map((f) => (
                  <td key={f.key}>
                    {routine ? (
                      <input
                        type="text"
                        value={e.results[f.key] || ""}
                        disabled={!isScanned || isSaved}
                        onChange={(ev) =>
                          handleChange(i, f.key, ev.target.value)
                        }
                        placeholder={f.label}
                      />
                    ) : (
                      "-"
                    )}
                  </td>
                ))}

                {/* Scan Column */}
                <td>
                  <select
                    value={e.scanned}
                    disabled={isSaved}
                    onChange={(ev) => handleScan(i, ev.target.value)}
                  >
                    <option value="No">No</option>
                    <option value="Yes">Yes</option>
                  </select>
                </td>

                {/* Save */}
                <td>
                  <button
                    className="save-btn"
                    disabled={isSaved || saving}
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
  );
}