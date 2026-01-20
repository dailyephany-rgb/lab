


import React, { useState, useEffect } from "react";
import { db } from "../firebaseConfig";
import {
  collection,
  onSnapshot,
  getDoc,
  setDoc,
  doc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import "./Backroom.css";

export default function BloodGroupRegister() {
  const [testingEntries, setTestingEntries] = useState([]);
  const [retestingEntries, setRetestingEntries] = useState([]);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("testing");

  // 🔹 FILTER STATES
  const [regSearch, setRegSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sourceFilter, setSourceFilter] = useState("All");

  const [localScans, setLocalScans] = useState({});
  const [localScanTimes, setLocalScanTimes] = useState({});

  const normalizeSource = (raw) => {
    if (!raw) return "Unknown";
    const s = raw.trim().toLowerCase();
    if (s.includes("opd")) return "OPD";
    if (s.includes("ipd")) return "IPD";
    if (s.includes("third") || s.includes("3rd")) return "Third Floor";
    return "Unknown";
  };

  const parseDate = (entry) => {
    const f = entry.timePrinted;
    if (!f) return null;
    
    if (f?.toDate) return f.toDate();
    if (typeof f === "string" || f instanceof Date) {
      const d = new Date(f);
      return isNaN(d) ? null : d;
    }
    if (f?.seconds) return new Date(f.seconds * 1000);
    return null;
  };

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    setDateFrom(today);
    setDateTo(today);
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "master_register"), async (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const bloodRows = all.filter(
        (e) =>
          Array.isArray(e.selectedTests) &&
          e.selectedTests.some((t) =>
            (typeof t === "string" ? t : t?.test || "")
              .toLowerCase()
              .includes("abo group")
          )
      );

      const merged = await Promise.all(
        bloodRows.map(async (entry) => {
          const reg = String(entry.regNo || entry.id);

          const [testSnap, retestSnap] = await Promise.all([
            getDoc(doc(db, "bloodgroup_testing_register", reg)),
            getDoc(doc(db, "bloodgroup_retesting_register", reg)),
          ]);

          const base = {
            ...entry,
            regNo: reg,
            source: normalizeSource(entry.source),
            bloodGroup: "",
            rhFactor: "",
            remarks: "",
            result: "",
            scanned: "No",
            saved: "No",
            status: "pending",
            timePrinted: entry.timePrinted ?? null,
            timeCollected: entry.timeCollected ?? null,
          };

          const build = (snap, tab) => {
            let row = { ...base };
            if (snap.exists()) row = { ...row, ...snap.data() };

            const scanKey = `${tab}_${reg}`;
            row.scanned = localScans[scanKey] ?? row.scanned ?? "No";
            row.status =
              row.saved === "Yes"
                ? "saved"
                : row.scanned === "Yes"
                ? "scanned"
                : "pending";
            return row;
          };

          return {
            testingData: build(testSnap, "testing"),
            retestingData: build(retestSnap, "retesting"),
          };
        })
      );

      setTestingEntries(merged.map((m) => m.testingData));
      setRetestingEntries(merged.map((m) => m.retestingData));
    });

    return () => unsub();
  }, [localScans]);

  const handleChange = (tab, regNo, field, value) => {
    const setter = tab === "testing" ? setTestingEntries : setRetestingEntries;

    setter((prev) =>
      prev.map((e) => {
        if (String(e.regNo) !== String(regNo)) return e;
        const updated = { ...e, [field]: value };
        if (field === "bloodGroup" || field === "rhFactor") {
          updated.result =
            updated.bloodGroup && updated.rhFactor
              ? `${updated.bloodGroup} ${
                  updated.rhFactor === "Positive" ? "+" : "-"
                }`
              : "";
        }
        return updated;
      })
    );
  };

  const handleScan = (tab, regNo, value) => {
    const key = `${tab}_${regNo}`;
    setLocalScans((p) => ({ ...p, [key]: value }));
    if (value === "Yes") {
      setLocalScanTimes((p) => ({ ...p, [key]: new Date() }));
    }
  };

  const handleSave = async (tab, entry) => {
    try {
      setSaving(true);
      const reg = String(entry.regNo);
      const key = `${tab}_${reg}`;

      if (!localScans[key] && entry.scanned !== "Yes") {
        alert("Please scan before saving");
        return;
      }
      if (!entry.bloodGroup || !entry.rhFactor) {
        alert("Fill Blood Group & Rh Factor");
        return;
      }

      const filteredTests = (entry.selectedTests || [])
        .map((t) => (typeof t === "string" ? t : t?.test || ""))
        .filter((testName) => testName.toLowerCase().includes("abo group"));

      const payload = {
        ...entry,
        selectedTests: filteredTests,
        scanned: "Yes",
        scannedTime: Timestamp.fromDate(localScanTimes[key] || new Date()),
        saved: "Yes",
        savedTime: serverTimestamp(),
        timeCollected: entry.timeCollected ?? null,
        status: "saved",
        type: tab,
      };

      const col =
        tab === "testing"
          ? "bloodgroup_testing_register"
          : "bloodgroup_retesting_register";

      await setDoc(doc(db, col, reg), payload, { merge: true });

      const setter = tab === "testing" ? setTestingEntries : setRetestingEntries;
      setter((prev) =>
        prev.map((e) => (String(e.regNo) === reg ? payload : e))
      );

      alert(`Saved ${tab} entry for ${entry.name}`);
    } finally {
      setSaving(false);
    }
  };

  const activeEntries =
    activeTab === "testing" ? testingEntries : retestingEntries;

  const bloodGroups = ["A", "B", "AB", "O"];
  const rhFactors = ["Positive", "Negative"];

  const filteredEntries = activeEntries.filter((p) => {
    if (
      regSearch &&
      !String(p.regNo).toLowerCase().includes(regSearch.toLowerCase())
    )
      return false;

    if (sourceFilter !== "All" && p.source !== sourceFilter) return false;

    const d = parseDate(p);
    if (!d) return false;

    const entryDateStr = d.toISOString().split("T")[0];
    if (dateFrom && entryDateStr < dateFrom) return false;
    if (dateTo && entryDateStr > dateTo) return false;

    return true;
  });

  return (
    <div className="register-section">
      <h3>🩸 Blood Group & Rh Type Register</h3>

      <div className="filter-bar">
        <input
          className="reg-search"
          placeholder="Search Reg No..."
          value={regSearch}
          onChange={(e) => setRegSearch(e.target.value)}
        />

        <div className="date-filters">
          <label>Date (Printed):</label>
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

      <div className="tab-container">
        <button
          /* UPDATED: Added tab-btn class */
          className={`tab-btn ${activeTab === "testing" ? "active" : ""}`}
          onClick={() => setActiveTab("testing")}
        >
          Testing
        </button>
        <button
          /* UPDATED: Added tab-btn class */
          className={`tab-btn ${activeTab === "retesting" ? "active" : ""}`}
          onClick={() => setActiveTab("retesting")}
        >
          Retesting
        </button>
      </div>

      <table className="backroom-table">
        <thead>
          <tr>
            <th>Reg No</th>
            <th>Name</th>
            <th>Age</th>
            <th>Gender</th>
            <th>Source</th>
            <th>Blood Group</th>
            <th>Rh</th>
            <th>Result</th>
            <th>Remarks</th>
            <th>Scanned</th>
            <th>Action</th>
          </tr>
        </thead>

        <tbody>
          {filteredEntries.map((e) => (
            <tr
              key={`${e.regNo}_${activeTab}`}
              className={
                e.saved === "Yes"
                  ? "row-green"
                  : e.scanned === "Yes"
                  ? "row-yellow"
                  : ""
              }
            >
              <td>{e.regNo}</td>
              <td>{e.name}</td>
              <td>{e.age}</td>
              <td>{e.gender}</td>
              <td>{e.source}</td>

              <td>
                <select
                  value={e.bloodGroup}
                  disabled={e.scanned !== "Yes" || e.saved === "Yes"}
                  onChange={(ev) =>
                    handleChange(activeTab, e.regNo, "bloodGroup", ev.target.value)
                  }
                >
                  <option value="">Select</option>
                  {bloodGroups.map((bg) => (
                    <option key={bg}>{bg}</option>
                  ))}
                </select>
              </td>

              <td>
                <select
                  value={e.rhFactor}
                  disabled={e.scanned !== "Yes" || e.saved === "Yes"}
                  onChange={(ev) =>
                    handleChange(activeTab, e.regNo, "rhFactor", ev.target.value)
                  }
                >
                  <option value="">Select</option>
                  {rhFactors.map((rh) => (
                    <option key={rh}>{rh}</option>
                  ))}
                </select>
              </td>

              <td>{e.result}</td>

              <td>
                <input
                  value={e.remarks}
                  disabled={e.scanned !== "Yes" || e.saved === "Yes"}
                  onChange={(ev) =>
                    handleChange(activeTab, e.regNo, "remarks", ev.target.value)
                  }
                />
              </td>

              <td>
                <select
                  value={e.scanned}
                  disabled={e.saved === "Yes"}
                  onChange={(ev) =>
                    handleScan(activeTab, e.regNo, ev.target.value)
                  }
                >
                  <option>No</option>
                  <option>Yes</option>
                </select>
              </td>

              <td>
                <button
                  /* UPDATED: Added save-btn class */
                  className="save-btn"
                  disabled={e.saved === "Yes" || saving}
                  onClick={() => handleSave(activeTab, e)}
                >
                  Save
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
