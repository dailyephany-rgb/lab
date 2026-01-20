

// src/owner_ui/OwnerRapidPage.jsx
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
  computeSLAViolations,
  toDate,
  normalizeTestsField
} from "../owner/lib/dataFetcher_rapid.js";

const toMinutes = (a, b) => {
  const A = toDate(a);
  const B = toDate(b);
  return A && B && B > A ? Math.round((B - A) / 60000) : null;
};

export default function OwnerRapidPage() {
  const { dateRange, source } = useContext(OwnerContext);

  const [deptRows, setDeptRows] = useState([]); 
  // Initializing with an empty object instead of null to remove the loading guard safely
  const [fetchedKpis, setFetchedKpis] = useState({});

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
      }
    });

    fetchTestTimings().then((t) => setTestTimings(t || {}));
    return () => unsub && unsub();
  }, [source, dateRange]);

  // UNIQUE COUNTS (Anchored to the Boolean flags from the Fetcher)
  const uniqueCounts = useMemo(
    () => ({
      printed: new Set(deptRows.map((r) => r.regNo)).size,
      scanned: deptRows.filter((r) => r.timeScanned).length,
      saved: new Set(
        deptRows.filter((r) => r.isSaved).map((r) => r.regNo)
      ).size,
      validated: new Set(
        deptRows.filter((r) => r.isValidated).map((r) => r.regNo)
      ).size
    }),
    [deptRows]
  );

  const countTests = (r) => normalizeTestsField(r.selectedTests || r.tests || r.test).length;

  // RAPID KPI CALCULATIONS
  const kpisToUse = useMemo(() => {
    const rows = deptRows;
    const averages = { pToC: [], cToS: [], sToSaved: [], sToV: [] };

    rows.forEach((r) => {
      const A = toMinutes(r.timePrinted, r.timeCollected);
      const B = toMinutes(r.timeCollected, r.timeScanned);
      const C = toMinutes(r.timeScanned, r.timeSaved);
      const D = toMinutes(r.timeSaved, r.timeValidated);

      if (A != null) averages.pToC.push(A);
      if (B != null) averages.cToS.push(B);
      if (C != null) averages.sToSaved.push(C);
      if (D != null) averages.sToV.push(D);
    });

    const avg = (arr) =>
      arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;

    const totalTestsCollected = fetchedKpis?.totalTestsCollected ?? 0;
    const totalTestsSaved = rows.reduce((s, r) => (r.isSaved ? s + countTests(r) : s), 0);
    const totalTestsPending = Math.max(0, totalTestsCollected - totalTestsSaved);
    const totalPatientsSaved = uniqueCounts.saved;
    const totalPatientsPendingScans = Math.max(0, (fetchedKpis?.totalPatientsCollected ?? 0) - totalPatientsSaved);

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
          patientName: r.name || r.patientName
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
      avgPrintedToCollected: avg(averages.pToC),
      avgCollectedToScanned: avg(averages.cToS),
      avgScannedToSaved: avg(averages.sToSaved),
      avgSavedToValidated: avg(averages.sToV),
      slowestEntry
    };
  }, [deptRows, fetchedKpis, uniqueCounts]);

  // SLA VIOLATORS
  const violators = useMemo(
    () => computeSLAViolations(deptRows, testTimings, "scanned_to_saved"),
    [deptRows, testTimings]
  );

  // Counts bar
  const countsForBar = useMemo(
    () => ({
      totalPrinted: fetchedKpis?.totalPatientsCollected ?? uniqueCounts.printed,
      scanned: uniqueCounts.scanned,
      saved: uniqueCounts.saved,
      validated: uniqueCounts.validated
    }),
    [uniqueCounts, fetchedKpis]
  );

  // Overview KPIs
  const overviewForKPI = {
    totalPrinted: fetchedKpis?.totalPatientsCollected ?? 0,
    scanned: countsForBar.scanned,
    saved: countsForBar.saved,
    validated: countsForBar.validated
  };

  // Merge KPIs
  const finalKpis = {
    ...kpisToUse,
    totalPatientsCollected: fetchedKpis?.totalPatientsCollected ?? 0,
    totalTestsCollected: fetchedKpis?.totalTestsCollected ?? 0
  };

  return (
    <div className="owner-root">
      <header className="owner-header">
        <h1>Rapid Card — Analytics</h1>
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

