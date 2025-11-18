

import React, { useState, useEffect } from "react";
import "./ValidatorDashboard.css";

export default function ValidatorTable({ title, data, onValidate }) {
  const safeData = Array.isArray(data) ? data : [];

  // ✅ Default date
  const getToday = () => new Date().toISOString().split("T")[0];
  const [dateFrom, setDateFrom] = useState(getToday());
  const [dateTo, setDateTo] = useState(getToday());
  const [sourceFilter, setSourceFilter] = useState("All");
  const [searchReg, setSearchReg] = useState("");

  // 🌙 Auto update at midnight
  useEffect(() => {
    const scheduleMidnightUpdate = () => {
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
        scheduleMidnightUpdate(); // reschedule next day
      }, msUntilMidnight);

      return timer;
    };

    const timerId = scheduleMidnightUpdate();
    return () => clearTimeout(timerId);
  }, []);

  // 🔹 Case-insensitive helper for test list
  const getTestList = (entry) => {
    const testField =
      entry.selectedTests ||
      entry.tests ||
      entry.test ||
      entry.Test ||
      [];

    if (Array.isArray(testField)) return testField.join(", ");
    if (typeof testField === "object" && testField !== null)
      return Object.entries(testField)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
    if (typeof testField === "string") return testField;
    return "—";
  };

  // 🔹 SMART universal result handler
  const getResultText = (entry) => {
    const results = entry.results || entry.result || {};

    // Case 1: results object (Serology, Urine, Rapid)
    if (
      typeof results === "object" &&
      results !== null &&
      Object.keys(results).length > 0
    ) {
      return Object.entries(results)
        .map(([k, v]) => `${k.toUpperCase()}: ${v}`)
        .join(", ");
    }

    // Case 2: single string (Biochemistry)
    if (typeof results === "string" && results.trim() !== "") return results;

    // Case 3: Coagulation, Blood Group etc. (flat fields, any case)
    const deptKeys = [
      "bt",
      "ct",
      "aptt",
      "pt",
      "inr",
      "bloodGroup",
      "rhFactor",
      "remarks",
    ];

    const found = deptKeys
      .map((key) => {
        const matchKey = Object.keys(entry).find(
          (k) => k.toLowerCase() === key.toLowerCase()
        );
        if (
          matchKey &&
          entry[matchKey] &&
          entry[matchKey] !== "" &&
          entry[matchKey] !== "-"
        ) {
          return `${matchKey.toUpperCase()}: ${entry[matchKey]}`;
        }
        return null;
      })
      .filter(Boolean);

    if (found.length > 0) return found.join(", ");

    return "—";
  };

  // 🔹 Filtering logic
  const filteredData = safeData.filter((entry) => {
    const entryDate = entry.savedTime
      ? new Date(entry.savedTime.seconds * 1000)
      : entry.savedAt
      ? new Date(entry.savedAt)
      : null;

    const entryDateStr = entryDate
      ? entryDate.toISOString().split("T")[0]
      : null;

    const inDateRange =
      !entryDateStr || (entryDateStr >= dateFrom && entryDateStr <= dateTo);

    const matchesSource =
      sourceFilter === "All" ||
      (entry.source || entry.category || "")
        .toLowerCase()
        .includes(sourceFilter.toLowerCase());

    const matchesSearch =
      !searchReg ||
      (entry.regNo || "").toLowerCase().includes(searchReg.toLowerCase());

    return inDateRange && matchesSource && matchesSearch;
  });

  // 🧾 Render
  return (
    <div className="validator-table-container">
      <h3 className="validator-table-title">{title}</h3>

      {/* 🔹 Filters */}
      <div className="validator-filter-bar">
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

      {/* 🔹 Table */}
      {filteredData.length > 0 ? (
        <table className="validator-table">
          <thead>
            <tr>
              <th>Reg No</th>
              <th>Patient Name</th>
              <th>Age</th>
              <th>Source</th>
              <th>Selected Tests</th>
              <th>Results</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredData.map((entry) => {
              const status = (entry.status || "").toLowerCase();
              const validated = entry.validated || status === "validated";

              return (
                <tr
                  key={entry.id || entry.regNo}
                  className={validated ? "row-validated" : "row-saved"}
                >
                  <td>{entry.regNo || "—"}</td>
                  <td>{entry.name || "—"}</td>
                  <td>{entry.age || "—"}</td>
                  <td>{entry.source || entry.category || "—"}</td>
                  <td>{getTestList(entry)}</td>
                  <td>{getResultText(entry)}</td>
                  <td>
                    <button
                      className={`validate-btn ${validated ? "validated" : ""}`}
                      onClick={() => onValidate(entry)}
                      disabled={validated}
                    >
                      {validated ? "✅ Validated" : "Validate"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="no-entries">
          No saved entries found for the selected filters.
        </p>
      )}
    </div>
  );
}