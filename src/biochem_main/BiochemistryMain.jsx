

import React, { useEffect, useState } from "react";
import "./BiochemistryMain.css";
import { db } from "../firebaseConfig.js";
import {
  collection,
  onSnapshot,
  updateDoc,
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";
import biochemRouting from "../biochem_testRouting.json";
import HormonesMain from "./HormonesMain.jsx";

export default function BiochemistryMain() {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("biochem");
  const [savedSet, setSavedSet] = useState(new Set());
  const [localScans, setLocalScans] = useState({});

  // ✅ Filters
  const [regSearch, setRegSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sourceFilter, setSourceFilter] = useState("All");

  const biochemTests = biochemRouting?.MainAnalyzer?.tests || [];
  const getTestName = (t) => (typeof t === "string" ? t : t?.test || "");

  const normalizeSource = (raw) => {
    if (!raw) return "Unknown";
    const s = raw.trim().toLowerCase();
    if (s.includes("opd")) return "OPD";
    if (s.includes("ipd")) return "IPD";
    if (s.includes("third") || s.includes("3rd")) return "Third Floor";
    return "Unknown";
  };

  // ✅ Include timePrinted
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

  // ✅ Add timePrinted integration in listener
  useEffect(() => {
    const unsubMaster = onSnapshot(collection(db, "master_register"), async (snapshot) => {
      const allPatients = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));

      const filtered = allPatients.filter(
        (entry) =>
          Array.isArray(entry.selectedTests) &&
          entry.selectedTests.some((t) => biochemTests.includes(getTestName(t)))
      );

      const merged = await Promise.all(
        filtered.map(async (entry) => {
          const regKey = entry.regNo ? String(entry.regNo) : entry.id;
          const ref = doc(db, "biochemistry_register", regKey);
          const snap = await getDoc(ref);

          const timePrinted =
            entry.timePrinted && entry.timePrinted.toDate
              ? entry.timePrinted.toDate().toISOString()
              : entry.timePrinted || null;

          const base = {
            ...entry,
            source: normalizeSource(entry.source || entry.category),
            scanned: localScans[regKey] ?? "No",
            scannedTime: null,
            status: "pending",
            timePrinted, // ✅ Added
          };

          if (snap.exists()) {
            const saved = snap.data();
            return {
              ...base,
              ...saved,
              source: saved.source || base.source,
              scanned: localScans[regKey] ?? saved.scanned ?? "No",
              scannedTime: saved.scannedTime || null,
              timePrinted: saved.timePrinted || base.timePrinted, // ✅ keep both
            };
          }
          return base;
        })
      );

      setPatients(merged);
      setLoading(false);
    });

    const unsubBio = onSnapshot(collection(db, "biochemistry_register"), (snap) => {
      const s = new Set();
      snap.docs.forEach((d) => {
        const data = d.data();
        const key = data?.regNo ? String(data.regNo) : d.id;
        s.add(key);
      });
      setSavedSet(s);
    });

    return () => {
      unsubMaster();
      unsubBio();
    };
  }, [localScans]);

  // 🔹 Update field live
  const handleInputChange = async (id, field, value) => {
    setPatients((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );
    try {
      await updateDoc(doc(db, "master_register", id), { [field]: value });
    } catch (err) {
      console.error("❌ Error updating master register:", err);
    }
  };

  // ✅ Include timePrinted when saving
  const handleSave = async (patient) => {
    try {
      const regKey = patient.regNo ? String(patient.regNo) : patient.id;
      const docRef = doc(db, "biochemistry_register", regKey);

      const relevantTests = patient.selectedTests
        ?.filter((t) => biochemTests.includes(getTestName(t)))
        .map((t) => getTestName(t));

      const payload = {
        regNo: patient.regNo || regKey,
        name: patient.name || "",
        age: patient.age || "",
        gender: patient.gender || "-",
        source: patient.source || "-",
        selectedTests: relevantTests || [],
        result: patient.result || "",
        scanned: patient.scanned || "No",
        scannedTime:
          patient.scanned === "Yes"
            ? patient.scannedTime || new Date().toISOString()
            : null,
        saved: "Yes",
        savedTime: serverTimestamp(),
        timePrinted: patient.timePrinted || null, // ✅ Added
        status: "saved",
      };

      await setDoc(docRef, payload, { merge: true });

      const validatorRef = doc(db, "validator_queue", `bio_${regKey}`);
      await setDoc(validatorRef, {
        dept: "Biochemistry",
        regNo: payload.regNo,
        name: payload.name,
        tests: relevantTests,
        status: "pending",
        queuedAt: serverTimestamp(),
      });

      setSavedSet((prev) => new Set(prev).add(regKey));
      setLocalScans((prev) => ({ ...prev, [regKey]: "No" }));
      alert(`✅ Saved Biochemistry entry for ${payload.name || payload.regNo}`);
    } catch (err) {
      console.error("❌ Error saving Biochemistry entry:", err);
      alert("Error saving Biochemistry entry!");
    }
  };

  // ✅ Filters unchanged
  const filteredPatients = patients.filter((p) => {
    if (regSearch.trim()) {
      const key = String(p.regNo || "").toLowerCase();
      if (!key.includes(regSearch.trim().toLowerCase())) return false;
    }

    if (sourceFilter !== "All" && p.source !== sourceFilter) return false;

    if (dateFrom || dateTo) {
      const eDate = parseDate(p);
      if (eDate) {
        if (dateFrom && eDate < new Date(dateFrom + "T00:00:00")) return false;
        if (dateTo && eDate > new Date(dateTo + "T23:59:59")) return false;
      }
    }
    return true;
  });

  if (loading) return <p>Loading Biochemistry data...</p>;

  return (
    <div className="biochem-register-container">
      {/* Tabs */}
      <div className="tab-container">
        <button
          className={`tab-btn ${activeTab === "biochem" ? "active" : ""}`}
          onClick={() => setActiveTab("biochem")}
        >
          Biochemistry
        </button>
        <button
          className={`tab-btn ${activeTab === "hormones" ? "active" : ""}`}
          onClick={() => setActiveTab("hormones")}
        >
          Hormones
        </button>
      </div>

      {activeTab === "biochem" ? (
        <>
          <h2 className="dept-header">Biochemistry Department — Main Analyzer</h2>

          {/* ✅ Filter Bar */}
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

          {/* ✅ Table */}
          <div className="table-wrapper">
            <table className="dept-table">
              <thead>
                <tr>
                  <th>Reg No</th>
                  <th>Patient Name</th>
                  <th>Age</th>
                  <th>Gender</th>
                  <th>Source</th>
                  <th>Selected Tests</th>
                  {biochemTests.map((test, idx) => (
                    <th key={idx}>{test}</th>
                  ))}
                  <th>Result</th>
                  <th>Scanned</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {filteredPatients.length > 0 ? (
                  filteredPatients.map((p) => {
                    const regKey = p.regNo ? String(p.regNo) : p.id;
                    const isSaved = savedSet.has(regKey);
                    const isScanned =
                      localScans[regKey] === "Yes" || p.scanned === "Yes";

                    const relevantTests = p.selectedTests?.filter((t) =>
                      biochemTests.includes(getTestName(t))
                    );

                    return (
                      <tr
                        key={p.id}
                        className={
                          isSaved
                            ? "row-green"
                            : isScanned
                            ? "row-yellow"
                            : "row-normal"
                        }
                      >
                        <td>{p.regNo || "—"}</td>
                        <td>{p.name || "—"}</td>
                        <td>{p.age || "—"}</td>
                        <td>{p.gender || "-"}</td>
                        <td>{p.source || "—"}</td>
                        <td>
                          {relevantTests?.map((t) => getTestName(t)).join(", ") || "—"}
                        </td>

                        {biochemTests.map((test, idx2) => (
                          <td key={idx2}>
                            {relevantTests?.some(
                              (t) => getTestName(t) === test
                            )
                              ? "✅"
                              : "—"}
                          </td>
                        ))}

                        <td>
                          <input
                            type="text"
                            value={p.result || ""}
                            disabled={!isScanned || isSaved}
                            onChange={(e) =>
                              handleInputChange(p.id, "result", e.target.value)
                            }
                            placeholder="Result"
                          />
                        </td>

                        <td>
                          <select
                            value={isScanned ? "Yes" : "No"}
                            disabled={isSaved}
                            onChange={(e) => {
                              const value = e.target.value;

                              if (value === "Yes") {
                                const alreadyScanning = patients.some(
                                  (pat) =>
                                    (localScans[pat.id] === "Yes" ||
                                      pat.scanned === "Yes") &&
                                    pat.id !== p.id &&
                                    !savedSet.has(String(pat.regNo || pat.id))
                                );

                                if (alreadyScanning) {
                                  alert("Only one entry can be scanned at a time!");
                                  return;
                                }

                                setLocalScans((prev) => ({
                                  ...prev,
                                  [regKey]: "Yes",
                                }));

                                handleInputChange(p.id, "scanned", "Yes");
                                handleInputChange(
                                  p.id,
                                  "scannedTime",
                                  new Date().toISOString()
                                );
                              } else {
                                setLocalScans((prev) => ({
                                  ...prev,
                                  [regKey]: "No",
                                }));
                                handleInputChange(p.id, "scanned", "No");
                              }
                            }}
                          >
                            <option value="No">No</option>
                            <option value="Yes">Yes</option>
                          </select>
                        </td>

                        <td>
                          <button
                            className="save-btn"
                            disabled={isSaved}
                            onClick={() => handleSave(p)}
                          >
                            💾 Save
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="10" className="no-data">
                      No Biochemistry Main entries found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <HormonesMain />
      )}
    </div>
  );
}