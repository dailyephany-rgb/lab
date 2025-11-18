
import React, { useEffect, useState, useMemo } from "react";
import { db } from "../firebaseConfig.js";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import "./MasterView_Rectangle.css";

export default function MasterViewCard() {
  const [masterRecords, setMasterRecords] = useState([]);
  const [deptData, setDeptData] = useState({});
  const [expanded, setExpanded] = useState(null);
  const [searchReg, setSearchReg] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sourceFilter, setSourceFilter] = useState("All");

  // ✅ Department collections in Firestore
  const DEPARTMENTS = [
    "biochem_backup",
    "biochemistry_register",
    "bloodgroup_retesting",
    "bloodgroup_testing_register",
    "coagulation_register",
    "esr_register",
    "haematology_register",
    "hormones_backup",
    "hormones_main",
    "hormones_register",
    "rapid_card_register",
    "serology_register",
    "urine_analysis_register",
    "backroom_register",
  ];

  // ✅ Default today's date
  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    setFromDate(today);
    setToDate(today);
  }, []);

  // ✅ Live Master Register listener
  useEffect(() => {
    const q = query(collection(db, "master_register"), orderBy("timeSaved", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setMasterRecords(data);
    });
    return () => unsub();
  }, []);

  // ✅ Live Department Listeners
  useEffect(() => {
    const unsubscribers = [];
    DEPARTMENTS.forEach((dept) => {
      const unsub = onSnapshot(collection(db, dept), (snap) => {
        setDeptData((prev) => ({
          ...prev,
          [dept]: snap.docs.map((d) => d.data()),
        }));
      });
      unsubscribers.push(unsub);
    });
    return () => unsubscribers.forEach((u) => u());
  }, []);

  // 🔍 Utility helpers
  const findIn = (dept, regNo) => {
    const list = deptData[dept] || [];
    return list.find((r) => r.regNo === regNo);
  };

  const getDeptStatus = (entry, dept) => ({
    dept,
    scanned: entry.scanned || "No",
    saved: entry.saved || "No",
    validated: entry.validated || false,
  });

  const calculateOverallStatus = (list) => {
    if (list.some((l) => l.validated)) return "Validated";
    if (list.some((l) => l.saved === "Yes")) return "Completed";
    if (list.some((l) => l.scanned === "Yes")) return "In Progress";
    return "Pending";
  };

  // ✅ Merge all department data per record
  const mergedRecords = useMemo(() => {
    return masterRecords.map((rec) => {
      const reg = rec.regNo;
      let statuses = [];

      // 🧪 Biochemistry (Main + Backup merge)
      const bioMain = findIn("biochemistry_register", reg);
      const bioBackup = findIn("biochem_backup", reg);
      if (bioMain || bioBackup) {
        const scanned = bioMain?.scanned === "Yes" || bioBackup?.scanned === "Yes";
        const saved = bioMain?.saved === "Yes" || bioBackup?.saved === "Yes";
        const validated = bioMain?.validated || bioBackup?.validated;
        statuses.push({
          dept: "Biochemistry",
          scanned: scanned ? "Yes" : "No",
          saved: saved ? "Yes" : "No",
          validated,
        });
      }

      // 🧬 Hormones (Main + Backup merge)
      const hMain = findIn("hormones_main", reg);
      const hBackup = findIn("hormones_backup", reg);
      if (hMain || hBackup) {
        const scanned = hMain?.scanned === "Yes" || hBackup?.scanned === "Yes";
        const saved = hMain?.saved === "Yes" || hBackup?.saved === "Yes";
        const validated = hMain?.validated || hBackup?.validated;
        statuses.push({
          dept: "Hormones",
          scanned: scanned ? "Yes" : "No",
          saved: saved ? "Yes" : "No",
          validated,
        });
      }

      // 🩸 Blood Group (requires both confirmed)
      const bg1 = findIn("bloodgroup_testing_register", reg);
      const bg2 = findIn("bloodgroup_retesting", reg);
      if (bg1 || bg2) {
        const validated = bg1?.validated && bg2?.validated;
        const saved = bg1?.saved === "Yes" || bg2?.saved === "Yes";
        const scanned = bg1?.scanned === "Yes" || bg2?.scanned === "Yes";
        statuses.push({
          dept: "Blood Group",
          scanned: scanned ? "Yes" : "No",
          saved: saved ? "Yes" : "No",
          validated,
        });
      }

      // 🧫 Other departments
      [
        "coagulation_register",
        "haematology_register",
        "esr_register",
        "serology_register",
        "rapid_card_register",
        "urine_analysis_register",
        "backroom_register",
      ].forEach((dept) => {
        const entry = findIn(dept, reg);
        if (entry) statuses.push(getDeptStatus(entry, dept));
      });

      // 🔹 Overall status
      const overall = calculateOverallStatus(statuses);

      return { ...rec, deptStatuses: statuses, overallStatus: overall };
    });
  }, [masterRecords, deptData]);

  // ✅ Filters
  const filtered = mergedRecords.filter((rec) => {
    const regMatch =
      !searchReg ||
      (rec.regNo && rec.regNo.toLowerCase().includes(searchReg.toLowerCase()));

    const ts = rec.timeSaved?.toDate
      ? rec.timeSaved.toDate()
      : new Date(rec.timeSaved);

    const fromOk = !fromDate || ts >= new Date(fromDate);
    const toOk = !toDate || ts <= new Date(toDate + "T23:59:59");
    const sourceOk = sourceFilter === "All" || rec.source === sourceFilter;

    return regMatch && fromOk && toOk && sourceOk;
  });

  const toggleExpand = (id) => setExpanded(expanded === id ? null : id);

  const getStatusColor = (status) => {
    if (status === "Validated") return "status-blue";
    if (status === "Completed") return "status-green";
    if (status === "In Progress") return "status-yellow";
    return "status-gray";
  };

  // 🧩 UI Rendering
  return (
    <div className="master-container">
      <h2 className="page-title">🩺 Master Register — Card View</h2>

      {/* 🔍 Filter Bar */}
      <div className="filter-bar master-filter">
        <div className="filter-left">
          <input
            type="text"
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

      {/* Header Row */}
      <div className="card-header-row">
        <div>Reg No</div>
        <div>Diagnostic No</div>
        <div>Name</div>
        <div>Doctor</div>
        <div>Source</div>
        <div>Phone</div>
        <div>Category</div>
        <div>Status</div>
        <div>Actions</div>
      </div>

      {/* Cards */}
      {filtered.length > 0 ? (
        filtered.map((rec) => (
          <div key={rec.id} className="master-card">
            <div className="card-top" onClick={() => toggleExpand(rec.id)}>
              <div>{rec.regNo || "—"}</div>
              <div>{rec.diagnosticNo || "—"}</div>
              <div>{rec.name || "—"}</div>
              <div>{rec.doctor || "—"}</div>
              <div>{rec.source || "—"}</div>
              <div>{rec.phone || "—"}</div>
              <div>{rec.category || "—"}</div>

              <div className={`status-tag ${getStatusColor(rec.overallStatus)}`}>
                {rec.overallStatus}
              </div>

              <div className="card-actions">
                <input type="checkbox" title="Print" />
                <button
                  className="whatsapp-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    alert(`📲 WhatsApp message for ${rec.name}`);
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
                    {rec.deptStatuses.length > 0 ? (
                      rec.deptStatuses.map((d, i) => (
                        <tr key={i}>
                          <td>{d.dept.replace("_register", "")}</td>
                          <td>{d.scanned}</td>
                          <td>{d.saved}</td>
                          <td>{d.validated ? "Yes" : "No"}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="4">No department data found</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))
      ) : (
        <p className="no-records">No records found for selected filters.</p>
      )}
    </div>
  );
}