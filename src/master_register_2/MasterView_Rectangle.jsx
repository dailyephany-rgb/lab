
import React, { useEffect, useState, useMemo } from "react";
import { db } from "../firebaseConfig.js";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import "./MasterView_Rectangle.css";

export default function MasterViewCard() {
  const [masterRecords, setMasterRecords] = useState([]);
  const [deptData, setDeptData] = useState({});
  const [expanded, setExpanded] = useState(null);

  const [searchReg, setSearchReg] = useState("");
  const today = new Date().toISOString().split("T")[0];
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [sourceFilter, setSourceFilter] = useState("All");

  // DEPARTMENT COLLECTIONS
  const DEPTS = [
    "biochem_backup",
    "biochemistry_register",
    "bloodgroup_retesting",
    "bloodgroup_testing_register",
    "coagulation_register",
    "esr_register",
    "haematology_register",
    "hormones_backup",
    "hormones_main",
    "rapid_card_register",
    "serology_register",
    "urine_analysis_register",
  ];

  // MASTER REGISTER LISTENER
  useEffect(() => {
    const q = query(
      collection(db, "master_register"),
      orderBy("timePrinted", "desc") // FIX
    );

    const unsub = onSnapshot(q, (snap) => {
      setMasterRecords(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      );
    });

    return () => unsub();
  }, []);

  // DEPARTMENT LISTENERS
  useEffect(() => {
    const unsubArr = [];

    DEPTS.forEach((dept) => {
      const unsub = onSnapshot(collection(db, dept), (snap) => {
        setDeptData((prev) => ({
          ...prev,
          [dept]: snap.docs.map((d) => d.data()),
        }));
      });
      unsubArr.push(unsub);
    });

    return () => unsubArr.forEach((u) => u());
  }, []);

  // Helper
  const findIn = (dept, reg) =>
    (deptData[dept] || []).find((x) => x.regNo === reg);

  // Merge department statuses
  const merged = useMemo(() => {
    return masterRecords.map((rec) => {
      const reg = rec.regNo;
      let statuses = [];

      // BIOCHEM MERGE
      const b1 = findIn("biochemistry_register", reg);
      const b2 = findIn("biochem_backup", reg);

      if (b1 || b2) {
        statuses.push({
          dept: "Biochemistry",
          scanned:
            (b1?.scanned === "Yes") || (b2?.scanned === "Yes") ? "Yes" : "No",
          saved:
            (b1?.saved === "Yes") || (b2?.saved === "Yes") ? "Yes" : "No",
          validated: b1?.validated || b2?.validated || false,
        });
      }

      // HORMONES MERGE
      const h1 = findIn("hormones_main", reg);
      const h2 = findIn("hormones_backup", reg);

      if (h1 || h2) {
        statuses.push({
          dept: "Hormones",
          scanned:
            (h1?.scanned === "Yes") || (h2?.scanned === "Yes") ? "Yes" : "No",
          saved:
            (h1?.saved === "Yes") || (h2?.saved === "Yes") ? "Yes" : "No",
          validated: h1?.validated || h2?.validated || false,
        });
      }

      // BLOOD GROUP (special rule)
      const bg1 = findIn("bloodgroup_testing_register", reg);
      const bg2 = findIn("bloodgroup_retesting", reg);

      if (bg1 || bg2) {
        statuses.push({
          dept: "Blood Group",
          scanned:
            (bg1?.scanned === "Yes") || (bg2?.scanned === "Yes")
              ? "Yes"
              : "No",
          saved:
            (bg1?.saved === "Yes") || (bg2?.saved === "Yes")
              ? "Yes"
              : "No",
          validated: Boolean(bg1?.validated && bg2?.validated),
        });
      }

      // ALL OTHER DEPTS
      [
        "coagulation_register",
        "haematology_register",
        "esr_register",
        "serology_register",
        "rapid_card_register",
        "urine_analysis_register",
      ].forEach((dept) => {
        const e = findIn(dept, reg);
        if (e)
          statuses.push({
            dept,
            scanned: e.scanned || "No",
            saved: e.saved || "No",
            validated: e.validated || false,
          });
      });

      // OVERALL
      const overall = statuses.some((s) => s.validated)
        ? "Validated"
        : statuses.some((s) => s.saved === "Yes")
        ? "Completed"
        : statuses.some((s) => s.scanned === "Yes")
        ? "In Progress"
        : "Pending";

      return { ...rec, deptStatuses: statuses, overallStatus: overall };
    });
  }, [masterRecords, deptData]);

  // FILTER
  const filtered = merged.filter((rec) => {
    if (!rec.regNo) return false;

    const regMatch = rec.regNo
      .toLowerCase()
      .includes(searchReg.toLowerCase());

    let date = rec.timePrinted?.toDate
      ? rec.timePrinted.toDate()
      : new Date(rec.timePrinted);

    const dateStr = date.toISOString().split("T")[0];

    const inRange = dateStr >= fromDate && dateStr <= toDate;

    const sourceOk =
      sourceFilter === "All" ||
      rec.source === sourceFilter;

    return regMatch && inRange && sourceOk;
  });

  const toggle = (id) =>
    setExpanded(expanded === id ? null : id);

  const getColor = (s) =>
    s === "Validated"
      ? "status-blue"
      : s === "Completed"
      ? "status-green"
      : s === "In Progress"
      ? "status-yellow"
      : "status-gray";

  return (
    <div className="master-container">
      <h2>🩺 Master Register — Card View</h2>

      {/* FILTER BAR */}
      <div className="filter-bar master-filter">
        <input
          placeholder="Search Reg No..."
          value={searchReg}
          onChange={(e) => setSearchReg(e.target.value)}
        />

        <label>Date:</label>
        <input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
        />
        <span>to</span>
        <input
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
        />

        <div className="source-buttons">
          {["OPD", "IPD", "Third Floor", "All"].map((s) => (
            <button
              key={s}
              className={sourceFilter === s ? "active" : ""}
              onClick={() => setSourceFilter(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* HEADER ROW */}
      <div className="card-header-row">
        <div>Reg No</div>
        <div>Diagnostic</div>
        <div>Name</div>
        <div>Doctor</div>
        <div>Source</div>
        <div>Phone</div>
        <div>Category</div>
        <div>Status</div>
        <div>Actions</div>
      </div>

      {/* CARDS */}
      {filtered.map((rec) => (
        <div key={rec.id} className="master-card">
          <div className="card-top" onClick={() => toggle(rec.id)}>
            <div>{rec.regNo}</div>
            <div>{rec.diagnosticNo}</div>
            <div>{rec.name}</div>
            <div>{rec.doctor}</div>
            <div>{rec.source}</div>
            <div>{rec.phone}</div>
            <div>{rec.category}</div>

            <div className={`status-tag ${getColor(rec.overallStatus)}`}>
              {rec.overallStatus}
            </div>

            <div className="card-actions">
              <input type="checkbox" />
              <button
                className="whatsapp-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  alert("WhatsApp message!");
                }}
              >
                📤
              </button>
            </div>
          </div>

          {expanded === rec.id && (
            <div className="dropdown-content">
              <h4>🧪 Department Status</h4>
              <table>
                <thead>
                  <tr>
                    <th>Department</th>
                    <th>Scanned</th>
                    <th>Saved</th>
                    <th>Validated</th>
                  </tr>
                </thead>
                <tbody>
                  {rec.deptStatuses.map((d, i) => (
                    <tr key={i}>
                      <td>{d.dept}</td>
                      <td>{d.scanned}</td>
                      <td>{d.saved}</td>
                      <td>{d.validated ? "Yes" : "No"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}

      {filtered.length === 0 && (
        <p className="no-records">No records found…</p>
      )}
    </div>
  );
}