

// ------------------------------------------------------
// src/owner/OwnerHaemPage.jsx
// Haematology Analytics Page - Updated Date Filter Logic
// ------------------------------------------------------

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

import {
  subscribeOverview,
  fetchTestTimings,
  computeSLAViolations,
  toDate,
  mergeDeptRows,
  normalizeTestsField
} from "./lib/dataFetcher_haem.js";

const HAEM_TESTS = [
  "haemogram",
  "hb haemoglobin",
  "lamellar body count"
];

const toMinutes = (a, b) => {
  const A = toDate(a);
  const B = toDate(b);
  return A && B && B > A ? Math.round((B - A) / 60000) : null;
};

export default function OwnerHaemPage() {
  const { dateRange, source } = useContext(OwnerContext);

  const [rawUnifiedRows, setRawUnifiedRows] = useState([]);
  const [fetchedKpis, setFetchedKpis] = useState(null);

  const [testTimings, setTestTimings] = useState({});
  const [openModal, setOpenModal] = useState(false);
  const [modalData, setModalData] = useState([]);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    const unsub = subscribeOverview({
      source,
      dateRange,
      onData: (payload = {}) => {
        if (payload.unifiedRows) setRawUnifiedRows(payload.unifiedRows || []);
        if (payload.kpis) setFetchedKpis(payload.kpis);
      }
    });

    fetchTestTimings().then((t) => setTestTimings(t || {}));
    return () => unsub && unsub();
  }, [source, dateRange]);

  const mergedRows = useMemo(() => mergeDeptRows(rawUnifiedRows), [rawUnifiedRows]);

  // ------------------------------------------------------
  // FILTER ROWS (Strictly by timePrinted)
  // ------------------------------------------------------
  const deptRows = useMemo(() => {
    const from = dateRange.from ? toDate(dateRange.from + "T00:00:00") : null;
    const toVal = dateRange.to ? toDate(dateRange.to + "T23:59:59") : null;

    return mergedRows.filter((r) => {
      // CHANGE: Anchor date filtering ONLY to timePrinted
      const printed = toDate(r.timePrinted);
      if (!printed) return false;

      // Date Range Check
      if (from && printed < from) return false;
      if (toVal && printed > toVal) return false;

      // Test Type Check
      const testArr = normalizeTestsField(r.tests || r.test);
      const hasHaemTest = testArr.some(t =>
        HAEM_TESTS.some(keyword =>
          (t || "").toLowerCase().includes(keyword.toLowerCase())
        )
      );
      if (!hasHaemTest) return false;

      // Source Filter
      if (
        source !== "All" &&
        (r.source || "").trim().toUpperCase() !== source.toUpperCase()
      )
        return false;

      return true;
    });
  }, [mergedRows, dateRange, source]);

  const uniqueCounts = useMemo(
    () => ({
      printed: new Set(deptRows.map((r) => r.regNo)).size,
      scanned: deptRows.filter((r) => r.timeScanned).length,
      saved: new Set(deptRows.filter((r) => r.timeSaved).map((r) => r.regNo)).size,
      validated: new Set(
        deptRows.filter((r) => r.timeValidated).map((r) => r.regNo)
      ).size
    }),
    [deptRows]
  );

  const countTests = (r) => normalizeTestsField(r.tests || r.test).length;

  const kpisToUse = useMemo(() => {
    const rows = deptRows;
    const printedToCollected = [];
    const collectedToScanned = [];
    const scannedToSaved = [];
    const savedToValidated = [];

    rows.forEach((r) => {
      const A = toMinutes(r.timePrinted, r.timeCollected);
      const B = toMinutes(r.timeCollected, r.timeScanned);
      const C = toMinutes(r.timeScanned, r.timeSaved);
      const D = toMinutes(r.timeSaved, r.timeValidated);

      if (A != null) printedToCollected.push(A);
      if (B != null) collectedToScanned.push(B);
      if (C != null) scannedToSaved.push(C);
      if (D != null) savedToValidated.push(D);
    });

    const avg = (arr) =>
      arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;

    const totalTestsCollected = fetchedKpis?.totalTestsCollected ?? 0;
    const totalTestsSaved = rows.reduce(
      (s, r) => (r.timeSaved ? s + countTests(r) : s),
      0
    );
    const totalTestsPending = Math.max(0, totalTestsCollected - totalTestsSaved);
    const totalPatientsSaved = uniqueCounts.saved;

    const totalPatientsPendingScans = Math.max(
      0,
      (fetchedKpis?.totalPatientsCollected ?? 0) - totalPatientsSaved
    );

    let slowestEntry = null;
    rows.forEach((r) => {
      const delay = toMinutes(r.timeScanned, r.timeSaved);
      if (delay != null && (!slowestEntry || delay > slowestEntry.delay)) {
        slowestEntry = {
          regNo: r.regNo,
          delay,
          tests: normalizeTestsField(r.tests),
          timeScanned: r.timeScanned,
          timeSaved: r.timeSaved,
          patientName: r.patientName
        };
      }
    });

    return {
      totalPatientsSaved,
      totalPatientsValidated: uniqueCounts.validated,
      totalPatientsPendingScans,
      totalTestsCollected,
      totalTestsSaved,
      totalTestsPending,
      avgPrintedToCollected: avg(printedToCollected),
      avgCollectedToScanned: avg(collectedToScanned),
      avgScannedToSaved: avg(scannedToSaved),
      avgSavedToValidated: avg(savedToValidated),
      slowestEntry
    };
  }, [deptRows, fetchedKpis, uniqueCounts]);

  const violators = useMemo(
    () => computeSLAViolations(deptRows, testTimings, "scanned_to_saved"),
    [deptRows, testTimings]
  );

  const countsForBar = useMemo(
    () => ({
      totalPrinted: fetchedKpis?.totalPatientsCollected ?? uniqueCounts.printed,
      scanned: uniqueCounts.scanned,
      saved: uniqueCounts.saved,
      validated: uniqueCounts.validated
    }),
    [uniqueCounts, fetchedKpis]
  );

  const overviewForKPI = {
    totalPrinted: fetchedKpis?.totalPatientsCollected ?? 0,
    scanned: countsForBar.scanned,
    saved: countsForBar.saved,
    validated: countsForBar.validated
  };

  const finalKpis = {
    ...kpisToUse,
    totalPatientsCollected: fetchedKpis?.totalPatientsCollected ?? 0,
    totalTestsCollected: fetchedKpis?.totalTestsCollected ?? 0
  };

  return (
    <div className="owner-root">
      <header className="owner-header">
        <h1>Haematology — Analytics</h1>
        {/* 🛠️ UPDATED: Added tab-buttons wrapper for consistent look */}
        <div className="tab-buttons">
          <button 
            className={activeTab === "overview" ? "active" : ""} 
            onClick={() => setActiveTab("overview")}
          >
            Overview
          </button>
          <button 
            className={activeTab === "delays" ? "active" : ""} 
            onClick={() => setActiveTab("delays")}
          >
            Delays
          </button>
          <button 
            className={activeTab === "timebricks" ? "active" : ""} 
            onClick={() => setActiveTab("timebricks")}
          >
            Time Bricks
          </button>
        </div>
      </header>

      <DateSourceFilter />
      <KPIBlocks overview={overviewForKPI} kpis={finalKpis} />

      {activeTab === "overview" && (
        <section className="owner-charts">
          <div className="chart-card">
            <h3>Counts (Haematology)</h3>
            <CountsBar counts={countsForBar} />
          </div>
          <div className="chart-card">
            <h3>Stage Timeline (Haem)</h3>
            <StackedStageLines unifiedRows={deptRows} />
          </div>
        </section>
      )}

      {activeTab === "delays" && (
        <section className="owner-charts">
          <div className="chart-card">
            <h3>Delay Histogram</h3>
            <DelayHistogram violators={violators} />
          </div>
          <div className="chart-card">
            <h3>SLA Score</h3>
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
            <h3>Time Bricks (Scanned → Saved)</h3>
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
