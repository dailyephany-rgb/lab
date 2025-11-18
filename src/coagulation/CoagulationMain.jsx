

import React, { useEffect, useState } from "react";
import "./CoagulationMain.css";
import { db } from "../firebaseConfig.js";
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";
import coagRouting from "../coag_testRouting.json";

export default function CoagulationMain() {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savedSet, setSavedSet] = useState(new Set());
  const [localScans, setLocalScans] = useState({});
  const [regSearch, setRegSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sourceFilter, setSourceFilter] = useState("All");

  const coagTests = coagRouting.Analyzer?.tests || coagRouting?.tests || [];
  const getTestName = (t) => (typeof t === "string" ? t : t?.test || "");

  // Auto set today's date
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    setDateFrom(today);
    setDateTo(today);
  }, []);

  const normalizeSource = (raw) => {
    if (!raw) return "Unknown";
    const s = raw.trim().toLowerCase();
    if (s.includes("opd")) return "OPD";
    if (s.includes("ipd")) return "IPD";
    if (s.includes("third") || s.includes("3rd")) return "Third Floor";
    return "Unknown";
  };

  const extractSource = (entry) => {
    if (entry?.source) return normalizeSource(entry.source);
    if (Array.isArray(entry.selectedTests) && entry.selectedTests.length > 0) {
      const fromTest = entry.selectedTests.find(
        (t) => t?.source && typeof t.source === "string"
      );
      if (fromTest) return normalizeSource(fromTest.source);
    }
    return "Unknown";
  };

  const isCoagTestName = (name) => {
    if (!name) return false;
    const lower = name.toLowerCase();
    return coagTests.some((ref) =>
      lower.includes(ref.split("(")[0].trim().toLowerCase())
    );
  };

  const getRelevantCoagTests = (patient) => {
    const arr =
      patient.selectedTests || patient.testsSelected || patient.tests || [];
    return arr.map(getTestName).filter((nm) => isCoagTestName(nm));
  };

  const parseDate = (entry) => {
    const fields = [
      entry.savedTime,
      entry.scannedTime,
      entry.createdAt,
      entry.timePrinted,
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

  // ✅ Realtime listener
  useEffect(() => {
    const unsubMaster = onSnapshot(
      collection(db, "master_register"),
      async (snapshot) => {
        const all = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

        const filtered = all.filter((entry) => {
          const arr =
            entry.selectedTests || entry.testsSelected || entry.tests || [];
          return arr.some((t) => isCoagTestName(getTestName(t)));
        });

        const merged = await Promise.all(
          filtered.map(async (entry) => {
            const idKey = String(entry.regNo || entry.regno || entry.id);
            const ref = doc(db, "coagulation_register", idKey);
            const snap = await getDoc(ref);

            const masterSource = extractSource(entry);
            const rawSource =
              entry.source ||
              (entry.selectedTests && entry.selectedTests[0]?.source) ||
              "";

            const timePrinted =
              entry.timePrinted && entry.timePrinted.toDate
                ? entry.timePrinted.toDate().toISOString()
                : entry.timePrinted || null;

            if (snap.exists()) {
              const saved = snap.data();

              // ✅ Normalize uppercase field names to lowercase for UI
              const normalized = {
                bt: saved.bt ?? saved.BT ?? "",
                ct: saved.ct ?? saved.CT ?? "",
                pt: saved.pt ?? saved.PT ?? "",
                inr: saved.inr ?? saved.INR ?? "",
                aptt: saved.aptt ?? saved.APTT ?? "",
              };

              return {
                ...entry,
                ...saved,
                ...normalized,
                timePrinted: saved.timePrinted || timePrinted || null,
                source: saved.source || masterSource,
                rawSource,
                origin: "coagulation_register",
                scanned: localScans[idKey] ?? saved.scanned ?? "No",
                status: saved.status || "saved",
              };
            } else {
              return {
                ...entry,
                source: masterSource,
                rawSource,
                origin: "master_register",
                scanned: localScans[idKey] ?? "No",
                status: "pending",
                timePrinted,
              };
            }
          })
        );

        const unique = new Map();
        merged.forEach((entry) => {
          const key = entry.regNo || entry.regno || entry.id;
          if (!unique.has(key)) {
            unique.set(key, entry);
          } else {
            const existing = unique.get(key);
            if (
              existing.origin === "master_register" &&
              entry.origin === "coagulation_register"
            ) {
              unique.set(key, entry);
            }
          }
        });

        setPatients(Array.from(unique.values()));
        setLoading(false);
      }
    );

    const unsubCoag = onSnapshot(collection(db, "coagulation_register"), (snap) => {
      const s = new Set();
      snap.docs.forEach((d) => s.add(d.id));
      setSavedSet(s);
    });

    return () => {
      unsubMaster();
      unsubCoag();
    };
  }, [localScans]);

  // ✅ Save entry (with scannedTime)
  const handleSave = async (patient) => {
    try {
      const regNo = String(patient.regNo || patient.regno || patient.id);
      const ref = doc(db, "coagulation_register", regNo);
      const relevant = getRelevantCoagTests(patient);

      const scannedTimeValue =
        patient.scanned === "Yes"
          ? patient.scannedTime || new Date().toISOString()
          : null;

      const payload = {
        regNo,
        name: patient.name || "",
        age: patient.age || "",
        gender: patient.gender || "-",
        source: patient.source || "-",
        selectedTests: relevant,
        BT: patient.bt ?? "",
        CT: patient.ct ?? "",
        PT: patient.pt ?? "",
        INR: patient.inr ?? "",
        APTT: patient.aptt ?? "",
        scanned: patient.scanned || "No",
        scannedTime: scannedTimeValue,
        saved: "Yes",
        savedTime: serverTimestamp(),
        timePrinted: patient.timePrinted || null,
        status: "saved",
      };

      await setDoc(ref, payload, { merge: true });

      setPatients((prev) =>
        prev.map((p) =>
          p.regNo === patient.regNo ? { ...p, ...payload } : p
        )
      );

      alert(`✅ Saved Coagulation entry for ${patient.name || patient.regNo}`);
    } catch (err) {
      console.error("❌ Error saving:", err);
    }
  };

  const isFieldEditable = (tests, field) => {
    const joined = tests.join(" ").toLowerCase();
    if (field === "bt" || field === "ct") return false;
    if (field === "pt" || field === "inr")
      return (
        joined.includes("prothrombin") ||
        joined.includes("pt-inr") ||
        joined.includes("coagulation profile")
      );
    if (field === "aptt")
      return joined.includes("aptt") || joined.includes("coagulation profile");
    return false;
  };

  const filteredPatients = patients.filter((p) => {
    if (regSearch.trim()) {
      const key = String(p.regNo || p.id || "").toLowerCase();
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

  if (loading) return <p>Loading Coagulation data...</p>;

  return (
    <div className="coag-container">
      <h2 className="title">Coagulation Department</h2>

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

      {/* Table */}
      <table className="coag-table">
        <thead>
          <tr>
            <th>Reg No</th>
            <th>Name</th>
            <th>Age</th>
            <th>Gender</th>
            <th>Source</th>
            <th>Origin</th>
            <th>Tests</th>
            <th>BT</th>
            <th>CT</th>
            <th>PT</th>
            <th>INR</th>
            <th>APTT</th>
            <th>Scanned</th>
            <th>Action</th>
          </tr>
        </thead>

        <tbody>
          {filteredPatients.map((p) => {
            const relevant = getRelevantCoagTests(p);
            const key = String(p.regNo || p.id);
            const isSaved = savedSet.has(key);
            const isScanned =
              localScans[key] === "Yes" || p.scanned === "Yes";

            const renderField = (field) => {
              if (!isFieldEditable(relevant, field)) return <span>–</span>;
              return (
                <input
                  type="text"
                  value={p[field] || ""}
                  disabled={isSaved}
                  className={isSaved ? "locked-input" : ""}
                  onChange={(e) =>
                    setPatients((prev) =>
                      prev.map((x) =>
                        x.regNo === p.regNo
                          ? { ...x, [field]: e.target.value }
                          : x
                      )
                    )
                  }
                />
              );
            };

            return (
              <tr
                key={p.id}
                className={isSaved ? "row-green" : isScanned ? "row-yellow" : ""}
              >
                <td>{p.regNo || "-"}</td>
                <td>{p.name || "-"}</td>
                <td>{p.age || "-"}</td>
                <td>{p.gender || "-"}</td>
                <td>{p.source || "-"}</td>
                <td style={{ color: "gray" }}>{p.origin}</td>
                <td>{relevant.join(", ") || "-"}</td>

                <td>{renderField("bt")}</td>
                <td>{renderField("ct")}</td>
                <td>{renderField("pt")}</td>
                <td>{renderField("inr")}</td>
                <td>{renderField("aptt")}</td>

                <td>
                  <select
                    value={isScanned ? "Yes" : "No"}
                    disabled={isSaved}
                    onChange={(e) => {
                      const value = e.target.value;
                      setLocalScans((prev) => ({
                        ...prev,
                        [key]: value,
                      }));
                      setPatients((prev) =>
                        prev.map((x) =>
                          x.regNo === p.regNo
                            ? { ...x, scanned: value }
                            : x
                        )
                      );
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
          })}
        </tbody>
      </table>
    </div>
  );
}