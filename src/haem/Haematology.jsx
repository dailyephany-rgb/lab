

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
} from "firebase/firestore";

export default function Haematology() {
  const [activeTab, setActiveTab] = useState("3-part");
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);

  const [regSearch, setRegSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sourceFilter, setSourceFilter] = useState("All");

  const HAEM_TESTS_CANON = [
    "haemogram",
    "hb haemoglobin",
    "lamellar body count",
  ];

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

  // ✅ Include timePrinted in date parsing
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

  // ✅ Add timePrinted from master_register
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "master_register"), async (snap) => {
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

          const ref = doc(db, "haematology_register", String(regNo));
          const snapDoc = await getDoc(ref);

          // ✅ Extract timePrinted
          const timePrinted =
            entry.timePrinted && entry.timePrinted.toDate
              ? entry.timePrinted.toDate().toISOString()
              : entry.timePrinted || null;

          const base = {
            ...entry,
            regNo: String(regNo),
            source: normalizeSource(entry.source || entry.category),
            scanned: "No",
            status: "pending",
            timePrinted, // ✅ Add here
          };

          if (snapDoc.exists()) {
            const data = snapDoc.data();
            return { ...base, ...data, timePrinted: data.timePrinted || timePrinted };
          }
          return base;
        })
      );

      setPatients(merged);
      setLoading(false);
    });

    return () => unsub();
  }, []);

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

      const ref = doc(db, "haematology_register", String(regNo));
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
      console.error("❌ handleScan error:", err);
    }
  };

  // ✅ Include timePrinted in save payload
  const handleSave = async (id) => {
    try {
      const patient = patients.find((p) => p.id === id);
      if (!patient) return;

      const canonicalTests = getEntryCanonicalTests(patient);
      const regNo =
        patient.regNo ||
        patient.regno ||
        patient.RegNo ||
        patient.Regno ||
        patient.id;

      const payload = {
        regNo: String(regNo),
        name: patient.name || "",
        age: patient.age || "",
        gender: patient.gender || "-",
        source: patient.source || patient.category || "-",
        selectedTests: canonicalTests,
        scanned: patient.scanned || "No",
        scannedTime:
          patient.scanned === "Yes"
            ? patient.scannedTime || new Date().toISOString()
            : null,
        saved: "Yes",
        savedTime: serverTimestamp(),
        timePrinted: patient.timePrinted || null, // ✅ Preserve printed time
        status: "saved",
      };

      await setDoc(doc(db, "haematology_register", String(regNo)), payload, {
        merge: true,
      });

      setPatients((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...payload } : p))
      );

      alert(`✅ Saved Haematology entry for ${payload.name || payload.regNo}`);
    } catch (err) {
      console.error("❌ handleSave error:", err);
      alert("Error saving Haematology entry.");
    }
  };

  const threePart = patients.filter((p) => Number(p.age) < 1);
  const fivePart = patients.filter((p) => Number(p.age) >= 1);

  const filteredPatients = (activeTab === "3-part" ? threePart : fivePart).filter((p) => {
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
            3-Part Machine
          </button>
          <button
            className={activeTab === "5-part" ? "active" : ""}
            onClick={() => setActiveTab("5-part")}
          >
            5-Part Machine
          </button>
        </div>
      </div>

      {/* ✅ New Filter Bar */}
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
                const selCanon = getEntryCanonicalTests(p);
                const rowClass =
                  p.status?.toLowerCase() === "saved" || p.saved === "Yes"
                    ? "row-saved"
                    : p.status?.toLowerCase() === "scanned" ||
                      p.scanned === "Yes"
                    ? "row-scanned"
                    : "";

                return (
                  <tr key={p.id} className={rowClass}>
                    <td>{p.regNo || "—"}</td>
                    <td>{p.name || "—"}</td>
                    <td>{p.age || "—"}</td>
                    <td>{p.gender || "-"}</td>
                    <td>{p.source || p.category || "—"}</td>
                    <td>
                      {selCanon.length
                        ? selCanon.map((s) => s.toUpperCase()).join(", ")
                        : "—"}
                    </td>
                    <td>{selCanon.some((t) => normalize(t).includes("haemogram")) ? "✅" : "—"}</td>
                    <td>{selCanon.some((t) => normalize(t).includes("hb haemoglobin")) ? "✅" : "—"}</td>
                    <td>{selCanon.some((t) => normalize(t).includes("lamellar body count")) ? "✅" : "—"}</td>

                    <td>
                      <select
                        value={p.scanned || "No"}
                        disabled={p.status === "saved" || p.saved === "Yes"}
                        onChange={(e) => handleScan(p.id, e.target.value)}
                      >
                        <option value="No">No</option>
                        <option value="Yes">Yes</option>
                      </select>
                    </td>

                    <td>
                      <button
                        className="mark-done"
                        onClick={() => handleSave(p.id)}
                        disabled={p.status === "saved" || p.saved === "Yes"}
                      >
                        💾 Save
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="11" style={{ textAlign: "center", color: "#6b7280", padding: 20 }}>
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