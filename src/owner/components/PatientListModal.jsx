
import React from "react";

export default function PatientListModal({open, onClose, patients}) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <h3>Patient / Test Details</h3>
        <button onClick={onClose}>Close</button>
        <table>
          <thead><tr><th>Reg</th><th>Name</th><th>Test</th><th>Dept</th><th>Printed</th><th>Scanned</th><th>Saved</th><th>Validated</th></tr></thead>
          <tbody>
            {patients.map((p, i) => (
              <tr key={i}>
                <td>{p.regNo}</td>
                <td>{p.name}</td>
                <td>{p.test}</td>
                <td>{p.department}</td>
                <td>{p.timePrinted? new Date(p.timePrinted).toLocaleString(): "—"}</td>
                <td>{p.timeScanned? new Date(p.timeScanned).toLocaleString(): "—"}</td>
                <td>{p.timeSaved? new Date(p.timeSaved).toLocaleString(): "—"}</td>
                <td>{p.timeValidated? new Date(p.timeValidated).toLocaleString(): "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}