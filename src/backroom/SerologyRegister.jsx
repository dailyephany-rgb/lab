

import React, { useState, useEffect } from "react";
import { db } from "../firebaseConfig";
import {
  collection,
  onSnapshot,
  setDoc,
  getDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import routing from "../backroom_routing.json";
import "./Backroom.css";

export default function SerologyRegister() {
  const [entries, setEntries] = useState([]);
  const [saving, setSaving] = useState(false);

  // 🔍 Filters
  const [regSearch, setRegSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sourceFilter, setSourceFilter] = useState("All");

  // Track scan state locally
  const [localScans, setLocalScans] = useState({});

  // All tests that belong in Serology
  const testsForRegister =
    routing.SerologyRegister || [
      "HBSAG",
      "HCV SERUM",
      "VDRL, SERUM",
      "VDRL IN DILUTION",
      "WIDAL TEST, SERUM",   // ⭐ Added WIDAL
    ];

  const normalize = (s) =>
    (s || "").toLowerCase().replace(/[\s,._-]+/g, "").replace(/[^a-z0-9]/g, "");

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

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    setDateFrom(today);
    setDateTo(today);
  }, []);

  // 🔄 Live updates from Firebase
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "master_register"), async (snapshot) => {
      const allData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      const filtered = allData.filter((entry) => {
        const selected = entry.selectedTests;
        if (!Array.isArray(selected)) return false;

        return selected.some((testObj) => {
          const testName =
            typeof testObj === "string" ? testObj : testObj?.test || "";
          if (!testName) return false;
          const nTest = normalize(testName);
          return testsForRegister.some((ref) => {
            const nRef = normalize(ref);
            return nRef === nTest || nRef.includes(nTest) || nTest.includes(nRef);
          });
        });
      });

      const merged = await Promise.all(
        filtered.map(async (entry) => {
          const regNo = String(entry.regNo);
          const ref = doc(db, "serology_register", regNo);
          const snap = await getDoc(ref);

          const timePrinted =
            entry.timePrinted && entry.timePrinted.toDate
              ? entry.timePrinted.toDate().toISOString()
              : entry.timePrinted || null;

          let saved = snap.exists() ? snap.data() : {};

          const localScanValue = localScans[regNo];

          return {
            ...entry,
            ...saved,
            regNo: regNo,
            source: normalizeSource(entry.source || entry.category),
            timePrinted: saved.timePrinted || timePrinted,

            // ⭐ Default result fields including WIDAL
            results: saved.results || {
              hbsag: "-",
              vdrl: "-",
              vdrlDilution: "-",
              widal: "-",     // ⭐ Added
            },

            scanned:
              localScanValue ??
              saved.scanned ??
              "No",

            scannedTime:
              localScanValue === "Yes"
                ? new Date().toISOString()
                : saved.scannedTime || null,

            status:
              saved.saved === "Yes"
                ? "saved"
                : localScanValue === "Yes"
                ? "scanned"
                : "pending",

            saved: saved.saved || "No",
          };
        })
      );

      setEntries(merged);
    });

    return () => unsubscribe();
  }, [localScans]);

  const hasTest = (entry, testName) => {
    const selected = entry.selectedTests || [];
    return selected.some((t) => {
      const name = typeof t === "object" && t.test ? t.test : String(t);
      return normalize(name).includes(normalize(testName));
    });
  };

  const handleChange = (regNo, field, value) => {
    setEntries((prevEntries) => {
      const index = prevEntries.findIndex(item => String(item.regNo) === String(regNo));
      if (index === -1) return prevEntries;

      const updated = [...prevEntries];
      const entry = { 
        ...updated[index],
        results: { ...(updated[index].results || {}) }
      };

      entry.results[field] = value;
      updated[index] = entry;
      return updated;
    });
  };

  const handleScan = (regNo, value) => {
    setLocalScans((prev) => ({
      ...prev,
      [regNo]: value,
    }));

    setEntries((prev) =>
      prev.map((e) =>
        String(e.regNo) === String(regNo)
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
      const ref = doc(db, "serology_register", String(regNo));

      const cleanedResults = Object.fromEntries(
        Object.entries(entry.results || {}).filter(
          ([, val]) => val && val !== "-" && val !== "" && val !== "Pending"
        )
      );

      const payload = {
        regNo: String(regNo),
        name: entry.name || "",
        age: entry.age || "",
        gender: entry.gender || "-",
        source: entry.source || "-",
        selectedTests:
          (entry.selectedTests || []).map((t) =>
            typeof t === "object" && t.test ? t.test : t
          ) || [],
        results: cleanedResults,
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

      setEntries((prev) =>
        prev.map((p) =>
          p.regNo === regNo ? { ...p, ...payload, savedTime: "Now" } : p
        )
      );

      alert(`✅ Saved Serology entry for ${entry.name}`);
    } catch (error) {
      console.error("❌ Error saving Serology entry:", error);
      alert("Error saving entry.");
    } finally {
      setSaving(false);
    }
  };

  const filteredEntries = entries.filter((p) => {
    if (regSearch.trim()) {
      const key = String(p.regNo || "").toLowerCase();
      if (!key.includes(regSearch.trim().toLowerCase())) return false;
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
      <h3>🧬 Serology Register</h3>

      {/* FILTER BAR */}
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
        <p>No Serology entries found.</p>
      ) : (
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
              <th>VDRL (Serum)</th>
              <th>VDRL (Dilution)</th>
              <th>WIDAL</th> {/* ⭐ NEW COLUMN */}
              <th>Scanned</th>
              <th>Action</th>
            </tr>
          </thead>

          <tbody>
            {filteredEntries.map((e, i) => (
              <tr
                key={e.regNo || i}
                className={
                  e.status === "saved"
                    ? "row-green"
                    : e.status === "scanned"
                    ? "row-yellow"
                    : "row-normal"
                }
              >
                <td>{e.regNo}</td>
                <td>{e.name}</td>
                <td>{e.age}</td>
                <td>{e.gender || "-"}</td>
                <td>{e.source}</td>
                <td>
                  {(e.selectedTests || [])
                    .map((t) =>
                      typeof t === "object" && t.test ? t.test : t
                    )
                    .filter((t) =>
                      testsForRegister.some((ref) =>
                        String(t).toLowerCase().includes(ref.toLowerCase())
                      )
                    )
                    .join(", ") || "—"}
                </td>

                {[
                  { key: "hbsag", label: "HBsAg" },
                  { key: "vdrl", label: "VDRL, SERUM" }, 
                  { key: "vdrlDilution", label: "VDRL IN DILUTION" },
                  { key: "widal", label: "WIDAL TEST, SERUM" },   // ⭐ NEW WIDAL FIELD
                ].map((test) => (
                  <td key={test.key}>
                    {hasTest(e, test.label) ? (
                      <select
                        value={e.results[test.key] || "Pending"}
                        disabled={e.status === "saved" || e.status !== "scanned"}
                        onChange={(ev) =>
                          handleChange(e.regNo, test.key, ev.target.value)
                        }
                      >
                        <option>Pending</option>
                        <option>Positive</option>
                        <option>Negative</option>
                      </select>
                    ) : (
                      "—"
                    )}
                  </td>
                ))}

                <td>
                  <select
                    value={e.scanned || "No"}
                    onChange={(ev) => handleScan(e.regNo, ev.target.value)}
                    disabled={e.status === "saved"}
                  >
                    <option value="No">No</option>
                    <option value="Yes">Yes</option>
                  </select>
                </td>

                <td>
                  <button
                    className="save-btn"
                    onClick={() => handleSave(e)}
                    disabled={saving || e.status === "saved"}
                  >
                    Save
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}