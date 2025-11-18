

import React, { useEffect, useState } from "react";
import "./MasterView_Table.css";
import { db } from "../firebaseConfig.js";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";

export default function MasterView_Table() {
  const [entries, setEntries] = useState([]);

  // 🔹 Date + Filters
  const getToday = () => new Date().toISOString().split("T")[0];
  const [dateFrom, setDateFrom] = useState(getToday());
  const [dateTo, setDateTo] = useState(getToday());
  const [sourceFilter, setSourceFilter] = useState("All");
  const [searchReg, setSearchReg] = useState("");

  // 🔥 Real-time Firestore updates
  useEffect(() => {
    const q = query(
      collection(db, "master_register"),
      orderBy("timeSaved", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setEntries(data);
    });

    return () => unsubscribe();
  }, []);

  // 🌙 Auto reset filters at midnight
  useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
      0,
      0,
      5
    );
    const msUntilMidnight = nextMidnight.getTime() - now.getTime();

    const timer = setTimeout(() => {
      const newDate = getToday();
      setDateFrom(newDate);
      setDateTo(newDate);
    }, msUntilMidnight);

    return () => clearTimeout(timer);
  }, []);

  // 🔍 Filter logic
  const filteredEntries = entries.filter((entry) => {
    const entryDate = entry.timeSaved?.toDate
      ? entry.timeSaved.toDate()
      : entry.timeSaved?._seconds
      ? new Date(entry.timeSaved._seconds * 1000)
      : null;

    const entryDateStr = entryDate
      ? entryDate.toISOString().split("T")[0]
      : null;

    const inDateRange =
      !entryDateStr ||
      (entryDateStr >= dateFrom && entryDateStr <= dateTo);

    const matchesSource =
      sourceFilter === "All" ||
      (entry.source || "")
        .toLowerCase()
        .includes(sourceFilter.toLowerCase());

    const matchesSearch =
      !searchReg ||
      (entry.regNo || "")
        .toLowerCase()
        .includes(searchReg.toLowerCase());

    return inDateRange && matchesSource && matchesSearch;
  });

  return (
    <div className="master-container">
      {/* 🧾 Header */}
      <div className="header-bar">
        <h2>📋 Master Register View</h2>
        <div className="header-actions">
          <button className="btn print">🖨 Print Labels</button>
          <button
            className="btn refresh"
            onClick={() => window.location.reload()}
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* 🔹 Filters Bar */}
      <div className="filter-bar">
        <input
          type="text"
          placeholder="Search Reg No..."
          value={searchReg}
          onChange={(e) => setSearchReg(e.target.value)}
        />

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

      {/* 🧮 Table */}
      <div className="table-wrapper">
        <table className="master-table">
          <thead>
            <tr>
              <th>Reg No</th>
              <th>Diagnostic No</th>
              <th>Patient Name</th>
              <th>Father / Husband</th>
              <th>Doctor</th>
              <th>Category</th>
              <th>Source</th>
              <th>Selected Tests</th>
            </tr>
          </thead>

          <tbody>
            {filteredEntries.length > 0 ? (
              filteredEntries.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.regNo || "—"}</td>
                  <td>{entry.diagnosticNo || "—"}</td>
                  <td>{entry.name || "—"}</td>
                  <td>{entry.father || "—"}</td>
                  <td>{entry.doctor || "—"}</td>
                  <td>{entry.category || "—"}</td>
                  <td>{entry.source || "—"}</td>

                  <td>
                    {entry.selectedTests?.length > 0 ? (
                      <ul>
                        {entry.selectedTests.map((t, i) => (
                          <li key={i}>
                            {t.dept} — {t.test}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="8" className="no-data">
                  No records found for selected filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}