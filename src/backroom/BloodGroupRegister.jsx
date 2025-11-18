

import React, { useState, useEffect, useMemo } from "react"; // Added useMemo
import { db } from "../firebaseConfig";
import {
  collection,
  onSnapshot,
  getDoc,
  setDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import routing from "../backroom_routing.json";
import "./Backroom.css";

export default function BloodGroupRegister() {
  const [testingEntries, setTestingEntries] = useState([]);
  const [retestingEntries, setRetestingEntries] = useState([]);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("testing");

  const [regSearch, setRegSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sourceFilter, setSourceFilter] = useState("All");

  const [localScans, setLocalScans] = useState({});

  const normalizeSource = (raw) => {
    if (!raw) return "Unknown";
    const s = raw.trim().toLowerCase();
    if (s.includes("opd")) return "OPD";
    if (s.includes("ipd")) return "IPD";
    if (s.includes("third") || s.includes("3rd")) return "Third Floor";
    return "Unknown";
  };

  const parseDate = (entry) => {
    const fields = [entry.timePrinted, entry.savedTime, entry.scannedTime, entry.createdAt];
    for (const f of fields) {
      if (!f) continue;
      if (f?.toDate) return f.toDate();
      if (typeof f === "string") {
        const d = new Date(f);
        if (!isNaN(d)) return d;
      }
      if (f?.seconds) return new Date(f.seconds * 1000);
    }
    return null;
  };

  // Default date selection
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    setDateFrom(today);
    setDateTo(today);
  }, []);

  // MAIN SNAPSHOT MERGE
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "master_register"),
      async (snap) => {
        const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

        const bloodRows = all.filter((entry) => {
          const sel = entry.selectedTests;
          if (!Array.isArray(sel)) return false;
          return sel.some((t) =>
            (typeof t === "string" ? t : t?.test || "")
              .toLowerCase()
              .includes("abo group")
          );
        });

        const merged = await Promise.all(
          bloodRows.map(async (entry) => {
            const reg = String(entry.regNo);

            const [testSnap, retestSnap] = await Promise.all([
              getDoc(doc(db, "bloodgroup_testing_register", reg)),
              getDoc(doc(db, "bloodgroup_retesting_register", reg)),
            ]);

            const timePrinted = entry.timePrinted?.toDate?.() ?? entry.timePrinted ?? null;

            const base = {
              ...entry,
              source: normalizeSource(entry.source || entry.category),
              bloodGroup: "",
              rhFactor: "",
              remarks: "",
              result: "",
              scanned: "No",
              saved: "No",
              status: "pending",
              timePrinted,
            };

            // --- TESTING MERGE ---
            let testingData = { ...base };
            if (testSnap.exists()) {
              const saved = testSnap.data();
              testingData = {
                ...testingData,
                ...saved,
                saved: saved.saved || "No",
                status: saved.status || (saved.saved === "Yes" ? "saved" : "pending"),
              };
            }

            testingData.scanned =
              localScans[`testing_${reg}`] ??
              testingData.scanned ??
              "No";

            testingData.status =
              testingData.saved === "Yes"
                ? "saved"
                : testingData.scanned === "Yes"
                ? "scanned"
                : "pending";

            // --- RETESTING MERGE ---
            let retestingData = { ...base };
            if (retestSnap.exists()) {
              const saved = retestSnap.data();
              retestingData = {
                ...retestingData,
                ...saved,
                saved: saved.saved || "No",
                status: saved.status || (saved.saved === "Yes" ? "saved" : "pending"),
              };
            }

            retestingData.scanned =
              localScans[`retesting_${reg}`] ??
              retestingData.scanned ??
              "No";

            retestingData.status =
              retestingData.saved === "Yes"
                ? "saved"
                : retestingData.scanned === "Yes"
                ? "scanned"
                : "pending";

            return { testingData, retestingData };
          })
        );

        setTestingEntries(merged.map((m) => m.testingData));
        setRetestingEntries(merged.map((m) => m.retestingData));
      }
    );

    return () => unsub();
  }, [localScans]);

  // HANDLE FIELD CHANGES (Updated)
  const handleChange = (tab, regNo, field, value) => {
    const setList = tab === "testing" ? setTestingEntries : setRetestingEntries;

    setList((prevList) => {
      const index = prevList.findIndex((item) => String(item.regNo) === String(regNo));
      if (index === -1) return prevList; 

      const updated = [...prevList];
      const entry = { ...updated[index] }; 

      entry[field] = value;

      if (field === "bloodGroup" || field === "rhFactor") {
        const bg = entry.bloodGroup;
        const rh = entry.rhFactor;
        entry.result = bg && rh ? `${bg} ${rh === "Positive" ? "+" : "-"}` : "";
      }

      updated[index] = entry; 
      return updated;
    });
  };

  // FIXED SCANNING LOGIC (Updated)
  const handleScan = (tab, regNo, value) => {
    const setList = tab === "testing" ? setTestingEntries : setRetestingEntries;

    setLocalScans((prev) => ({
      ...prev,
      [`${tab}_${regNo}`]: value,
    }));

    setList((prevList) => {
      const index = prevList.findIndex((item) => String(item.regNo) === String(regNo));
      if (index === -1) return prevList;

      const updated = [...prevList];
      updated[index] = {
        ...updated[index],
        scanned: value,
        status: value === "Yes" ? "scanned" : "pending",
        scannedTime: value === "Yes" ? new Date().toISOString() : null,
      };

      return updated;
    });
  };

  // SAVE ENTRY
  const handleSave = async (tab, entry) => {
    try {
      setSaving(true);

      const reg = String(entry.regNo);
      const collectionName =
        tab === "testing"
          ? "bloodgroup_testing_register"
          : "bloodgroup_retesting_register";

      const ref = doc(db, collectionName, reg);

      const payload = {
        regNo: reg,
        name: entry.name || "",
        age: entry.age || "",
        gender: entry.gender || "-",
        source: entry.source || "-",
        test: "ABO GROUP & RH TYPE",
        bloodGroup: entry.bloodGroup,
        rhFactor: entry.rhFactor,
        result: entry.result,
        remarks: entry.remarks,
        scanned: entry.scanned,
        scannedTime:
          entry.scanned === "Yes"
            ? entry.scannedTime || new Date().toISOString()
            : null,
        type: tab,
        saved: "Yes",
        savedTime: serverTimestamp(),
        timePrinted: entry.timePrinted || null,
        status: "saved",
      };

      await setDoc(ref, payload, { merge: true });

      if (tab === "testing") {
        setTestingEntries((prev) =>
          prev.map((e) => (e.regNo === reg ? { ...e, ...payload } : e))
        );
      } else {
        setRetestingEntries((prev) =>
          prev.map((e) => (e.regNo === reg ? { ...e, ...payload } : e))
        );
      }

      alert(`Saved ${tab} entry for ${entry.name}`);
    } catch (err) {
      console.error("Save error", err);
      alert("Error saving entry");
    } finally {
      setSaving(false);
    }
  };

  const activeEntries =
    activeTab === "testing" ? testingEntries : retestingEntries;

  const bloodGroups = ["A", "B", "AB", "O"];
  const rhFactors = ["Positive", "Negative"];

  const filteredEntries = activeEntries.filter((p) => {
    if (regSearch.trim()) {
      if (!String(p.regNo).toLowerCase().includes(regSearch.toLowerCase()))
        return false;
    }

    if (sourceFilter !== "All" && p.source !== sourceFilter) return false;

    const d = parseDate(p);
    if (d) {
      if (dateFrom && d < new Date(dateFrom + "T00:00:00")) return false;
      if (dateTo && d > new Date(dateTo + "T23:59:59")) return false;
    }

    return true;
  });

  // *** NEW LOGIC ***
  // Find all dates (as strings) that have an entry that is
  // scanned but not yet saved.
  const unsavedScannedDates = useMemo(() => {
    const dates = new Set();
    for (const entry of activeEntries) {
      if (entry.scanned === "Yes" && entry.saved !== "Yes") {
        const d = parseDate(entry);
        if (d) {
          dates.add(d.toDateString());
        }
      }
    }
    return dates;
  }, [activeEntries]); // Re-calculates when activeEntries changes

  return (
    <div className="register-section">
      <h3>🩸 Blood Group & Rh Type Register</h3>

      <div className="tab-container">
        <button
          className={`tab-btn ${activeTab === "testing" ? "active" : ""}`}
          onClick={() => setActiveTab("testing")}
        >
          Testing
        </button>
        <button
          className={`tab-btn ${activeTab === "retesting" ? "active" : ""}`}
          onClick={() => setActiveTab("retesting")}
        >
          Retesting
        </button>
      </div>

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

      {filteredEntries.length === 0 ? (
        <p>No Blood Group entries found.</p>
      ) : (
        <table className="backroom-table">
          <thead>
            <tr>
              <th>Reg No</th>
              <th>Patient Name</th>
              <th>Age</th>
              <th>Gender</th>
              <th>Source</th>
              <th>Test</th>
              <th>Blood Group</th>
              <th>Rh Factor</th>
              <th>Result</th>
              <th>Remarks</th>
              <th>Scanned</th>
              <th>Action</th>
            </tr>
          </thead>

          <tbody>
            {filteredEntries.map((e, i) => {
              // *** NEW LOGIC ***
              // 1. Get the date string for *this* row's entry
              const entryDateStr = parseDate(e)?.toDateString();
              // 2. Check if this row is blocked
              // It's blocked if:
              //    a) Its date is in the unsavedScannedDates list
              //    b) AND it is NOT the entry that is already scanned
              const isBlocked = unsavedScannedDates.has(entryDateStr) && e.scanned !== "Yes";
              
              return (
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
                  <td>ABO GROUP & RH TYPE</td>

                  <td>
                    <select
                      value={e.bloodGroup}
                      disabled={e.saved === "Yes" || e.scanned !== "Yes"}
                      onChange={(ev) =>
                        handleChange(activeTab, e.regNo, "bloodGroup", ev.target.value)
                      }
                    >
                      <option value="">Select</option>
                      {bloodGroups.map((bg) => (
                        <option key={bg} value={bg}>
                          {bg}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td>
                    <select
                      value={e.rhFactor}
                      disabled={e.saved === "Yes" || e.scanned !== "Yes"}
                      onChange={(ev) =>
                        handleChange(activeTab, e.regNo, "rhFactor", ev.target.value)
                      }
                    >
                      <option value="">Select</option>
                      {rhFactors.map((rh) => (
                        <option key={rh} value={rh}>
                          {rh}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td>{e.result}</td>

                  <td>
                    <input
                      value={e.remarks}
                      disabled={e.saved === "Yes" || e.scanned !== "Yes"}
                      onChange={(ev) =>
                        handleChange(activeTab, e.regNo, "remarks", ev.target.value)
                      }
                    />
                  </td>

                  <td>
                    <select
                      value={e.scanned}
                      // *** UPDATED DISABLED LOGIC ***
                      disabled={e.saved === "Yes" || isBlocked}
                      onChange={(ev) => handleScan(activeTab, e.regNo, ev.target.value)}
                    >
                      <option value="No">No</option>
                      <option value="Yes">Yes</option>
                    </select>
                  </td>

                  <td>
                    <button
                      disabled={e.saved === "Yes"}
                      onClick={() => handleSave(activeTab, e)}
                    >
                      Save
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}