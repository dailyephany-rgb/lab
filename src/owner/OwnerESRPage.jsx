
// src/owner_ui/OwnerESRPage.jsx
import React, { useEffect, useMemo, useState, useContext } from "react";
import { OwnerContext } from "../owner/OwnerContext.jsx";

import DateSourceFilter from "../owner/components/DateSourceFilter";
import KPIBlocks from "../owner/components/KPIBlocks";
import PatientListModal from "../owner/components/PatientListModal";
import DelayTable from "../owner/components/DelayTable";

import CountsBar from "../owner/charts/CountsBar";
import StackedStageLines from "../owner/charts/StackedStageLines";
import TimeBricks from "../owner/charts/TimeBricks";
import DelayHistogram from "../owner/charts/DelayHistogram";
import SLAScoreDonut from "../owner/charts/SLAScoreDonut";

import {
  subscribeOverview,
  fetchTestTimings,
  toDate,
  normalizeTestsField
} from "../owner/lib/dataFetcher_esr.js";

const toMinutes = (a, b) => {
  const A = toDate(a);
  const B = toDate(b);
  return A && B && B > A ? Math.round((B - A) / 60000) : null;
};

export default function OwnerESRPage() {
  const { dateRange, source } = useContext(OwnerContext);

  const [deptRows, setDeptRows] = useState([]); 
  const [violators, setViolators] = useState([]); // Capture strict list from fetcher
  const [fetchedKpis, setFetchedKpis] = useState(null);

  const [testTimings, setTestTimings] = useState({});
  const [openModal, setOpenModal] = useState(false);
  const [modalData, setModalData] = useState([]);
  const [activeTab, setActiveTab] = useState("overview");

  // SUBSCRIBE + FILTER
  useEffect(() => {
    const unsub = subscribeOverview({
      source,
      dateRange,
      onData: (payload = {}) => {
        if (payload.deptRows) setDeptRows(payload.deptRows);
        if (payload.kpis) setFetchedKpis(payload.kpis);
        // FIX: Capture the pre-filtered violators (Strict > 30 mins)
        if (payload.violators) setViolators(payload.violators);
      }
    });

    fetchTestTimings().then((t) => setTestTimings(t || {}));
    return () => unsub && unsub();
  }, [source, dateRange]);

  // UNIQUE COUNTS
  const uniqueCounts = useMemo(
    () => ({
      printed: new Set(deptRows.map((r) => r.regNo)).size,
      scanned: deptRows.filter((r) => r.timeScanned).length,
      saved: new Set(deptRows.filter((r) => r.isSaved).map((r) => r.regNo)).size,
      validated: new Set(deptRows.filter((r) => r.isValidated).map((r) => r.regNo)).size
    }),
    [deptRows]
  );

  const countTests = (r) => normalizeTestsField(r.selectedTests || r.tests || r.test).length;

  // KPI CALCULATIONS
  const kpisToUse = useMemo(() => {
    const rows = deptRows;
    const averages = { p2c: [], c2s: [], s2s: [], s2v: [] };

    rows.forEach((r) => {
      const A = toMinutes(r.timePrinted, r.timeCollected);
      const B = toMinutes(r.timeCollected, r.timeScanned);
      const C = toMinutes(r.timeScanned, r.timeSaved);
      const D = toMinutes(r.timeSaved, r.timeValidated);

      if (A != null) averages.p2c.push(A);
      if (B != null) averages.c2s.push(B);
      if (C != null) averages.s2s.push(C);
      if (D != null) averages.s2v.push(D);
    });

    const avg = (arr) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;

    const totalTestsCollected = fetchedKpis?.totalTestsCollected ?? 0;
    const totalTestsSaved = rows.reduce((s, r) => (r.isSaved ? s + countTests(r) : s), 0);
    const totalPatientsSaved = uniqueCounts.saved;

    // FIX: Only show slowest entry if it is actually an SLA violation (> 30)
    let slowestEntry = null;
    violators.forEach((v) => {
      if (!slowestEntry || v.duration > slowestEntry.delay) {
        slowestEntry = {
          regNo: v.regNo,
          delay: v.duration,
          tests: v.test,
          timeScanned: v.timeScanned,
          timeSaved: v.timeSaved,
          patientName: v.name
        };
      }
    });

    return {
      totalPatientsSaved,
      totalPatientsValidated: uniqueCounts.validated,
      totalPatientsPendingScans: Math.max(0, (fetchedKpis?.totalPatientsCollected ?? 0) - totalPatientsSaved),
      totalTestsCollected,
      totalTestsSaved,
      totalTestsPending: Math.max(0, totalTestsCollected - totalTestsSaved),
      avgPrintedToCollected: avg(averages.p2c),
      avgCollectedToScanned: avg(averages.c2s),
      avgScannedToSaved: avg(averages.s2s),
      avgSavedToValidated: avg(averages.s2v),
      slowestEntry
    };
  }, [deptRows, fetchedKpis, uniqueCounts, violators]);

  // CHART DATA PREP
  const countsForBar = useMemo(() => ({
    totalPrinted: fetchedKpis?.totalPatientsCollected ?? uniqueCounts.printed,
    scanned: uniqueCounts.scanned,
    saved: uniqueCounts.saved,
    validated: uniqueCounts.validated
  }), [uniqueCounts, fetchedKpis]);

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
        <h1>ESR — Analytics</h1>
        {/* 🛠️ UPDATED: Wrapped in tab-buttons div and cleaned up inline styles for consistent CSS look */}
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
            <h3>Counts (Department)</h3>
            <CountsBar counts={countsForBar} />
          </div>
          <div className="chart-card">
            <h3>Stacked Stage Timeline (Dept)</h3>
            <StackedStageLines unifiedRows={deptRows} />
          </div>
        </section>
      )}

      {activeTab === "delays" && (
        <section className="owner-charts">
          <div className="chart-card">
            <h3>Delay Histogram (Dept)</h3>
            <DelayHistogram violators={violators} />
          </div>
          <div className="chart-card">
            <h3>SLA Score (Dept)</h3>
            {/* FIX: Donut uses the pre-filtered violators count */}
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
