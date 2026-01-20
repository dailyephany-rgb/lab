

// src/owner/OwnerApp.jsx
import React, { useContext, useEffect, useState, useMemo } from "react";
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
  computeSLAViolations
} from "./lib/dataFetcher";

import "./OwnerUI.css";

export default function OwnerApp() {
  const { MOCK_MODE } = useContext(OwnerContext);

  const [overview, setOverview] = useState({
    totalPrinted: 0,
    scanned: 0,
    saved: 0,
    validated: 0
  });

  const [unifiedRows, setUnifiedRows] = useState([]);
  const [testTimings, setTestTimings] = useState({});
  const [openModal, setOpenModal] = useState(false);
  const [modalData, setModalData] = useState([]);
  const [activeTab, setActiveTab] = useState("overview");

  /* -------------------------------------------------------
     1) SUBSCRIBE TO GLOBAL DATA (MASTER / MOCK / FIREBASE)
  -------------------------------------------------------- */
  useEffect(() => {
    const unsub = subscribeOverview({
      MOCK_MODE,
      onData: ({ overview, unifiedRows }) => {
        setOverview(
          overview || {
            totalPrinted: 0,
            scanned: 0,
            saved: 0,
            validated: 0
          }
        );
        setUnifiedRows(unifiedRows || []);
      }
    });

    fetchTestTimings().then(t => setTestTimings(t || {}));

    return () => unsub && unsub();
  }, [MOCK_MODE]);

  /* -------------------------------------------------------
     2) KPI CALCULATIONS
  -------------------------------------------------------- */
  const kpis = useMemo(() => {
    const toMinutes = (a, b) =>
      a && b
        ? Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000)
        : null;

    const printedToScanned = [];
    const scannedToSaved = [];
    const savedToValidated = [];

    let pendingScans = 0;
    let pendingSaves = 0;
    let pendingValidates = 0;

    unifiedRows.forEach(p => {
      const a = toMinutes(p.timePrinted, p.timeScanned);
      const b = toMinutes(p.timeScanned, p.timeSaved);
      const c = toMinutes(p.timeSaved, p.timeValidated);

      if (a != null) printedToScanned.push(a);
      if (b != null) scannedToSaved.push(b);
      if (c != null) savedToValidated.push(c);

      if (!p.timeScanned) pendingScans++;
      if (p.timeScanned && !p.timeSaved) pendingSaves++;
      if (p.timeSaved && !p.timeValidated) pendingValidates++;
    });

    const avg = arr =>
      arr.length
        ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length)
        : null;

    return {
      avgPrintedToScanned: avg(printedToScanned),
      avgScannedToSaved: avg(scannedToSaved),
      avgSavedToValidated: avg(savedToValidated),
      pendingScans,
      pendingSaves,
      pendingValidates
    };
  }, [unifiedRows]);

  /* -------------------------------------------------------
     3) SLA VIOLATIONS
  -------------------------------------------------------- */
  const violators = useMemo(
    () => computeSLAViolations(unifiedRows, testTimings, "scanned_to_saved"),
    [unifiedRows, testTimings]
  );

  /* -------------------------------------------------------
     4) UI
  -------------------------------------------------------- */
  return (
    <div className="owner-root">

      {/* ================= HEADER ================= */}
      <header className="owner-header">
        <h1>Owner Dashboard — Global Analytics</h1>

        {/* Department Analytics Dropdown */}
        <select
          style={{
            padding: "6px 10px",
            borderRadius: "6px",
            border: "1px solid #e2e8f0",
            background: "#f8fafc",
            cursor: "pointer"
          }}
          defaultValue=""
          onChange={(e) => {
            const routeMap = {
              coag: "/index_owner_coag.html",
              esr: "/owner_esr.html",
              serology: "/owner_serology.html",
              rapid: "/owner_rapid.html",
              urine: "/index_owner_urine.html",
              haem: "/index_owner_haem.html",
              hormones: "/owner_hormones.html",
              biochem: "/owner_biochem.html",
              bloodgroup: "/owner_bloodgroup.html"
            };

            const url = routeMap[e.target.value];
            if (url) {
              window.open(url, "_blank");
              e.target.value = "";
            }
          }}
        >
          <option value="">Open Department Analytics…</option>
          <option value="coag">Coagulation</option>
          <option value="esr">ESR</option>
          <option value="serology">Serology</option>
          <option value="rapid">Rapid Card</option>
          <option value="urine">Urine Analysis</option>
          <option value="haem">Haematology</option>
          <option value="hormones">Hormones</option>
          <option value="biochem">Biochemistry</option>
          <option value="bloodgroup">Blood Group & RH</option>
        </select>
      </header>

      {/* ================= FILTERS ================= */}
      <DateSourceFilter />

      {/* ================= KPI BLOCKS ================= */}
      <KPIBlocks overview={overview} kpis={kpis} />

      {/* ================= TABS ================= */}
      <div className="tab-buttons" style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        <button
          onClick={() => setActiveTab("overview")}
          className={activeTab === "overview" ? "active" : ""}
        >
          Overview
        </button>

        <button
          onClick={() => setActiveTab("delays")}
          className={activeTab === "delays" ? "active" : ""}
        >
          Delays
        </button>
      </div>

      {/* ================= OVERVIEW TAB ================= */}
      {activeTab === "overview" ? (
        <section className="owner-charts">

          <div className="chart-card">
            <h3>Global Counts</h3>
            <CountsBar counts={overview} />
          </div>

          <div className="chart-card">
            <h3>Stacked Stage Timeline</h3>
            <StackedStageLines unifiedRows={unifiedRows} />
          </div>

          <div className="chart-card full-width">
            <h3>Time Bricks (Scanned → Saved)</h3>
            <TimeBricks
              unifiedRows={unifiedRows}
              testTimings={testTimings}
              height={520}
              onBrickClick={p => {
                setModalData([p]);
                setOpenModal(true);
              }}
            />
          </div>

        </section>
      ) : (
        /* ================= DELAYS TAB ================= */
        <section className="owner-charts">

          <div className="chart-card">
            <h3>Delay Histogram</h3>
            <DelayHistogram violators={violators} />
          </div>

          <div className="chart-card">
            <h3>SLA Score</h3>
            <SLAScoreDonut
              total={unifiedRows.length}
              within={unifiedRows.length - violators.length}
            />
          </div>

          <div className="chart-card full-width">
            <DelayTable violators={violators} />
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