

// src/owner/components/KPIBlocks.jsx
import React from "react";

export default function KPIBlocks({ overview = {}, kpis = {} }) {

  const {
    totalPatientsCollected,
    totalPatientsSaved,
    totalPatientsValidated,
    totalPatientsPendingScans,

    totalTestsCollected,
    totalTestsSaved,
    totalTestsPending,

    avgPrintedToCollected,
    avgCollectedToScanned,
    avgScannedToSaved,
    avgSavedToValidated,

    slowestEntry
  } = kpis;

  return (
    <div className="kpi-row">

      {/* PATIENT METRICS */}
      <div className="kpi-card">
        <div className="kpi-title">Patients Collected</div>
        <div className="kpi-value">{totalPatientsCollected ?? 0}</div>
        <div className="kpi-sub">From master register</div>
      </div>

      <div className="kpi-card">
        <div className="kpi-title">Patients Saved</div>
        <div className="kpi-value">{totalPatientsSaved ?? 0}</div>
        <div className="kpi-sub">Saved in Coag</div>
      </div>

      <div className="kpi-card">
        <div className="kpi-title">Patients Validated</div>
        <div className="kpi-value">{totalPatientsValidated ?? 0}</div>
        <div className="kpi-sub">Validated in Coag</div>
      </div>

      <div className="kpi-card">
        <div className="kpi-title">Pending Scans</div>
        <div className="kpi-value">{totalPatientsPendingScans ?? 0}</div>
        <div className="kpi-sub">Patients awaiting scan</div>
      </div>

      {/* TEST METRICS */}
      <div className="kpi-card">
        <div className="kpi-title">Tests Collected</div>
        <div className="kpi-value">{totalTestsCollected ?? 0}</div>
        <div className="kpi-sub">Master register tests</div>
      </div>

      <div className="kpi-card">
        <div className="kpi-title">Tests Saved</div>
        <div className="kpi-value">{totalTestsSaved ?? 0}</div>
        <div className="kpi-sub">Coag saved tests</div>
      </div>

      <div className="kpi-card">
        <div className="kpi-title">Tests Pending</div>
        <div className="kpi-value">{totalTestsPending ?? 0}</div>
        <div className="kpi-sub">Collected − Saved</div>
      </div>

      {/* TIME KPIs */}
      <div className="kpi-card">
        <div className="kpi-title">Avg Printed → Collected</div>
        <div className="kpi-value">{avgPrintedToCollected ?? "—"} min</div>
        <div className="kpi-sub">Master → Coag collection</div>
      </div>

      <div className="kpi-card">
        <div className="kpi-title">Avg Collected → Scanned</div>
        <div className="kpi-value">{avgCollectedToScanned ?? "—"} min</div>
        <div className="kpi-sub">Time to begin scanning</div>
      </div>

      <div className="kpi-card">
        <div className="kpi-title">Avg Scanned → Saved</div>
        <div className="kpi-value">{avgScannedToSaved ?? "—"} min</div>
        <div className="kpi-sub">Processing time</div>
      </div>

      <div className="kpi-card">
        <div className="kpi-title">Avg Saved → Validated</div>
        <div className="kpi-value">{avgSavedToValidated ?? "—"} min</div>
        <div className="kpi-sub">Validation delay</div>
      </div>

      {/* SLOWEST ENTRY */}
      <div className="kpi-card">
        <div className="kpi-title">Slowest Entry</div>
        <div className="kpi-value">{slowestEntry?.delay ?? "—"} min</div>
        <div className="kpi-sub">
          {slowestEntry ? `Reg No: ${slowestEntry.regNo}` : "No data"}
        </div>
      </div>

    </div>
  );
}