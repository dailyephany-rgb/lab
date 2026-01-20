

// ------------------------------------------------------
// Serology Analytics — Production Ready (Strict Implementation)
// ------------------------------------------------------

import { db } from "../../firebaseConfig.js";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import backroomRouting from "../../backroom_routing.json";
import testTimings from "../data/test_timings.json";

/* ====================== DATE UTILS ====================== */

export const toDate = (v) => {
  if (!v) return null;
  if (typeof v?.toDate === "function") return v.toDate();
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

export const minutesDiff = (a, b) => {
  const A = toDate(a);
  const B = toDate(b);
  return A && B && B > A ? Math.round((B - A) / 60000) : null;
};

/* ================= TEST NORMALIZATION =================== */

export function normalizeTestsField(field) {
  if (!field) return [];
  if (Array.isArray(field)) {
    return field
      .map((v) => {
        if (typeof v === "string") return v;
        if (v && typeof v === "object") return v.test || v.name || v.testName || null;
        return null;
      })
      .filter(Boolean)
      .map((s) => String(s).trim());
  }
  if (typeof field === "string") return field.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

/* ================= SEROLOGY CANON TESTS =================== */

const SEROLOGY_TESTS_CANON = Array.isArray(backroomRouting?.SerologyRegister)
  ? backroomRouting.SerologyRegister
  : ["HBSAG", 
  "HCV (SERUM)",
   "VDRL (SERUM)",
    "WIDAL TEST (SERUM)"
  ];

const normalizeSerology = (s = "") =>
  String(s).toLowerCase().replace(/[\s,._\-()]+/g, " ").trim();

export function isSerologyTest(testName) {
  if (!testName) return false;
  const normTest = normalizeSerology(testName);
  return SEROLOGY_TESTS_CANON.some((canonical) => {
    const target = normalizeSerology(canonical);
    return normTest.includes(target) || target.includes(normTest);
  });
}

/**
 * Counts individual tests to ensure KPI accuracy (e.g., counting 7 matching tests)
 */
export const extractSerologyTestCount = (record) => {
  const rawTests = normalizeTestsField(record.selectedTests || record.tests || record.test || []);
  const matchingTests = rawTests.filter(testName => isSerologyTest(testName));
  return matchingTests.length; 
};

/* ================= MERGE DEPT ROWS ====================== */

export function mergeDeptRows(rows = []) {
  const out = {};
  rows.forEach((r) => {
    const regId = r.regNo || r.diagnosticNo || r.id;
    if (!regId) return;

    const printedDate = toDate(r.timePrinted);
    if (!printedDate) return; 

    const key = `${regId}_serology`;
    if (!out[key]) {
      out[key] = {
        regNo: regId,
        name: r.name || r.patientName || "",
        department: "Serology",
        source: r.source || "",
        timePrinted: printedDate, 
        timeCollected: toDate(r.timeCollected),
        timeScanned: toDate(r.scannedTime || r.timeScanned),
        timeSaved: toDate(r.savedTime || r.timeSaved),
        timeValidated: toDate(r.validatedTime || r.timeValidated),
        isSaved: r.saved === "Yes" || !!(r.savedTime || r.timeSaved),
        isValidated: r.validated === true || r.status === "validated" || !!(r.validatedTime || r.timeValidated),
        testList: new Set(),
      };
    }
    normalizeTestsField(r.selectedTests || r.tests || r.test).forEach((t) => out[key].testList.add(t));
  });
  
  return Object.values(out).map((r) => ({
    ...r,
    test: Array.from(r.testList).join(", "),
    selectedTests: Array.from(r.testList),
  }));
}

/* ================= SLA VIOLATIONS ======================= */

export function computeSLAViolations(unifiedRows, timingMap, stage = "scanned_to_saved") {
  const violators = [];
  unifiedRows.forEach((row) => {
    const allowed = timingMap["serology"]?.[stage] ?? timingMap.default?.[stage] ?? 30;
    const s = toDate(row.timeScanned);
    const e = toDate(row.timeSaved);
    if (!s || !e) return;
    
    const duration = Math.round((e - s) / 60000);
    
    if (duration > allowed) {
      const excess = duration - allowed; 
      const status = duration <= allowed * 1.5 ? "borderline" : "violation";
      
      violators.push({
        regNo: row.regNo,
        name: row.name,
        test: row.test,
        duration: duration, 
        excess: Math.round(excess), 
        allowed, 
        status,
        department: "Serology",
        timeScanned: row.timeScanned,
        timeSaved: row.timeSaved,
      });
    }
  });
  return violators.sort((a, b) => b.excess - a.excess);
}

/* ================= KPI COMPUTATION ====================== */

export function computeKPIs(masterRows = [], serologyRows = []) {
  const masterSerology = masterRows.filter((m) => {
    const tests = normalizeTestsField(m.selectedTests || m.tests || m.test || []);
    return tests.some(isSerologyTest);
  });

  const totalPatientsCollected = new Set(masterSerology.map((m) => m.regNo)).size;
  const totalTestsCollected = masterSerology.reduce((sum, m) => sum + extractSerologyTestCount(m), 0);
  
  const savedRows = serologyRows.filter(r => r.isSaved);
  const totalPatientsSaved = new Set(savedRows.map((r) => r.regNo)).size;

  // Calculate total tests saved based on canon matches
  const totalTestsSaved = savedRows.reduce((sum, r) => sum + extractSerologyTestCount(r), 0);

  const validatedRows = serologyRows.filter((r) => r.isValidated);
  const totalPatientsValidated = new Set(validatedRows.map((r) => r.regNo)).size;
  
  const averages = { printedToCollected: [], collectedToScanned: [], scannedToSaved: [], savedToValidated: [] };
  let slowestEntry = null;

  serologyRows.forEach((r) => {
    const A = minutesDiff(r.timePrinted, r.timeCollected);
    const B = minutesDiff(r.timeCollected, r.timeScanned);
    const C = minutesDiff(r.timeScanned, r.timeSaved);
    const D = minutesDiff(r.timeSaved, r.timeValidated);
    
    if (A != null) averages.printedToCollected.push(A);
    if (B != null) averages.collectedToScanned.push(B);
    if (C != null) averages.scannedToSaved.push(C);
    if (D != null) averages.savedToValidated.push(D);

    if (C != null && (!slowestEntry || C > slowestEntry.delay)) {
      slowestEntry = {
        regNo: r.regNo,
        delay: C,
        patientName: r.name || "",
        tests: r.selectedTests || [],
      };
    }
  });

  const avg = (arr) => arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : null;

  return {
    totalPatientsCollected, totalTestsCollected, totalPatientsSaved, totalPatientsValidated,
    totalTestsSaved, totalPatientsPendingScans: Math.max(0, totalPatientsCollected - totalPatientsSaved),
    totalTestsPending: Math.max(0, totalTestsCollected - totalTestsSaved),
    avgPrintedToCollected: avg(averages.printedToCollected),
    avgCollectedToScanned: avg(averages.collectedToScanned),
    avgScannedToSaved: avg(averages.scannedToSaved),
    avgSavedToValidated: avg(averages.savedToValidated),
    slowestEntry,
  };
}

/* ================= SUBSCRIBE OVERVIEW =================== */

export function subscribeOverview({ onData, source = "All", dateRange }) {
  const masterRef = query(collection(db, "master_register"), orderBy("timePrinted", "asc"));
  const serologyRef = query(collection(db, "serology_register"), orderBy("timePrinted", "asc"));
  
  let masterRows = []; let serologyRows = [];

  const publish = () => {
    const from = dateRange?.from ? new Date(dateRange.from + "T00:00:00") : null;
    const to = dateRange?.to ? new Date(dateRange.to + "T23:59:59") : null;

    const filterFn = (row) => {
      const t = toDate(row.timePrinted);
      if (!t) return false;
      if (from && t < from) return false;
      if (to && t > to) return false;

      const normSource = source && source !== "All" ? source.trim().toUpperCase() : null;
      if (normSource) {
        const rowSource = (row.source || "").trim().toUpperCase();
        if (rowSource !== normSource) return false;
      }
      return true;
    };

    const filteredMaster = masterRows.filter(filterFn);
    const filteredSerology = serologyRows.filter(filterFn);

    const merged = mergeDeptRows(filteredSerology);
    const unified = unifyForCharts(merged);
    const violators = computeSLAViolations(unified, testTimings);

    onData({ 
      masterRows: filteredMaster, 
      deptRows: merged, 
      unifiedRows: unified, 
      violators: violators, 
      kpis: computeKPIs(filteredMaster, merged) 
    });
  };

  const unsubMaster = onSnapshot(masterRef, (snap) => { masterRows = snap.docs.map(d => ({ id: d.id, ...d.data() })); publish(); });
  const unsubSero = onSnapshot(serologyRef, (snap) => { serologyRows = snap.docs.map(d => ({ id: d.id, ...d.data() })); publish(); });

  return () => { unsubMaster?.(); unsubSero?.(); };
}

export function unifyForCharts(rows = []) {
  return rows.map((r) => ({
    ...r,
    patientName: r.name,
    tests: r.selectedTests,
  }));
}

export async function fetchTestTimings() { return testTimings || {}; }
