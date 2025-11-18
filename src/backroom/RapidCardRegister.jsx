
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

export default function RapidCardRegister() {
  const [entries, setEntries] = useState([]);
  const [saving, setSaving] = useState(false);

  // 🔍 Filters
  const [regSearch, setRegSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sourceFilter, setSourceFilter] = useState("All");

  // --- ADDED ---
  const [localScans, setLocalScans] = useState({});

  // Tests included in Rapid Card Register
  const testsForRegister =
    routing.RapidCardRegister || [
      "MALARIA ANTIGEN DETECTION CARD , BLOOD",
      "DENGUE IGG , IGM & NS 1 ANTIGEN",
      "TYPHOID IGG , IGM",
      "CHIKUNGUNIA IGM",
    ];

  const normalize = (s) =>
    (s || "").toLowerCase().replace(/[\s,._-]+/g, " ").trim();

  // Columns
  const rapidTests = [
    { field: "malaria", label: "Malaria Antigen", match: "malaria antigen" },
    { field: "dengue", label: "Dengue IGG/IGM/NS1", match: "dengue" },
    { field: "typhoid", label: "Typhoid IGG/IGM", match: "typhoid" },
    { field: "chikungunya", label: "Chikungunya IgM", match: "chikungunia" },
  ];

  const normalizeSource = (raw) => {
    if (!raw) return "Unknown";
    const s = raw.trim().toLowerCase();
    if (s.includes("opd")) return "OPD";
    if (s.includes("ipd")) return "IPD";
    if (s.includes("third") || s.includes("3rd")) return "Third Floor";
    return "Unknown";
  };

  // Parse date (supports timePrinted)
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

  // Today as default
  useEffect(() => {
    const t = new Date().toISOString().slice(0, 10);
    setDateFrom(t);
    setDateTo(t);
  }, []);

  // --- FIXED Fetch + merge logic ---
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "master_register"), async (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const filtered = all.filter((entry) => {
        const selected = entry.selectedTests;
        if (!Array.isArray(selected)) return false;

        return selected.some((t) => {
          const name =
            typeof t === "string" ? t : t?.test || "";
          if (!name) return false;

          const nTest = normalize(name);
          return testsForRegister.some((ref) => {
            const nRef = normalize(ref);
            return nRef === nTest || nRef.includes(nTest) || nTest.includes(nRef);
          });
        });
      });

      const merged = await Promise.all(
        filtered.map(async (entry) => {
          const regNo = String(entry.regNo);
          const ref = doc(db, "rapid_card_register", regNo);
          const snap2 = await getDoc(ref);

          const timePrinted =
            entry.timePrinted && entry.timePrinted.toDate
              ? entry.timePrinted.toDate().toISOString()
              : entry.timePrinted || null;

          // Base data from master_register
          const baseDefaults = {
            ...entry,
            regNo: regNo,
            source: normalizeSource(entry.source || entry.category),
            results: {
              malaria: "Pending",
              dengue: "Pending",
              typhoid: "Pending",
              chikungunya: "Pending",
            },
            scanned: "No",
            status: "pending",
            saved: "No",
            timePrinted,
          };

          let savedData = {};
          if (snap2.exists()) {
            savedData = snap2.data();
          }

          const localScanValue = localScans[regNo];

          return {
            ...baseDefaults,
            ...savedData, // Apply saved data
            results: savedData.results || baseDefaults.results, // Ensure results object exists
            
            // Apply local scan override
            scanned:
              localScanValue ??
              savedData.scanned ??
              "No",
            
            scannedTime:
              localScanValue === "Yes"
                ? new Date().toISOString()
                : savedData.scannedTime || null,
            
            status:
              savedData.saved === "Yes"
                ? "saved"
                : localScanValue === "Yes"
                ? "scanned"
                : "pending",
          };
        })
      );

      setEntries(merged);
    });

    return () => unsub();
  }, [localScans]); // --- FIXED Dependency ---

  // --- FIXED handleChange ---
  const handleChange = (regNo, field, value) => {
    setEntries((prevEntries) => {
      const index = prevEntries.findIndex(item => String(item.regNo) === String(regNo));
      if (index === -1) return prevEntries;

      const updated = [...prevEntries];
      const entry = { 
        ...updated[index],
        results: { ...(updated[index].results || {}) } // Deep copy results
      };

      entry.results[field] = value;
      updated[index] = entry;
      return updated;
    });
  };

  // --- FIXED handleScan ---
  const handleScan = (regNo, value) => {
    // 1. Set local override
    setLocalScans((prev) => ({
      ...prev,
      [regNo]: value,
    }));

    // 2. Update main state
    setEntries((prev) =>
      prev.map((e) =>
        String(e.regNo) === String(regNo) // Find by regNo
          ? {
              ...e,
              scanned: value,
              status: value === "Yes" ? "scanned" : "pending",
              scannedTime: value === "Yes" ? new Date().toISOString() : null,
            }
          : e // Keep other entries as-is
      )
    );
  };

  const handleSave = async (entry) => {
    try {
      setSaving(true);
      const reg = String(entry.regNo);
      const ref = doc(db, "rapid_card_register", reg);

      const payload = {
        regNo: reg,
        name: entry.name || "",
        age: entry.age || "",
        gender: entry.gender || "-",
        source: entry.source || "-",
        selectedTests:
          (entry.selectedTests || []).map((t) =>
            typeof t === "object" && t.test ? t.test : t
          ),
        results: entry.results || {},
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
        prev.map((e) => (String(e.regNo) === reg ? { ...e, ...payload, savedTime: "Now" } : e))
      );

      alert(`Saved entry for ${entry.name}`);
    } finally {
      setSaving(false);
    }
  };

  const isTestSelected = (entry, match) => {
    const nMatch = normalize(match);
    return (entry.selectedTests || []).some((t) => {
      const name = typeof t === "string" ? t : t?.test || "";
      return normalize(name).includes(nMatch);
    });
  };

  const selectedTestsString = (entry) => {
    const selected = [];
    (entry.selectedTests || []).forEach((t) => {
      const name = typeof t === "string" ? t : t?.test || "";
      rapidTests.forEach((r) => {
        if (normalize(name).includes(normalize(r.match))) {
          if (!selected.includes(r.label)) { // Avoid duplicates
             selected.push(r.label);
          }
        }
      });
    });
    return selected.join(", ") || "—";
  };

  const filteredEntries = entries.filter((p) => {
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

  return (
    <div className="register-section">
      <h3>💉 Rapid Card Register</h3>

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
              className={`source-btn ${sourceFilter === src ? "active" : ""}`}
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
        <table className="backroom-table">
          <thead>
            <tr>
              <th>Reg No</th>
              <th>Name</th>
              <th>Age</th>
              <th>Gender</th>
              <th>Source</th>
              <th>Selected Tests</th>
              {rapidTests.map((t) => (
                <th key={t.field}>{t.label}</th>
              ))}
              <th>Scanned</th>
              <th>Action</th>
            </tr>
          </thead>

          <tbody>
            {filteredEntries.map((e, i) => {
              const saved = e.status === "saved";
              const scanned = e.scanned === "Yes";

              return (
                <tr
                  key={e.regNo || i} // --- FIXED Key ---
                  className={
                    saved ? "row-green" : scanned ? "row-yellow" : "" // Changed to green/yellow
                  }
                >
                  <td>{e.regNo}</td>
                  <td>{e.name}</td>
                  <td>{e.age}</td>
                  <td>{e.gender || "-"}</td>
                  <td>{e.source || "-"}</td>

                  <td>{selectedTestsString(e)}</td>

                  {rapidTests.map((t) => {
                    const sel = isTestSelected(e, t.match);
                    const editable = sel && scanned && !saved;

                    return (
                      <td key={t.field}>
                        {sel ? (
                          <select
                            value={(e.results && e.results[t.field]) || "Pending"}
                            disabled={!editable}
                            // --- FIXED ---
                            onChange={(ev) => handleChange(e.regNo, t.field, ev.target.value)}
                          >
                            <option value="Pending">Pending</option>
                            <option value="Positive">Positive</option>
                            <option value="Negative">Negative</option>
                          </select>
                        ) : (
                          "—"
                        )}
                      </td>
                    );
                  })}

                  <td>
                    <select
                      value={e.scanned || "No"}
                      // --- THIS WAS THE FIX ---
                      onChange={(ev) => handleScan(e.regNo, ev.target.value)}
                      disabled={saved}
                    >
                      <option value="No">No</option>
                      <option value="Yes">Yes</option>
                    </select>
                  </td>

                  <td>
                    <button
                      className="save-btn"
                      onClick={() => handleSave(e)}
                      disabled={saving || saved}
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

