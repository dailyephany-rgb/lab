

import React, { useState, useEffect } from "react";
import { db } from "../firebaseConfig";
import {
  collection,
  onSnapshot,
  setDoc,
  doc,
  getDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import routing from "../backroom_routing.json";
import "./Backroom.css";

// 🌟 ADDED: Specific styles to force the scrollbar
const overflowStyles = `
  .table-scroll-container {
    width: 100%;
    overflow-x: auto; /* This enables the horizontal scroll */
    overflow-y: hidden;
    display: block;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    background: white;
  }

  .backroom-table {
    width: 100%;
    min-width: 1200px; /* This forces the table to be wide enough to require scrolling */
    border-collapse: collapse;
  }
`;

export default function RapidCardRegister() {
  const [entries, setEntries] = useState([]);
  const [saving, setSaving] = useState(false);

  const [regSearch, setRegSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sourceFilter, setSourceFilter] = useState("All");

  const [localScans, setLocalScans] = useState({});
  const [localScanTimes, setLocalScanTimes] = useState({});
  const [savedSet, setSavedSet] = useState(new Set());

  const testsForRegister =
    routing.RapidCardRegister || [
      "MALARIA ANTIGEN DETECTION CARD , BLOOD",
      "DENGUE IGG , IGM & NS 1 ANTIGEN",
      "TYPHOID IGG , IGM",
      "CHIKUNGUNIA IGM",
    ];

  const normalize = (s = "") =>
    s.toLowerCase().replace(/[\s,._-]+/g, " ").trim();

  const getRapidSelectedTests = (selectedTests = []) => {
    return selectedTests.filter((testObj) => {
      const name = typeof testObj === "string" ? testObj : testObj?.test || "";
      const n = normalize(name);
      return testsForRegister.some((ref) =>
        normalize(ref).includes(n) || n.includes(normalize(ref))
      );
    });
  };

  const rapidTests = [
    { field: "malaria", label: "Malaria Antigen", match: "malaria antigen" },
    { field: "dengue", label: "Dengue IGG/IGM/NS1", match: "dengue" },
    { field: "typhoid", label: "Typhoid IGG/IGM", match: "typhoid" },
    { field: "chikungunya", label: "Chikungunya IgM", match: "chikungunia" },
  ];

  const normalizeSource = (raw) => {
    if (!raw) return "Unknown";
    const s = raw.toLowerCase();
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
      if (typeof f === "object" && f?.toDate) return f.toDate();
      if (typeof f === "string") {
        const d = new Date(f);
        if (!isNaN(d)) return d;
      }
      if (f?.seconds) return new Date(f.seconds * 1000);
    }
    return null;
  };

  useEffect(() => {
    const t = new Date().toISOString().slice(0, 10);
    setDateFrom(t);
    setDateTo(t);
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "rapid_card_register"), (snap) => {
      const s = new Set();
      snap.docs.forEach((d) => {
        const data = d.data();
        if (data?.saved === "Yes" || data?.status === "saved") {
          s.add(String(data.regNo || d.id));
        }
      });
      setSavedSet(s);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "master_register"), async (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const filtered = all.filter((entry) => {
        const rapidOnly = getRapidSelectedTests(entry.selectedTests || []);
        return rapidOnly.length > 0;
      });

      const merged = await Promise.all(
        filtered.map(async (entry) => {
          const regNo = String(entry.regNo || entry.id);
          const ref = doc(db, "rapid_card_register", regNo);
          const snap2 = await getDoc(ref);
          const saved = snap2.exists() ? snap2.data() : {};

          const timePrinted = entry.timePrinted || null;
          const timeCollected = entry.timeCollected || null;
          const localScan = localScans[regNo];

          return {
            ...entry,
            ...saved,
            regNo,
            source: normalizeSource(entry.source || entry.category),
            timePrinted: saved.timePrinted || timePrinted,
            timeCollected: saved.timeCollected || timeCollected,
            results: saved.results || {
              malaria: "Pending",
              dengue: "Pending",
              typhoid: "Pending",
              chikungunya: "Pending",
            },
            scanned: localScan ?? saved.scanned ?? "No",
            scannedTime: saved.scannedTime || null,
            status:
              saved.saved === "Yes"
                ? "saved"
                : localScan === "Yes"
                ? "scanned"
                : saved.status || "pending",
          };
        })
      );

      setEntries(merged);
    });

    return () => unsub();
  }, [localScans]);

  const mapSelectedTestsToResultKeys = (entry) => {
    const keys = new Set();
    const rapidOnly = getRapidSelectedTests(entry.selectedTests || []);
    rapidOnly.forEach((t) => {
      const name = typeof t === "string" ? t : t?.test || "";
      const n = normalize(name);
      rapidTests.forEach((r) => {
        if (n.includes(normalize(r.match))) keys.add(r.field);
      });
    });
    return [...keys];
  };

  const areRequiredFieldsFilled = (entry) =>
    mapSelectedTestsToResultKeys(entry).every(
      (k) => entry.results?.[k] && entry.results[k] !== "Pending"
    );

  const handleChange = (regNo, field, value) => {
    setEntries((prev) =>
      prev.map((e) =>
        e.regNo === regNo
          ? { ...e, results: { ...e.results, [field]: value } }
          : e
      )
    );
  };

  const handleScan = (regNo, value) => {
    const scanTime = value === "Yes" ? new Date() : null;
    setLocalScans((prev) => ({ ...prev, [regNo]: value }));
    setLocalScanTimes((prev) => ({ ...prev, [regNo]: scanTime }));

    setEntries((prev) =>
      prev.map((e) =>
        e.regNo === regNo
          ? {
              ...e,
              scanned: value,
              status:
                value === "Yes"
                  ? "scanned"
                  : savedSet.has(regNo)
                  ? "saved"
                  : "pending",
            }
          : e
      )
    );
  };

  const handleSave = async (entry) => {
    try {
      setSaving(true);
      const regNo = String(entry.regNo);
      const scanned = entry.scanned === "Yes" || localScans[regNo] === "Yes";

      if (!scanned) {
        alert("Please scan before saving.");
        return;
      }

      if (!areRequiredFieldsFilled(entry)) {
        alert("Please fill required result fields.");
        return;
      }

      const rapidOnlyTests = getRapidSelectedTests(entry.selectedTests || []).map(t => 
        typeof t === "object" ? t.test : t
      );

      const cleanedResults = Object.fromEntries(
        Object.entries(entry.results).filter(
          ([, v]) => v && v !== "Pending"
        )
      );

      const scanTime = localScanTimes[regNo];

      const payload = {
        regNo,
        name: entry.name || "",
        age: entry.age || "",
        gender: entry.gender || "-",
        source: entry.source || "-",
        selectedTests: rapidOnlyTests,
        results: cleanedResults,
        scanned: "Yes",
        scannedTime: scanTime ? Timestamp.fromDate(scanTime) : entry.scannedTime || null,
        saved: "Yes",
        savedTime: serverTimestamp(),
        timePrinted: entry.timePrinted || null,
        timeCollected: entry.timeCollected || null,
        status: "saved",
      };

      await setDoc(doc(db, "rapid_card_register", regNo), payload, {
        merge: true,
      });

      setSavedSet((prev) => new Set(prev).add(regNo));
      alert(`Saved entry for ${entry.name}`);
    } catch (err) {
      console.error(err);
      alert("Error saving entry.");
    } finally {
      setSaving(false);
    }
  };

  const filteredEntries = entries.filter((e) => {
    if (regSearch && !String(e.regNo).toLowerCase().includes(regSearch.toLowerCase()))
      return false;
    if (sourceFilter !== "All" && e.source !== sourceFilter) return false;

    const d = parseDate(e);
    if (d) {
      if (dateFrom && d < new Date(dateFrom + "T00:00:00")) return false;
      if (dateTo && d > new Date(dateTo + "T23:59:59")) return false;
    }
    return true;
  });

  return (
    <div className="register-section">
      <style>{overflowStyles}</style>
      <h3>💉 Rapid Card Register</h3>
      
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

      {filteredEntries.length === 0 ? (
        <p>No entries found.</p>
      ) : (
        <div className="table-scroll-container">
          <table className="backroom-table">
            <thead>
              <tr>
                <th>Reg No</th>
                <th>Name</th>
                <th>Age</th>
                <th>Gender</th>
                <th>Source</th>
                <th>Selected Tests</th>
                {rapidTests.map((t) => (<th key={t.field}>{t.label}</th>))}
                <th>Scanned</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map((e) => {
                const regNo = e.regNo;
                const saved = savedSet.has(regNo) || e.status === "saved";
                const scanned = localScans[regNo] === "Yes" || e.scanned === "Yes";

                return (
                  <tr key={regNo} className={saved ? "row-green" : scanned ? "row-yellow" : "row-normal"}>
                    <td>{e.regNo}</td>
                    <td>{e.name}</td>
                    <td>{e.age}</td>
                    <td>{e.gender}</td>
                    <td>{e.source}</td>
                    <td>
                      {getRapidSelectedTests(e.selectedTests || [])
                        .map((t) => (typeof t === "object" ? t.test : t))
                        .join(", ") || "—"}
                    </td>
                    {rapidTests.map((t) => {
                      const selected = mapSelectedTestsToResultKeys(e).includes(t.field);
                      return (
                        <td key={t.field}>
                          {selected ? (
                            <select
                              value={e.results[t.field] || "Pending"}
                              disabled={!scanned || saved}
                              onChange={(ev) => handleChange(regNo, t.field, ev.target.value)}
                            >
                              <option>Pending</option>
                              <option>Positive</option>
                              <option>Negative</option>
                            </select>
                          ) : ("—")}
                        </td>
                      );
                    })}
                    <td>
                      <select value={scanned ? "Yes" : "No"} disabled={saved} onChange={(ev) => handleScan(regNo, ev.target.value)}>
                        <option value="No">No</option>
                        <option value="Yes">Yes</option>
                      </select>
                    </td>
                    <td>
                      {/* UPDATED: Added save-btn class */}
                      <button 
                        className="save-btn" 
                        disabled={saving || saved || !scanned || !areRequiredFieldsFilled(e)} 
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
      )}
    </div>
  );
}
