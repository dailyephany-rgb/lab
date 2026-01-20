



import React, { useContext, useEffect, useMemo, useState } from "react";
import { OwnerContext } from "./OwnerContext.jsx";

import DateSourceFilter from "./components/DateSourceFilter";
import KPIBlocks from "./components/KPIBlocks";
import DelayTable from "./components/DelayTable";
import PatientListModal from "./components/PatientListModal";

import CountsBar from "./charts/CountsBar";
import StackedStageLines from "./charts/StackedStageLines";
import TimeBricks from "./charts/TimeBricks";
import DelayHistogram from "./charts/DelayHistogram";
import SLAScoreDonut from "./charts/SLAScoreDonut";

import {
  subscribeOverview as subscribeMain,
  toDate,
  minutesDiff,           
  fetchTestTimings,       
  computeSLAViolations,   
} from "./lib/dataFetcher_hormones_main"; // UPDATED: Changed from biochem to hormones

import {
  subscribeOverview as subscribeBackup,
} from "./lib/dataFetcher_hormones_backup"; // UPDATED: Changed from biochem to hormones

export default function OwnerHormones() {
  const { dateRange, source } = useContext(OwnerContext);

  const [analyzer, setAnalyzer] = useState("main");
  const [activeTab, setActiveTab] = useState("overview");

  const [rawRows, setRawRows] = useState([]);
  const [fetchedKpis, setFetchedKpis] = useState(null); 
  const [testTimings, setTestTimings] = useState({}); 

  const [openModal, setOpenModal] = useState(false);
  const [modalData, setModalData] = useState([]);

  /* ---------------- SUBSCRIBE ---------------- */
  useEffect(() => {
    const subscribe = analyzer === "main" ? subscribeMain : subscribeBackup;

    const unsub = subscribe({
      source,
      dateRange,
      onData: ({ unifiedRows, kpis }) => {
        setRawRows(unifiedRows || []);
        setFetchedKpis(kpis || null);
      },
    });

    fetchTestTimings().then((t) => setTestTimings(t || {}));

    return () => unsub && unsub();
  }, [analyzer, source, dateRange]);

  /* ---------------- DATA ASSIGNMENT ---------------- */
  const deptRows = rawRows;

  /* ---------------- CALCULATE SLOWEST ENTRY ---------------- */
  const slowestEntry = useMemo(() => {
    let slowest = null;
    deptRows.forEach((r) => {
      const delay = minutesDiff(r.timeScanned, r.timeSaved);
      if (delay !== null && (!slowest || delay > slowest.delay)) {
        slowest = {
          regNo: r.regNo,
          patientName: r.name || r.patientName || "Unknown",
          delay: delay,
          tests: r.selectedTests || []
        };
      }
    });
    return slowest;
  }, [deptRows]);

  /* ---------------- MERGED KPIs ---------------- */
  const kpis = useMemo(() => {
    if (!fetchedKpis) return null;
    return {
      ...fetchedKpis,
      slowestEntry: slowestEntry 
    };
  }, [fetchedKpis, slowestEntry]);

  /* ---------------- COUNTS (FOR CHARTS) ---------------- */
  const countsForBar = useMemo(
    () => ({
      totalPrinted: kpis?.totalPatientsCollected ?? 0,
      scanned: deptRows.filter((r) => r.timeScanned).length,
      saved: deptRows.filter((r) => r.isSaved || r.timeSaved).length, 
      validated: deptRows.filter((r) => r.isValidated || r.timeValidated).length,
    }),
    [deptRows, kpis]
  );

  const overviewForKPI = {
    totalPrinted: kpis?.totalPatientsCollected ?? 0,
    scanned: countsForBar.scanned,
    saved: countsForBar.saved,
    validated: countsForBar.validated,
  };

  /* ---------------- SLA VIOLATIONS ---------------- */
  const violators = useMemo(
    () => computeSLAViolations(deptRows, testTimings, "scanned_to_saved"),
    [deptRows, testTimings]
  );

  return (
    <div className="owner-root">
      <header className="owner-header">
        <h1>Hormones — Analytics</h1>

        <div className="tab-buttons">
          <button
            className={analyzer === "main" ? "active" : ""}
            onClick={() => setAnalyzer("main")}
          >
            Main Analyzer
          </button>
          <button
            className={analyzer === "backup" ? "active" : ""}
            onClick={() => setAnalyzer("backup")}
          >
            Backup Analyzer
          </button>
        </div>

        <div className="tab-buttons" style={{ marginTop: 12 }}>
          {["overview", "delays", "timebricks"].map((t) => (
            <button
              key={t}
              className={activeTab === t ? "active" : ""}
              onClick={() => setActiveTab(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </header>

      <DateSourceFilter />
      <KPIBlocks overview={overviewForKPI} kpis={kpis || {}} />

      {activeTab === "overview" && (
        <section className="owner-charts">
          <div className="chart-card">
            <h3>Counts</h3>
            <CountsBar counts={countsForBar} />
          </div>

          <div className="chart-card">
            <h3>Stacked Stage Timeline</h3>
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
            <SLAScoreDonut
              total={deptRows.length}
              within={deptRows.length - violators.length}
            />
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
              onBrickClick={(p) => {
                setModalData([p]);
                setOpenModal(true);
              }}
            />
          </div>
        </section>
      )}

      <PatientListModal
        open={openModal}
        onClose={() => setOpenModal(false)}
        patients={modalData}
      />
    </div>
  );
}
