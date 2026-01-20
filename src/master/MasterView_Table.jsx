
import React, { useEffect, useState } from "react";
import "./MasterView_Table.css";
import { db } from "../firebaseConfig.js";
import { collection, onSnapshot, orderBy, query, doc, deleteDoc } from "firebase/firestore";

export default function MasterView_Table() {
  const [entries, setEntries] = useState([]);
  const today = new Date().toISOString().split("T")[0];
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [sourceFilter, setSourceFilter] = useState("All");
  const [searchReg, setSearchReg] = useState("");

  useEffect(() => {
    const q = query(collection(db, "master_register"), orderBy("timePrinted", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setEntries(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsub();
  }, []);

  // --- EDIT FEATURE ---
  const handleEdit = (entry) => {
    localStorage.setItem("editPatientData", JSON.stringify(entry));
    window.location.href = "/"; 
  };

  // --- NEW DELETE FEATURE ---
  const handleDelete = async (regNo, name) => {
    const confirmDelete = window.confirm(`Are you sure you want to delete the entry for ${name} (Reg: ${regNo})? This cannot be undone.`);
    
    if (confirmDelete) {
      try {
        await deleteDoc(doc(db, "master_register", regNo));
        alert("✅ Entry deleted successfully.");
      } catch (error) {
        console.error("Error deleting document: ", error);
        alert("❌ Failed to delete the entry. Please try again.");
      }
    }
  };

  const filteredEntries = entries.filter((entry) => {
    let entryDate = entry.timePrinted?.toDate ? entry.timePrinted.toDate() : new Date(entry.timePrinted);
    const entryDateStr = entryDate ? entryDate.toISOString().split("T")[0] : null;
    const inRange = !entryDateStr || (entryDateStr >= dateFrom && entryDateStr <= dateTo);
    const matchesSource = sourceFilter === "All" || entry.source?.toLowerCase() === sourceFilter.toLowerCase();
    const matchesReg = !searchReg || entry.regNo?.toLowerCase().includes(searchReg.toLowerCase());
    return inRange && matchesSource && matchesReg;
  });

  return (
    <div className="master-container">
      <div className="header-bar"><h2>📋 Master Register — Table View</h2></div>
      <div className="filter-bar">
        <input type="text" placeholder="Search Reg No..." value={searchReg} onChange={(e) => setSearchReg(e.target.value)} />
        <label>Date:</label>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <span>to</span>
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        <div className="source-buttons">
          {["OPD", "IPD", "Third Floor", "All"].map((src) => (
            <button key={src} className={sourceFilter === src ? "active" : ""} onClick={() => setSourceFilter(src)}>{src}</button>
          ))}
        </div>
      </div>

      <div className="table-wrapper">
        <table className="master-table">
          <thead>
            <tr>
              <th>Reg No</th><th>Diagnostic No</th><th>Name</th><th>Father</th><th>Doctor</th><th>Category</th><th>Source</th><th>Tests</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredEntries.map((e) => (
              <tr key={e.id}>
                <td>{e.regNo}</td><td>{e.diagnosticNo}</td><td>{e.name}</td><td>{e.father}</td><td>{e.doctor}</td><td>{e.category}</td><td>{e.source}</td>
                <td>
                  {e.selectedTests?.length > 0 ? (
                    <ul>{e.selectedTests.map((t, i) => <li key={i}>{t.dept}—{t.test}</li>)}</ul>
                  ) : "—"}
                </td>
                <td className="action-cell">
                  <div className="action-btns-wrapper">
                    <button className="edit-btn-action" title="Edit Entry" onClick={() => handleEdit(e)}>✏️</button>
                    <button className="delete-btn-action" title="Delete Entry" onClick={() => handleDelete(e.regNo, e.name)}>🗑️</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


