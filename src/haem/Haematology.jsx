

import React, { useEffect, useState } from "react";
import "./Haematology.css";
import { db } from "../firebaseConfig.js";
import {
  collection,
  onSnapshot,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";

export default function Haematology() {
  const [activeTab, setActiveTab] = useState("3-part");
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);

  const [regSearch, setRegSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sourceFilter, setSourceFilter] = useState("All");

  const [localScans, setLocalScans] = useState({});
  const [localScanTimes, setLocalScanTimes] = useState({});
  const [savedSet, setSavedSet] = useState(new Set());

  const HAEM_TESTS_CANON = ["haemogram", "hb haemoglobin", "lamellar body count"];

  const normalize = (s = "") =>
    String(s)
      .toLowerCase()
      .replace(/[\s,._\-\(\)]+/g, " ")
      .replace(/fluid/g, "")
      .trim();

  const extractTestName = (t) => {
    if (!t) return "";
    if (typeof t === "string") return t;
    if (typeof t === "object" && (t.test || t.name)) return t.test || t.name;
    return "";
  };

  const entryHasCanonicalTest = (entry, canonical) => {
    const target = normalize(canonical);
    const arr = entry.selectedTests || [];
    return arr.some((x) => {
      const raw = extractTestName(x);
      return normalize(raw).includes(target) || target.includes(normalize(raw));
    });
  };

  const getEntryCanonicalTests = (entry) =>
    HAEM_TESTS_CANON.filter((c) => entryHasCanonicalTest(entry, c));

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

  const is3PartRequired = (age, ageUnit) => {
    const numAge = Number(age);
    if (isNaN(numAge) || numAge <= 0) return false;
    const unit = String(ageUnit || "years").toLowerCase();
    if (/day|month/.test(unit)) return true;
    if (unit.includes("years") && numAge < 1) return true;
    return false;
  };

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    setDateFrom(today);
    setDateTo(today);
  }, []);

  // ------------------------------------------------------------------
  // SNAPSHOTS — These should NOT overwrite local scanned timestamps!
  // ------------------------------------------------------------------
  useEffect(() => {
    const unsubMaster = onSnapshot(
      collection(db, "master_register"),
      async (snap) => {
        const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

        const haemEntries = all.filter((entry) =>
          (entry.selectedTests || []).some((t) =>
            HAEM_TESTS_CANON.some((c) =>
              normalize(extractTestName(t)).includes(normalize(c))
            )
          )
        );

        const merged = await Promise.all(
          haemEntries.map(async (entry) => {
            const regNo =
              entry.regNo ||
              entry.regno ||
              entry.RegNo ||
              entry.Regno ||
              entry.id;

            const regKey = String(regNo);

            // Extract timestamps
            const timePrinted = entry.timePrinted || null;
            const timeCollected = entry.timeCollected || null;

            const ref = doc(db, "haematology_register", regKey);
            const snapDoc = await getDoc(ref);

            const base = {
              ...entry,
              regNo: regKey,
              source: normalizeSource(entry.source || entry.category),
              scanned: localScans[regKey] ?? "No",
              status: "pending",
              timePrinted,
              timeCollected, // <-- NOW INCLUDED
            };

            if (snapDoc.exists()) {
              const data = snapDoc.data();
              const isSaved =
                data.saved === "Yes" || data.status?.toLowerCase() === "saved";

              const currentScanned =
                localScans[regKey] ?? data.scanned ?? "No";

              return {
                ...base,
                ...data,
                scanned: currentScanned,
                status: isSaved
                  ? "saved"
                  : currentScanned === "Yes"
                  ? "scanned"
                  : "pending",

                timePrinted: data.timePrinted || timePrinted,
                timeCollected: data.timeCollected || timeCollected, // <-- PRESERVED
              };
            }

            return base;
          })
        );

        setPatients(merged);
        setLoading(false);
      }
    );

    const unsubHaem = onSnapshot(
      collection(db, "haematology_register"),
      (snap) => {
        const s = new Set();
        snap.docs.forEach((d) => {
          const data = d.data();
          if (data?.saved === "Yes" || data?.status === "saved") {
            const key = data.regNo ? String(data.regNo) : d.id;
            s.add(key);
          }
        });
        setSavedSet(s);
      }
    );

    return () => {
      unsubMaster();
      unsubHaem();
    };
  }, [localScans]);

  // ------------------------------------------------------------------
  // SCAN — Local only. Does NOT write to Firestore.
  // ------------------------------------------------------------------
  const handleScan = (id, value) => {
    const patient = patients.find((p) => p.id === id);
    if (!patient) return;

    const regNo = String(patient.regNo || patient.id);

    const scanTime = value === "Yes" ? new Date() : null;

    setLocalScans((prev) => ({ ...prev, [regNo]: value }));
    setLocalScanTimes((prev) => ({ ...prev, [regNo]: scanTime }));

    // Update UI only
    setPatients((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              scanned: value,
              status: value === "Yes" ? "scanned" : "pending",
            }
          : p
      )
    );
  };

  // ------------------------------------------------------------------
  // SAVE — Writes scannedTime, savedTime, timeCollected, timePrinted
  // ------------------------------------------------------------------
  const handleSave = async (id) => {
    try {
      const patient = patients.find((p) => p.id === id);
      if (!patient) return;

      const regNo = String(patient.regNo || patient.id);

      const isScanned = localScans[regNo] === "Yes";

      if (!isScanned) {
        alert("Please scan before saving.");
        return;
      }

      const canonicalTests = getEntryCanonicalTests(patient);
      const scanTime = localScanTimes[regNo];

      await setDoc(
        doc(db, "haematology_register", regNo),
        {
          regNo,
          name: patient.name || "",
          age: patient.age || "",
          gender: patient.gender || "-",
          source: patient.source || patient.category || "-",
          selectedTests: canonicalTests,

          scanned: "Yes",
          scannedTime: scanTime ? Timestamp.fromDate(scanTime) : null,

          saved: "Yes",
          savedTime: serverTimestamp(),

          timePrinted: patient.timePrinted || null,
          timeCollected: patient.timeCollected || null, // <-- SAVE THIS TOO
          status: "saved",
        },
        { merge: true }
      );

      setSavedSet((prev) => new Set(prev).add(regNo));

      alert(`Saved ${patient.name || regNo} successfully!`);
    } catch (err) {
      console.error("🔥 Save Error:", err);
      alert("Error saving Haematology entry.");
    }
  };

  const threePart = patients.filter((p) => is3PartRequired(p.age, p.ageUnit));
  const fivePart = patients.filter((p) => !is3PartRequired(p.age, p.ageUnit));

  const filteredPatients =
    (activeTab === "3-part" ? threePart : fivePart).filter((p) => {
      if (regSearch.trim()) {
        const key = String(p.regNo || "").toLowerCase();
        if (!key.includes(regSearch.trim().toLowerCase())) return false;
      }

      if (sourceFilter !== "All" && p.source !== sourceFilter) return false;

      if (dateFrom || dateTo) {
        const eDate = parseDate(p);
        if (eDate) {
          if (dateFrom && eDate < new Date(dateFrom + "T00:00:00"))
            return false;
          if (dateTo && eDate > new Date(dateTo + "T23:59:59"))
            return false;
        }
      }

      return true;
    });

  if (loading) return <p>Loading Haematology data...</p>;

  return (
    <div className="haem-container">
      <div className="header">
        <h2>🩸 Haematology Department</h2>

        <div className="tabs">
          <button
            className={activeTab === "3-part" ? "active" : ""}
            onClick={() => setActiveTab("3-part")}
          >
            3-Part Machine ({threePart.length})
          </button>

          <button
            className={activeTab === "5-part" ? "active" : ""}
            onClick={() => setActiveTab("5-part")}
          >
            5-Part Machine ({fivePart.length})
          </button>
        </div>
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
              className={`source-btn ${
                sourceFilter === src ? "active" : ""
              }`}
              onClick={() => setSourceFilter(src)}
            >
              {src}
            </button>
          ))}
        </div>
      </div>

      <div className="table-card">
        <table className="haem-table">
          <thead>
            <tr>
              <th>Reg No</th>
              <th>Patient Name</th>
              <th>Age</th>
              <th>Gender</th>
              <th>Source</th>
              <th>Selected Tests</th>
              <th>Haemogram</th>
              <th>HB Haemoglobin</th>
              <th>Lamellar Body Count</th>
              <th>Scanned</th>
              <th>Action</th>
            </tr>
          </thead>

          <tbody>
            {filteredPatients.length > 0 ? (
              filteredPatients.map((p) => {
                const regKey = p.regNo;
                const selCanon = getEntryCanonicalTests(p);

                const isSaved =
                  savedSet.has(regKey) ||
                  p.saved === "Yes" ||
                  p.status?.toLowerCase() === "saved";

                const isScanned =
                  localScans[regKey] === "Yes" || p.scanned === "Yes";

                const rowClass = isSaved
                  ? "row-saved"
                  : isScanned
                  ? "row-scanned"
                  : "";

                return (
                  <tr key={p.id} className={rowClass}>
                    <td>{p.regNo}</td>
                    <td>{p.name}</td>
                    <td>
                      {p.age} {p.ageUnit ? `(${p.ageUnit})` : ""}
                    </td>
                    <td>{p.gender}</td>
                    <td>{p.source}</td>

                    <td>
                      {selCanon.length
                        ? selCanon.map((s) => s.toUpperCase()).join(", ")
                        : "—"}
                    </td>

                    <td>
                      {selCanon.some((t) =>
                        normalize(t).includes("haemogram")
                      )
                        ? "✅"
                        : "—"}
                    </td>

                    <td>
                      {selCanon.some((t) =>
                        normalize(t).includes("hb haemoglobin")
                      )
                        ? "✅"
                        : "—"}
                    </td>

                    <td>
                      {selCanon.some((t) =>
                        normalize(t).includes("lamellar body count")
                      )
                        ? "✅"
                        : "—"}
                    </td>

                    <td>
                      <select
                        value={isScanned ? "Yes" : "No"}
                        disabled={isSaved}
                        onChange={(e) => handleScan(p.id, e.target.value)}
                      >
                        <option value="No">No</option>
                        <option value="Yes">Yes</option>
                      </select>
                    </td>

                    <td>
                      <button
                        className="mark-done"
                        disabled={isSaved || !isScanned}
                        onClick={() => handleSave(p.id)}
                      >
                        💾 Save
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="11" style={{ textAlign: "center", padding: 20 }}>
                  No Haematology entries found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}