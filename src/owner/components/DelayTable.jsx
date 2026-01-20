


import React from "react";

export default function DelayTable({ violators = [] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full delay-table">
        <thead>
          <tr>
            <th>Reg</th>
            <th>Name</th>
            <th>Test</th>
            <th>Dept</th>
            <th>Duration (min)</th>
            <th>Allowed (min)</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {violators.length === 0 ? (
            <tr>
              <td colSpan="7" style={{ textAlign: "center", padding: "20px" }}>
                No SLA violations found.
              </td>
            </tr>
          ) : (
            violators.map((v, idx) => (
              <tr key={v.regNo || idx}>
                <td>{v.regNo}</td>
                <td>{v.name}</td>
                <td>{v.test}</td>
                <td>{v.department}</td>
                <td>{v.duration}</td>
                <td>{v.allowed}</td>
                <td>
                  <span className={`badge ${v.status}`}>
                    {v.status}
                  </span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
