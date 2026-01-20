

// ------------------------------------------------------
// src/owner/OwnerCoagPage.jsx
// Coagulation Analytics Page - Optimized with Slowest Entry Restore
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
  toDate,
  normalizeTestsField
} from "./lib/dataFetcher.js";

// Helper for slowest entry calculation
const toMinutes = (a, b) => {
  const A = toDate(a);
  const B = toDate(b);
  return A && B && B > A ? Math.round((B - A) / 60000) : null;
};

export default function OwnerCoagPage() {
  const { dateRange, source } = useContext(OwnerContext);

  const [deptRows, setDeptRows] = useState([]); 
  const [fetchedKpis, setFetchedKpis] = useState(null);
  const [violators, setViolators] = useState([]);

  const [testTimings, setTestTimings] = useState({});
  const [openModal, setOpenModal] = useState(false);
  const [modalData, setModalData] = useState([]);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    const unsub = subscribeOverview({
      source,
      dateRange,
      onData: (payload = {}) => {
        // Use data pre-filtered by timePrinted in dataFetcher
        if (payload.unifiedRows) setDeptRows(payload.unifiedRows || []);
        if (payload.kpis) setFetchedKpis(payload.kpis);
        if (payload.violators) setViolators(payload.violators || []);
      }
    });

    fetchTestTimings().then((t) => setTestTimings(t || {}));
    return () => unsub && unsub();
  }, [source, dateRange]);

  // 1. Restore Slowest Entry Logic based on current deptRows
  const slowestEntry = useMemo(() => {
    let slowest = null;
    deptRows.forEach((r) => {
      const delay = toMinutes(r.timeScanned, r.timeSaved);
      if (delay != null && (!slowest || delay > slowest.delay)) {
        slowest = {
          regNo: r.regNo,
          delay,
          tests: normalizeTestsField(r.tests || r.test),
          timeScanned: r.timeScanned,
          timeSaved: r.timeSaved,
          patientName: r.name || r.patientName
        };
      }
    });
    return slowest;
  }, [deptRows]);

  // 2. Final KPIs for Display
  const finalKpis = useMemo(() => ({
    ...(fetchedKpis || {}),
    slowestEntry // Inject the calculated slowest entry
  }), [fetchedKpis, slowestEntry]);

  // 3. Map overview for charts
  const overviewForKPI = useMemo(() => ({
    totalPrinted: finalKpis?.totalPatientsCollected ?? 0,
    scanned: deptRows.filter(r => r.timeScanned).length,
    saved: finalKpis?.totalPatientsSaved ?? 0,
    validated: finalKpis?.totalPatientsValidated ?? 0
  }), [finalKpis, deptRows]);

  const countsForBar = useMemo(() => ({
    totalPrinted: overviewForKPI.totalPrinted,
    scanned: overviewForKPI.scanned,
    saved: overviewForKPI.saved,
    validated: overviewForKPI.validated
  }), [overviewForKPI]);

  return (
    <div className="owner-root">
      <header className="owner-header">
        <h1>Coagulation — Analytics</h1>
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
            <h3>Counts (Coagulation)</h3>
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
