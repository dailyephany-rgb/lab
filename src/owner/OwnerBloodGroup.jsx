

// src/owner/OwnerBloodGroupPage.jsx
// Blood Group Analytics (Testing + Retesting)
// FIXED: Date filter now strictly depends on timePrinted only.

import React, { useEffect, useMemo, useState, useContext } from "react";
import { OwnerContext } from "./OwnerContext.jsx";
import DateSourceFilter from "./components/DateSourceFilter";
import KPIBlocks from "./components/KPIBlocks";
import PatientListModal from "./components/PatientListModal";
import DelayTable from "./components/DelayTable";
import CountsBar from "./charts/CountsBar";
import StackedStageLines from "./charts/StackedStageLines";
import TimeBricks from "./charts/TimeBricks";
import DelayHistogram from "./charts/DelayHistogram";
import SLAScoreDonut from "./charts/SLAScoreDonut";

// --- DATA FETCHERS ---
import * as TestingFetcher from "./lib/dataFetcher_bloodgroup_testing.js";
import * as RetestingFetcher from "./lib/dataFetcher_bloodgroup_retesting.js";

const toMinutes = (a, b, toDateFn) => {
  const A = toDateFn(a);
  const B = toDateFn(b);
  return A && B && B > A ? Math.round((B - A) / 60000) : null;
};

export default function OwnerBloodGroupPage() {
  const { dateRange, source } = useContext(OwnerContext);

  // ------------------ TOP LEVEL TABS ------------------
  const [mode, setMode] = useState("testing"); // testing | retesting
  const [activeTab, setActiveTab] = useState("overview");

  // ------------------ DATA STATE ------------------
  const [rawUnifiedRows, setRawUnifiedRows] = useState([]);
  const [fetchedKpis, setFetchedKpis] = useState(null);
  const [testTimings, setTestTimings] = useState({});

  const [openModal, setOpenModal] = useState(false);
  const [modalData, setModalData] = useState([]);

  // ------------------ PICK FETCHER ------------------
  const Fetcher = mode === "testing" ? TestingFetcher : RetestingFetcher;

  const {
    subscribeOverview,
    fetchTestTimings,
    computeSLAViolations,
    toDate,
    mergeDeptRows,
    normalizeTestsField,
  } = Fetcher;

  // ------------------ FIRESTORE SUBSCRIBE ------------------
  useEffect(() => {
    const unsub = subscribeOverview({
      source,
      dateRange,
      onData: (payload = {}) => {
        if (payload.unifiedRows)
          setRawUnifiedRows(payload.unifiedRows || []);
        if (payload.kpis) setFetchedKpis(payload.kpis);
      },
    });

    fetchTestTimings().then((t) => setTestTimings(t || {}));
    return () => unsub && unsub();
  }, [source, dateRange, mode, subscribeOverview, fetchTestTimings]);

  // ------------------ MERGE ROWS ------------------
  const mergedRows = useMemo(
    () => mergeDeptRows(rawUnifiedRows),
    [rawUnifiedRows, mergeDeptRows]
  );

  // ------------------ FILTER ROWS (FIXED: Filter by timePrinted only) ------------------
  const deptRows = useMemo(() => {
    const from = dateRange.from ? toDate(dateRange.from + "T00:00:00") : null;
    const toVal = dateRange.to ? toDate(dateRange.to + "T23:59:59") : null;

    return mergedRows.filter((r) => {
      // Check timePrinted for date range
      const printedAt = toDate(r.timePrinted);
      if (from && printedAt && printedAt < from) return false;
      if (toVal && printedAt && printedAt > toVal) return false;

      // Source Filter
      if (
        source !== "All" &&
        (r.source || "").trim().toUpperCase() !== source.toUpperCase()
      )
        return false;

      return true;
    });
  }, [mergedRows, dateRange, source, toDate]);

  // ------------------ UNIQUE COUNTS ------------------
  const uniqueCounts = useMemo(
    () => ({
      printed: new Set(deptRows.map((r) => r.regNo)).size,
      scanned: deptRows.filter((r) => r.timeScanned).length,
      saved: new Set(deptRows.filter((r) => r.timeSaved).map((r) => r.regNo)).size,
      validated: new Set(deptRows.filter((r) => r.timeValidated).map((r) => r.regNo)).size,
    }),
    [deptRows]
  );

  const countTests = (r) => normalizeTestsField(r.tests || r.test).length;

  // ------------------ KPI CALCULATIONS ------------------
  const kpisToUse = useMemo(() => {
    const rows = deptRows;
    const printedToCollected = [];
    const collectedToScanned = [];
    const scannedToSaved = [];
    const savedToValidated = [];

    rows.forEach((r) => {
      const A = toMinutes(r.timePrinted, r.timeCollected, toDate);
      const B = toMinutes(r.timeCollected, r.timeScanned, toDate);
      const C = toMinutes(r.timeScanned, r.timeSaved, toDate);
      const D = toMinutes(r.timeSaved, r.timeValidated, toDate);

      if (A != null) printedToCollected.push(A);
      if (B != null) collectedToScanned.push(B);
      if (C != null) scannedToSaved.push(C);
      if (D != null) savedToValidated.push(D);
    });

    const avg = (arr) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;

    const totalTestsCollected = fetchedKpis?.totalTestsCollected ?? 0;
    const totalTestsSaved = rows.reduce((s, r) => (r.timeSaved ? s + countTests(r) : s), 0);

    let slowestEntry = null;
    rows.forEach((r) => {
      const delay = toMinutes(r.timeScanned, r.timeSaved, toDate);
      if (delay != null && (!slowestEntry || delay > slowestEntry.delay)) {
        slowestEntry = {
          regNo: r.regNo,
          delay,
          tests: normalizeTestsField(r.tests),
          timeScanned: r.timeScanned,
          timeSaved: r.timeSaved,
          patientName: r.patientName,
        };
      }
    });

    return {
      totalPatientsSaved: uniqueCounts.saved,
      totalPatientsValidated: uniqueCounts.validated,
      totalPatientsPendingScans: Math.max(0, (fetchedKpis?.totalPatientsCollected ?? 0) - uniqueCounts.saved),
      totalTestsCollected,
      totalTestsSaved,
      totalTestsPending: Math.max(0, totalTestsCollected - totalTestsSaved),
      avgPrintedToCollected: avg(printedToCollected),
      avgCollectedToScanned: avg(collectedToScanned),
      avgScannedToSaved: avg(scannedToSaved),
      avgSavedToValidated: avg(savedToValidated),
      slowestEntry,
    };
  }, [deptRows, fetchedKpis, uniqueCounts, normalizeTestsField, toDate]);

  // ------------------ SLA ------------------
  const violators = useMemo(
    () => computeSLAViolations(deptRows, testTimings, "scanned_to_saved"),
    [deptRows, testTimings, computeSLAViolations]
  );

  // ------------------ COUNTS ------------------
  const countsForBar = {
    totalPrinted: fetchedKpis?.totalPatientsCollected ?? uniqueCounts.printed,
    scanned: uniqueCounts.scanned,
    saved: uniqueCounts.saved,
    validated: uniqueCounts.validated,
  };

  const overviewForKPI = {
    totalPrinted: uniqueCounts.printed,
    scanned: countsForBar.scanned,
    saved: uniqueCounts.saved,
    validated: uniqueCounts.validated
  };

  const finalKpis = {
    ...kpisToUse,
    totalPatientsCollected: fetchedKpis?.totalPatientsCollected ?? 0,
    totalTestsCollected: fetchedKpis?.totalTestsCollected ?? 0
  };

  return (
    <div className="owner-root">
      <header className="owner-header">
        <h1>Blood Group — Analytics</h1>

        {/* 🛠️ UPDATED: Wrapped in tab-buttons container */}
        <div className="tab-buttons">
          <button className={mode === "testing" ? "active" : ""} onClick={() => setMode("testing")}>Testing</button>
          <button className={mode === "retesting" ? "active" : ""} onClick={() => setMode("retesting")}>Retesting</button>
        </div>

        {/* 🛠️ UPDATED: Wrapped in tab-buttons container and cleaned up inline style */}
        <div className="tab-buttons" style={{ marginTop: 12 }}>
          <button className={activeTab === "overview" ? "active" : ""} onClick={() => setActiveTab("overview")}>Overview</button>
          <button className={activeTab === "delays" ? "active" : ""} onClick={() => setActiveTab("delays")}>Delays</button>
          <button className={activeTab === "timebricks" ? "active" : ""} onClick={() => setActiveTab("timebricks")}>Time Bricks</button>
        </div>
      </header>

      <DateSourceFilter />
      <KPIBlocks overview={overviewForKPI} kpis={finalKpis} />

      {activeTab === "overview" && (
        <section className="owner-charts">
          <div className="chart-card">
            <h3>Counts ({mode === "testing" ? "Testing" : "Retesting"})</h3>
            <CountsBar counts={countsForBar} />
          </div>
          <div className="chart-card">
            <h3>Stage Timeline</h3>
            <StackedStageLines unifiedRows={deptRows} />
          </div>
        </section>
      )}

      {activeTab === "delays" && (
        <section className="owner-charts">
          <div className="chart-card">
            <DelayHistogram violators={violators} />
          </div>
          <div className="chart-card">
            <SLAScoreDonut total={deptRows.length} within={deptRows.length - violators.length} />
          </div>
          <div className="chart-card full-width">
            <DelayTable violators={violators} />
          </div>
        </section>
      )}

      {activeTab === "timebricks" && (
        <section className="owner-charts">
          <div className="chart-card full-width">
            <h3>Time Bricks (Dept: Scanned → Saved)</h3>
            <TimeBricks
              unifiedRows={deptRows}
              testTimings={testTimings}
              height="auto"
              onBrickClick={(p) => {
                setModalData([p]);
                setOpenModal(true);
              }}
            />
          </div>
        </section>
      )}

      <PatientListModal open={openModal} onClose={() => setOpenModal(false)} patients={modalData} />
    </div>
  );
}
