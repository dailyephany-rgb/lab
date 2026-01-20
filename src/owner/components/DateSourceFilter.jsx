

// src/owner/components/DateSourceFilter.jsx

import React, { useContext } from "react";
import { OwnerContext } from "../OwnerContext.jsx";

export default function DateSourceFilter() {
  const { dateRange, setDateRange, source, setSource } =
    useContext(OwnerContext);

  return (
    <div
      className="owner-filter-bar"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "20px",
        alignItems: "center",
        marginBottom: "20px",
      }}
    >
      {/* ---- DATE FROM ---- */}
      <div className="filter-item">
        <label>From</label>
        <input
          type="date"
          value={dateRange.from}
          onChange={(e) =>
            setDateRange({ ...dateRange, from: e.target.value })
          }
        />
      </div>

      {/* ---- DATE TO ---- */}
      <div className="filter-item">
        <label>To</label>
        <input
          type="date"
          value={dateRange.to}
          onChange={(e) =>
            setDateRange({ ...dateRange, to: e.target.value })
          }
        />
      </div>

      {/* ---- SOURCE ---- */}
      <div className="filter-item">
        <label>Source</label>
        <select value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="All">All</option>
          <option value="OPD">OPD</option>
          <option value="IPD">IPD</option>
          <option value="Third Floor">Third Floor</option>
        </select>
      </div>
    </div>
  );
}
