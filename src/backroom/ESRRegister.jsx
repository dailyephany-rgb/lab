

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

export default function ESRRegister() {
  const [entries, setEntries] = useState([]);
  const [saving, setSaving] = useState(false);

  const [regSearch, setRegSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sourceFilter, setSourceFilter] = useState("All");

  const [localScans, setLocalScans] = useState({});

  const testsForRegister =
    routing.ESRRegister || ["ESR (ERYTHROCYTE SEDIMENTATION RATE, BLOOD)"];

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
      entry.savedTime,
      entry.scannedTime,
      entry.createdAt,
    ];
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

  // Default to today
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    setDateFrom(today);
    setDateTo(today);
  }, []);

  // MAIN DATA FETCH
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "master_register"), async (snapshot) => {
      const all = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

      const filtered = all.filter((entry) => {
        const selected = entry.selectedTests;
        if (!Array.isArray(selected)) return false;

        return selected.some((testObj) => {
          const testName =
            typeof testObj === "string"
              ? testObj
              : testObj?.test || "";
          if (!testName) return false;

          return testsForRegister.some((ref) =>
            testName.toLowerCase().includes(ref.toLowerCase())
          );
        });
      });

      const merged = await Promise.all(
        filtered.map(async (entry) => {
          const regNo =
            entry.regNo || entry.regno || entry.RegNo || entry.Regno || entry.id;
          const ref = doc(db, "esr_register", String(regNo));
          const snap = await getDoc(ref);

          const timePrinted =
            entry.timePrinted && entry.timePrinted.toDate
              ? entry.timePrinted.toDate().toISOString()
              : entry.timePrinted || null;

          let saved = {};
          if (snap.exists()) saved = snap.data();

          const localScanValue = localScans[regNo];

          return {
            ...entry,
            ...saved,

            source: normalizeSource(entry.source || entry.category),
            timePrinted: saved.timePrinted || timePrinted,

            scanned:
              localScanValue ??
              saved.scanned ??
              "No",

            scannedTime:
              localScanValue === "Yes"
                ? new Date().toISOString()
                : saved.scannedTime || null,

            status: saved.saved ? "saved" : localScanValue === "Yes" ? "scanned" : "pending",

            startTime: saved.startTime || "",
            endTime: saved.endTime || "",
            duration: saved.duration || "",
            result: saved.result || "",
          };
        })
      );

      setEntries(merged);
    });

    return () => unsub();
  }, [localScans]); // IMPORTANT DEPENDENCY

  // Duration calculation
  const calculateDuration = (start, end) => {
    if (!start || !end) return "";
    const [sH, sM] = start.split(":");
    const [eH, eM] = end.split(":");
    const diff = eH * 60 + +eM - (sH * 60 + +sM);
    return diff > 0 ? diff : "";
  };

  // --- FIXED handleChange ---
  // Now uses regNo to find the correct item
  const handleChange = (regNo, field, value) => {
    setEntries((prevEntries) => {
      const index = prevEntries.findIndex(item => String(item.regNo) === String(regNo));
      if (index === -1) return prevEntries; // Safety check
  
      const updated = [...prevEntries];
      const entry = { ...updated[index] }; // Copy item
  
      entry[field] = value;
  
      if (field === "startTime" || field === "endTime") {
        entry.duration = calculateDuration(
          entry.startTime,
          entry.endTime
        );
      }
  
      updated[index] = entry; // Put updated item back
      return updated;
    });
  };

  // --- FIXED handleScan ---
  // Now uses regNo to find the correct item
  const handleScan = (regNo, value) => {
    // Save local override so snapshot doesn’t overwrite
    setLocalScans((prev) => ({
      ...prev,
      [regNo]: value,
    }));

    setEntries((prev) =>
      prev.map((e) =>
        String(e.regNo) === String(regNo) // Find by regNo
          ? {
              ...e,
              scanned: value,
              status: value === "Yes" ? "scanned" : "pending",
              scannedTime: value === "Yes" ? new Date().toISOString() : null,
            }
          : e
      )
    );
  };

  const handleSave = async (entry) => {
    try {
      setSaving(true);

      const regNo =
        entry.regNo || entry.regno || entry.RegNo || entry.Regno || entry.id;

      const ref = doc(db, "esr_register", String(regNo));

      const payload = {
        regNo: String(regNo),
        name: entry.name || "",
        age: entry.age || "",
        gender: entry.gender || "-",
        source: entry.source || "-",
        test: "ESR (ERYTHROCYTE SEDIMENTATION RATE, BLOOD)",
        startTime: entry.startTime || "",
        endTime: entry.endTime || "",
        duration: entry.duration || "",
        result: entry.result || "",

        scanned: entry.scanned || "No",
        scannedTime:
          entry.scanned === "Yes"
            ? entry.scannedTime || new Date().toISOString()
            : null,

        saved: "Yes",
        savedTime: serverTimestamp(),
        timePrinted: entry.timePrinted || null,
        status: "saved",
      };

      await setDoc(ref, payload, { merge: true });

      alert(`Saved ESR entry for ${entry.name}`);

    } catch (err) {
      console.error(err);
      alert("Error saving ESR entry.");
    } finally {
      setSaving(false);
    }
  };

  // Filtering
  const filteredEntries = entries.filter((p) => {
    if (regSearch.trim()) {
      if (!String(p.regNo).toLowerCase().includes(regSearch.toLowerCase()))
        return false;
    }

    if (sourceFilter !== "All" && p.source !== sourceFilter) return false;

    const eDate = parseDate(p);
    if (eDate) {
      if (dateFrom && eDate < new Date(dateFrom + "T00:00:00")) return false;
      if (dateTo && eDate > new Date(dateTo + "T23:59:59")) return false;
    }
    // Note: We are NOT filtering out entries without dates, as per our
    // discussion on the BloodGroup register. This may be revisited.

    return true;
  });

  return (
    <div className="register-section">
      <h3>🧪 ESR Register</h3>

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
              className={sourceFilter === src ? "active" : ""}
              onClick={() => setSourceFilter(src)}
            >
              {src}
            </button>
          ))}
        </div>
      </div>

      {filteredEntries.length === 0 ? (
        <p>No ESR entries found.</p>
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
              <th>Start Time</th>
              <th>End Time</th>
              <th>Duration</th>
              <th>ESR Result</th>
              <th>Scanned</th>
              <th>Action</th>
            </tr>
          </thead>

          <tbody>
            {filteredEntries.map((e, i) => { // 'i' is only used for React key
              const saved = e.status === "saved";
              const scanned = e.scanned === "Yes";

              return (
                <tr
                  key={e.regNo} // Use a stable key
                  className={saved ? "row-green" : scanned ? "row-yellow" : ""}
                >
                  <td>{e.regNo}</td>
                  <td>{e.name}</td>
                  <td>{e.age}</td>
                  <td>{e.gender}</td>
                  <td>{e.source}</td>
                  <td>ESR</td>

                  <td>
                    <input
                      type="time"
                      value={e.startTime}
                      disabled={!scanned || saved}
                      onChange={(ev) =>
                        // --- FIXED ---
                        handleChange(e.regNo, "startTime", ev.target.value)
                      }
                    />
                  </td>

                  <td>
                    <input
                      type="time"
                      value={e.endTime}
                      disabled={!scanned || saved}
                      onChange={(ev) =>
                        // --- FIXED ---
                        handleChange(e.regNo, "endTime", ev.target.value)
                      }
                    />
                  </td>

                  <td>{e.duration || "-"}</td>

                  <td>
                    <input
                      type="number"
                      value={e.result}
                      disabled={!scanned || saved}
                      onChange={(ev) =>
                        // --- FIXED ---
                        handleChange(e.regNo, "result", ev.target.value)
                      }
                    />
                  </td>

                  <td>
                    <select
                      value={e.scanned}
                      disabled={saved}
                      // --- FIXED ---
                      onChange={(ev) => handleScan(e.regNo, ev.target.value)}
                    >
                      <option>No</option>
                      <option>Yes</option>
                    </select>
                  </td>

                  <td>
                    <button
                      className="save-btn"
                      disabled={saved}
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
      )}
    </div>
  );
}
