

import React, { useState, useEffect } from "react";
import { db } from "../firebaseConfig";
import {
  collection,
  onSnapshot,
  setDoc,
  getDoc,
  doc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import routing from "../backroom_routing.json";
import "./Backroom.css";

// CSS to prevent table overflow and allow horizontal scrolling
const tableFixStyles = `
.table-scroll-container {
  width: 100%;
  overflow-x: auto;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: white;
}
.backroom-table {
  width: 100%;
  min-width: 1100px;
  border-collapse: collapse;
}
`;

export default function SerologyRegister() {
  const [entries, setEntries] = useState([]);
  const [saving, setSaving] = useState(false);

  const [regSearch, setRegSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sourceFilter, setSourceFilter] = useState("All");

  const [localScans, setLocalScans] = useState({});
  const [localScanTimes, setLocalScanTimes] = useState({}); // Stores time of scan
  const [savedSet, setSavedSet] = useState(new Set());

  const testsForRegister = routing.SerologyRegister || [
    "HBSAG",
    "HCV (SERUM)",
    "VDRL (SERUM)",
    "WIDAL TEST (SERUM) "
  ];

  const normalize = (s = "") =>
    s.toLowerCase().replace(/[\s,._()-]+/g, "").trim();

  const getSerologySelectedTests = (selectedTests = []) => {
    return selectedTests.filter((testObj) => {
      const name = typeof testObj === "string" ? testObj : testObj?.test || "";
      const n = normalize(name);
      return testsForRegister.some((ref) =>
        normalize(ref).includes(n) || n.includes(normalize(ref))
      );
    });
  };

  const normalizeSource = (raw) => {
    if (!raw) return "Unknown";
    const s = raw.toLowerCase();
    if (s.includes("opd")) return "OPD";
    if (s.includes("ipd")) return "IPD";
    if (s.includes("third") || s.includes("3rd")) return "Third Floor";
    return "Unknown";
  };

  const parseDate = (entry) => {
    const fields = [entry.timePrinted, entry.timeCollected, entry.scannedTime, entry.savedTime, entry.createdAt];
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
    const today = new Date().toISOString().slice(0, 10);
    setDateFrom(today);
    setDateTo(today);
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "serology_register"), (snap) => {
      const s = new Set();
      snap.docs.forEach((d) => {
        const data = d.data();
        if (data?.saved === "Yes" || data?.status === "saved") {
          s.add(String(d.id));
        }
      });
      setSavedSet(s);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "master_register"), async (snapshot) => {
      const all = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      const filtered = all.filter((entry) => getSerologySelectedTests(entry.selectedTests || []).length > 0);

      const merged = await Promise.all(
        filtered.map(async (entry) => {
          const regNo = String(entry.regNo || entry.id);
          const ref = doc(db, "serology_register", regNo);
          const snap = await getDoc(ref);
          const saved = snap.exists() ? snap.data() : {};
          const localScan = localScans[regNo];

          return {
            ...entry,
            ...saved,
            regNo,
            source: normalizeSource(entry.source || entry.category),
            results: saved.results || { hbsag: "-", hcv: "-", vdrl: "-", widal: "-" },
            scanned: localScan ?? saved.scanned ?? "No",
            scannedTime: saved.scannedTime || null, 
            status: saved.saved === "Yes" ? "saved" : localScan === "Yes" ? "scanned" : saved.status || "pending",
          };
        })
      );
      setEntries(merged);
    });
    return () => unsub();
  }, [localScans]);

  const hasTest = (entry, searchKey) => {
    const selected = getSerologySelectedTests(entry.selectedTests || []);
    return selected.some((t) => {
      const name = typeof t === "object" ? t.test : t;
      return normalize(name).includes(normalize(searchKey));
    });
  };

  const requiredKeys = (entry) => {
    const keys = new Set();
    const selected = getSerologySelectedTests(entry.selectedTests || []);
    selected.forEach((t) => {
      const n = normalize(typeof t === "object" ? t.test : t);
      if (n.includes("hbsag")) keys.add("hbsag");
      if (n.includes("hcv")) keys.add("hcv");
      if (n.includes("vdrl")) keys.add("vdrl"); 
      if (n.includes("widal")) keys.add("widal");
    });
    return [...keys];
  };

  const areRequiredFieldsFilled = (entry) => {
    return requiredKeys(entry).every((k) => entry.results?.[k] && entry.results[k] !== "-" && entry.results[k] !== "Pending");
  };

  const handleChange = (regNo, field, value) => {
    setEntries((prev) => prev.map((e) => e.regNo === regNo ? { ...e, results: { ...e.results, [field]: value } } : e));
  };

  const handleScan = (regNo, value) => {
    const scanTime = value === "Yes" ? new Date() : null;
    setLocalScans((prev) => ({ ...prev, [regNo]: value }));
    setLocalScanTimes((prev) => ({ ...prev, [regNo]: scanTime }));
    
    // Also update current entries state to keep the scannedTime consistent internally
    setEntries((prev) => 
      prev.map((e) => 
        e.regNo === regNo ? { ...e, scanned: value, scannedTime: scanTime } : e
      )
    );
  };

  const handleSave = async (entry) => {
    try {
      setSaving(true);
      const regNo = entry.regNo;
      // Get the time from state where we stored it during handleScan
      const scanTime = localScanTimes[regNo] || (entry.scannedTime ? (entry.scannedTime.toDate ? entry.scannedTime.toDate() : new Date(entry.scannedTime)) : null);

      if ((entry.scanned !== "Yes" && localScans[regNo] !== "Yes")) {
        alert("Please scan before saving.");
        return;
      }
      if (!areRequiredFieldsFilled(entry)) {
        alert("Please fill all required serology result fields.");
        return;
      }

      const simpleTests = getSerologySelectedTests(entry.selectedTests || []).map(t => 
        typeof t === "object" ? t.test : t
      );

      const payload = {
        ...entry,
        selectedTests: simpleTests, 
        scanned: "Yes",
        scannedTime: scanTime ? Timestamp.fromDate(scanTime) : entry.scannedTime || null, 
        saved: "Yes",
        savedTime: serverTimestamp(),
        status: "saved",
      };

      await setDoc(doc(db, "serology_register", regNo), payload, { merge: true });
      setSavedSet((prev) => new Set(prev).add(regNo));
      alert(`Saved Serology entry for ${entry.name}`);
    } catch (e) {
      console.error(e);
      alert("Error saving Serology entry.");
    } finally {
      setSaving(false);
    }
  };

  const filteredEntries = entries.filter((e) => {
    if (regSearch && !String(e.regNo).toLowerCase().includes(regSearch.toLowerCase())) return false;
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
      <style>{tableFixStyles}</style>
      <h3>🧬 Serology Register</h3>
      
      <div className="filter-bar">
        <input className="reg-search" placeholder="Search Reg No..." value={regSearch} onChange={(e) => setRegSearch(e.target.value)} />
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
              className={sourceFilter === src ? "source-btn active" : "source-btn"} 
              onClick={() => setSourceFilter(src)}
            >
              {src}
            </button>
          ))}
        </div>
      </div>

      {filteredEntries.length === 0 ? (
        <p>No Serology entries found.</p>
      ) : (
        <div className="table-scroll-container">
          <table className="backroom-table">
            <thead>
              <tr>
                <th>Reg No</th>
                <th>Patient Name</th>
                <th>Age</th>
                <th>Gender</th>
                <th>Source</th>
                <th>Selected Tests</th>
                <th>HBsAg</th>
                <th>HCV Serum</th>
                <th>VDRL</th>
                <th>WIDAL</th>
                <th>Scanned</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map((e) => {
                const regNo = e.regNo;
                const saved = savedSet.has(regNo);
                const scanned = localScans[regNo] === "Yes" || e.scanned === "Yes";

                return (
                  <tr key={regNo} className={saved ? "row-green" : scanned ? "row-yellow" : "row-normal"}>
                    <td>{e.regNo}</td>
                    <td>{e.name}</td>
                    <td>{e.age}</td>
                    <td>{e.gender}</td>
                    <td>{e.source}</td>
                    <td>{getSerologySelectedTests(e.selectedTests || []).map(t => (typeof t === "object" ? t.test : t)).join(", ") || "—"}</td>
                    {[
                      { key: "hbsag", label: "hbsag" },
                      { key: "hcv",   label: "hcv" },
                      { key: "vdrl",  label: "vdrl" },
                      { key: "widal", label: "widal" }
                    ].map(({ key, label }) => (
                      <td key={key}>
                        {hasTest(e, label) ? (
                          <select value={e.results[key] || "Pending"} disabled={!scanned || saved} onChange={(ev) => handleChange(regNo, key, ev.target.value)}>
                            <option>Pending</option>
                            <option>Positive</option>
                            <option>Negative</option>
                          </select>
                        ) : ("—")}
                      </td>
                    ))}
                    <td>
                      <select value={scanned ? "Yes" : "No"} disabled={saved} onChange={(ev) => handleScan(regNo, ev.target.value)}>
                        <option value="No">No</option>
                        <option value="Yes">Yes</option>
                      </select>
                    </td>
                    <td>
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
