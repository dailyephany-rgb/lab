

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

export default function ESRRegister() {
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

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    setDateFrom(today);
    setDateTo(today);
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "master_register"),
      async (snapshot) => {
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
              entry.regNo ||
              entry.regno ||
              entry.RegNo ||
              entry.Regno ||
              entry.id;
            const regKey = String(regNo);

            const ref = doc(db, "esr_register", regKey);
            const snap = await getDoc(ref);

            const timePrinted = entry.timePrinted || null;
            const timeCollected = entry.timeCollected || null;

            let saved = {};
            if (snap.exists()) saved = snap.data();

            const localScanValue = localScans[regKey];

            const computedStatus =
              saved.saved === "Yes" || saved.status === "saved"
                ? "saved"
                : localScanValue === "Yes"
                ? "scanned"
                : saved.status || "pending";

            return {
              ...entry,
              ...saved,

              source: normalizeSource(entry.source || entry.category),

              timePrinted: saved.timePrinted || timePrinted,
              timeCollected: saved.timeCollected || timeCollected,

              scanned: localScanValue ?? saved.scanned ?? "No",

              scannedTime: saved.scannedTime || null,

              status: computedStatus,

              startTime: saved.startTime || "",
              endTime: saved.endTime || "",
              duration: saved.duration || "",
              result: saved.result || "",
              regNo: regKey,
              id: entry.id,
            };
          })
        );

        setEntries(merged);
      }
    );

    return () => unsub();
  }, [localScans]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "esr_register"), (snap) => {
      const s = new Set();
      snap.docs.forEach((d) => {
        const data = d.data();
        if (data && (data.saved === "Yes" || data.status === "saved")) {
          const key = data.regNo ? String(data.regNo) : d.id;
          s.add(key);
        }
      });
      setSavedSet(s);
    });

    return () => unsub();
  }, []);

  const calculateDuration = (start, end) => {
    if (!start || !end) return "";
    const [sH, sM] = start.split(":");
    const [eH, eM] = end.split(":");
    if (isNaN(+sH) || isNaN(+sM) || isNaN(+eH) || isNaN(+eM)) return "";
    const diff = eH * 60 + +eM - (sH * 60 + +sM);
    return diff > 0 ? diff : "";
  };

  const handleChange = (regNo, field, value) => {
    setEntries((prevEntries) => {
      const index = prevEntries.findIndex(
        (item) => String(item.regNo) === String(regNo)
      );
      if (index === -1) return prevEntries;

      const updated = [...prevEntries];
      const entry = { ...updated[index] };

      entry[field] = value;

      if (field === "startTime" || field === "endTime") {
        entry.duration = calculateDuration(entry.startTime, entry.endTime);
      }

      updated[index] = entry;
      return updated;
    });
  };

  const handleScan = (regNo, value) => {
    const key = String(regNo);
    const scanTime = value === "Yes" ? new Date() : null;

    setLocalScans((prev) => ({
      ...prev,
      [key]: value,
    }));

    setLocalScanTimes((prev) => ({
      ...prev,
      [key]: scanTime,
    }));

    setEntries((prev) =>
      prev.map((e) =>
        String(e.regNo) === key
          ? {
              ...e,
              scanned: value,
              status:
                value === "Yes"
                  ? "scanned"
                  : savedSet.has(key)
                  ? "saved"
                  : "pending",
            }
          : e
      )
    );
  };

  const isEntryReadyToSave = (e) => {
    const scannedNow =
      e.scanned === "Yes" || localScans[String(e.regNo)] === "Yes";
    if (!scannedNow) return false;
    if (!e.startTime || !e.endTime) return false;
    if (!e.result || String(e.result).trim() === "") return false;
    if (!e.duration || Number(e.duration) <= 0) return false;
    return true;
  };

  const handleSave = async (entry) => {
    try {
      setSaving(true);

      const regNo =
        entry.regNo || entry.regno || entry.RegNo || entry.Regno || entry.id;
      const key = String(regNo);

      if (!isEntryReadyToSave(entry)) {
        alert("Please scan and fill Start Time, End Time, Duration & Result.");
        setSaving(false);
        return;
      }

      const scanTime = localScanTimes[key] || null;
      const ref = doc(db, "esr_register", key);

      const payload = {
        regNo: key,
        name: entry.name || "",
        age: entry.age || "",
        gender: entry.gender || "-",
        source: entry.source || "-",
        test: "ESR", 
        startTime: entry.startTime || "",
        endTime: entry.endTime || "",
        duration: entry.duration || "",
        result: entry.result || "",

        scanned: "Yes",
        scannedTime: scanTime ? Timestamp.fromDate(scanTime) : entry.scannedTime || null,

        saved: "Yes",
        savedTime: serverTimestamp(),

        timePrinted: entry.timePrinted || null,
        timeCollected: entry.timeCollected || null,

        status: "saved",
      };

      await setDoc(ref, payload, { merge: true });

      setEntries((prev) =>
        prev.map((p) => (String(p.regNo) === key ? { ...p, ...payload } : p))
      );

      setSavedSet((prev) => {
        const n = new Set(prev);
        n.add(key);
        return n;
      });

      alert(`Saved ESR entry for ${entry.name}`);
    } catch (err) {
      console.error(err);
      alert("Error saving ESR entry.");
    } finally {
      setSaving(false);
    }
  };

  const filteredEntries = entries.filter((p) => {
    if (regSearch.trim()) {
      if (
        !String(p.regNo).toLowerCase().includes(regSearch.toLowerCase())
      )
        return false;
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
              /* FIXED: Added 'source-btn' class so CSS works */
              className={sourceFilter === src ? "source-btn active" : "source-btn"}
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
            {filteredEntries.map((e) => {
              const key = String(e.regNo);
              const saved =
                e.status === "saved" || savedSet.has(key);
              const scanned =
                e.scanned === "Yes" || localScans[key] === "Yes";
              const readyToSave = isEntryReadyToSave(e);

              return (
                <tr
                  key={e.regNo}
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
                        handleChange(e.regNo, "result", ev.target.value)
                      }
                    />
                  </td>

                  <td>
                    <select
                      value={scanned ? "Yes" : "No"}
                      disabled={saved}
                      onChange={(ev) => handleScan(e.regNo, ev.target.value)}
                    >
                      <option value="No">No</option>
                      <option value="Yes">Yes</option>
                    </select>
                  </td>

                  <td>
                    <button
                      className="save-btn"
                      disabled={saving || saved || !readyToSave}
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
