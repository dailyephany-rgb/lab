



import React, { useState, useEffect } from "react";
import "./BiochemistryBackup.css";
import { db } from "../firebaseConfig.js";
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";
import hormoneRouting from "../hormone_testRouting.json";

export default function HormonesBackup() {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);

  // 🔹 Filters
  const [regSearch, setRegSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sourceFilter, setSourceFilter] = useState("All");

  const hormoneTests =
    hormoneRouting.BackupAnalyzer?.tests || hormoneRouting?.tests || [];

  // 🔹 Auto-set today's date
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    setDateFrom(today);
    setDateTo(today);
  }, []);

  // 🔹 Normalize Source
  const normalizeSource = (raw) => {
    if (!raw) return "Unknown";
    const s = raw.trim().toLowerCase();
    if (s.includes("opd")) return "OPD";
    if (s.includes("ipd")) return "IPD";
    if (s.includes("third") || s.includes("3rd")) return "Third Floor";
    return "Unknown";
  };

  // ✅ Parse timestamp (added timePrinted)
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

  // ✅ Listener for master_register (added timePrinted)
  useEffect(() => {
    console.log("🧬 Listening to Hormones Backup data...");

    const unsubscribe = onSnapshot(collection(db, "master_register"), async (snapshot) => {
      const allPatients = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));

      const filtered = allPatients.filter(
        (entry) =>
          Array.isArray(entry.selectedTests) &&
          entry.selectedTests.some((t) =>
            hormoneTests.includes(typeof t === "string" ? t : t.test)
          )
      );

      const merged = await Promise.all(
        filtered.map(async (entry) => {
          const regNo =
            entry.regNo ||
            entry.regno ||
            entry.RegNo ||
            entry.Regno ||
            entry.id;

          const ref = doc(db, "hormones_backup", String(regNo));
          const snap = await getDoc(ref);

          // ✅ Extract timePrinted safely
          const timePrinted =
            entry.timePrinted && entry.timePrinted.toDate
              ? entry.timePrinted.toDate().toISOString()
              : entry.timePrinted || null;

          const defaultResults = Object.fromEntries(
            hormoneTests.map((t) => [t, ""])
          );

          const base = {
            ...entry,
            regNo: String(regNo),
            source: normalizeSource(entry.source),
            results: defaultResults,
            scanned: "No",
            status: "pending",
            timePrinted, // ✅ Added
          };

          if (snap.exists()) {
            const data = snap.data();
            return {
              ...base,
              ...data,
              timePrinted: data.timePrinted || base.timePrinted, // ✅ Preserve both
            };
          } else {
            return base;
          }
        })
      );

      setPatients(merged);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // 🔹 Handle field changes
  const handleInputChange = (e, id, field) => {
    const { value } = e.target;
    setPatients((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, results: { ...p.results, [field]: value } }
          : p
      )
    );
  };

  // 🔹 One row scanned at a time
  const handleScan = async (id, value) => {
    try {
      const updated = patients.map((p) => {
        if (p.id === id) {
          return {
            ...p,
            scanned: value,
            status:
              value === "Yes"
                ? "scanned"
                : p.status === "saved"
                ? "saved"
                : "pending",
            scannedTime: value === "Yes" ? new Date().toISOString() : null,
          };
        }

        if (p.status === "saved" || p.saved === "Yes") return p;
        return { ...p, scanned: "No", status: "pending" };
      });

      setPatients(updated);

      const patient = updated.find((p) => p.id === id);
      const regNo =
        patient.regNo ||
        patient.regno ||
        patient.RegNo ||
        patient.Regno ||
        patient.id;

      const ref = doc(db, "hormones_backup", String(regNo));
      await setDoc(
        ref,
        {
          scanned: patient.scanned,
          status: patient.status,
          scannedTime:
            patient.scanned === "Yes" ? serverTimestamp() : null,
        },
        { merge: true }
      );
    } catch (err) {
      console.error("❌ Error updating scan:", err);
    }
  };

  // ✅ Save Entry (added timePrinted)
  const handleSave = async (id) => {
    try {
      const patient = patients.find((p) => p.id === id);
      if (!patient) return;

      const regNo =
        patient.regNo ||
        patient.regno ||
        patient.RegNo ||
        patient.Regno ||
        patient.id;

      const ref = doc(db, "hormones_backup", String(regNo));

      const cleanedResults = Object.fromEntries(
        hormoneTests.map((test) => [test, patient.results?.[test] || "-"])
      );

      const payload = {
        regNo: String(regNo),
        name: patient.name || "",
        age: patient.age || "",
        gender: patient.gender || "-",
        source: patient.source || "-",
        selectedTests:
          (patient.selectedTests || []).map((t) =>
            typeof t === "object" && t.test ? t.test : t
          ) || [],
        results: cleanedResults,
        scanned: patient.scanned || "No",
        scannedTime:
          patient.scanned === "Yes"
            ? patient.scannedTime || new Date().toISOString()
            : null,
        saved: "Yes",
        savedTime: serverTimestamp(),
        timePrinted: patient.timePrinted || null, // ✅ Added here
        status: "saved",
      };

      await setDoc(ref, payload, { merge: true });

      setPatients((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, ...payload } : p
        )
      );

      alert(`✅ Hormone Backup entry saved for ${patient.name}`);
    } catch (error) {
      console.error("❌ Error saving hormone entry:", error);
      alert("Error saving hormone entry.");
    }
  };

  // 🔹 Apply filters
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

  if (loading) return <p>Loading Hormones Backup data...</p>;

  return (
    <div className="biochem-register-container">
      <h2 className="dept-header">Hormones Department — Backup Analyzer</h2>

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
              {hormoneTests.map((test, idx) => (
                <th key={idx}>{test}</th>
              ))}
              <th>Scanned</th>
              <th>Action</th>
            </tr>
          </thead>

          <tbody>
            {filteredPatients.map((p) => (
              <tr
                key={p.id}
                className={
                  p.status === "saved" || p.saved === "Yes"
                    ? "row-green"
                    : p.status === "scanned" || p.scanned === "Yes"
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
                  {p.selectedTests
                    ?.filter((t) =>
                      hormoneTests.includes(
                        typeof t === "string" ? t : t.test
                      )
                    )
                    .map((t) => (typeof t === "string" ? t : t.test))
                    .join(", ") || "—"}
                </td>

                {hormoneTests.map((test, idx2) => (
                  <td key={idx2}>
                    {p.selectedTests?.some(
                      (t) => (typeof t === "string" ? t : t.test) === test
                    ) ? (
                      <input
                        type="text"
                        value={p.results?.[test] || ""}
                        onChange={(e) => handleInputChange(e, p.id, test)}
                        placeholder="Enter result"
                        className="editable-cell"
                        disabled={
                          p.status === "saved" ||
                          p.saved === "Yes" ||
                          p.scanned !== "Yes"
                        }
                      />
                    ) : (
                      "-"
                    )}
                  </td>
                ))}

                <td>
                  <select
                    value={p.scanned || "No"}
                    onChange={(e) => handleScan(p.id, e.target.value)}
                    disabled={p.status === "saved" || p.saved === "Yes"}
                  >
                    <option value="No">No</option>
                    <option value="Yes">Yes</option>
                  </select>
                </td>

                <td>
                  <button
                    className="save-btn"
                    onClick={() => handleSave(p.id)}
                    disabled={p.status === "saved" || p.saved === "Yes"}
                  >
                    💾 Save
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}