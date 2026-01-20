


// ------------------------------------------------------
// Blood Group Retesting — STRICT Time Printed Implementation
// ------------------------------------------------------

import { db } from "../../firebaseConfig.js";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
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

/* ================= BLOOD GROUP CANON TESTS =================== */

// Keeping the same canon names as the testing register
const BG_TESTS_CANON = ["ABO GROUP & RH TYPE"];

const normalizeBG = (s = "") =>
  String(s).toLowerCase().replace(/[\s,._\-()]+/g, " ").trim();

export function isBloodGroupTest(testName) {
  if (!testName) return false;
  const normTest = normalizeBG(testName);
  return BG_TESTS_CANON.some((canonical) => {
    const target = normalizeBG(canonical);
    return normTest.includes(target) || target.includes(normTest);
  });
}

export const extractBloodGroupTestCount = (record) => {
  const rawTests = normalizeTestsField(record.selectedTests || record.tests || record.test || []);
  const hasMatch = rawTests.some(testName => isBloodGroupTest(testName));
  return (hasMatch || record.regNo) ? 1 : 0;
};

/* ================= MERGE DEPT ROWS ====================== */

export function mergeDeptRows(rows = []) {
  const out = {};
  rows.forEach((r) => {
    const regId = r.regNo || r.diagnosticNo || r.id;
    if (!regId) return;

    const printedDate = toDate(r.timePrinted);
    if (!printedDate) return; 

    const key = `${regId}_bloodgroup_retesting`;
    if (!out[key]) {
      out[key] = {
        regNo: regId,
        name: r.name || r.patientName || "",
        department: "bloodgroup_retesting",
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

/* ================= SLA VIOLATIONS (STRICT ROUNDING) ======================= */

export function computeSLAViolations(unifiedRows, timingMap, stage = "scanned_to_saved") {
  const violators = [];
  unifiedRows.forEach((row) => {
    // Looks up timings for 'bloodgroup_retesting' or 'default'
    const allowed = timingMap["bloodgroup_retesting"]?.[stage] ?? timingMap.default?.[stage] ?? 30;
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
        department: "bloodgroup_retesting",
        timeScanned: row.timeScanned,
        timeSaved: row.timeSaved,
      });
    }
  });
  return violators.sort((a, b) => b.excess - a.excess);
}

/* ================= KPI COMPUTATION ====================== */

export function computeKPIs(masterRows = [], bgRows = []) {
  const masterBG = masterRows.filter((m) => {
    const tests = normalizeTestsField(m.selectedTests || m.tests || m.test || []);
    return tests.some(isBloodGroupTest);
  });

  const totalPatientsCollected = new Set(masterBG.map((m) => m.regNo)).size;
  const totalTestsCollected = masterBG.reduce((sum, m) => sum + extractBloodGroupTestCount(m), 0);
  
  const savedRows = bgRows.filter(r => r.isSaved);
  const totalPatientsSaved = new Set(savedRows.map((r) => r.regNo)).size;
  const totalTestsSaved = savedRows.reduce((sum, r) => sum + extractBloodGroupTestCount(r), 0);
  
  const validatedRows = bgRows.filter((r) => r.isValidated);
  const totalPatientsValidated = new Set(validatedRows.map((r) => r.regNo)).size;
  
  const averages = { printedToCollected: [], collectedToScanned: [], scannedToSaved: [], savedToValidated: [] };
  
  let slowestEntry = null;

  bgRows.forEach((r) => {
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
  // Changed collection to bloodgroup_retesting_register
  const bgRef = query(collection(db, "bloodgroup_retesting_register"), orderBy("timePrinted", "asc"));
  
  let masterRows = []; let bgRows = [];

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
    const filteredBG = bgRows.filter(filterFn);

    const merged = mergeDeptRows(filteredBG);
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

  const unsubMaster = onSnapshot(masterRef, (snap) => { 
    masterRows = snap.docs.map(d => ({ id: d.id, ...d.data() })); 
    publish(); 
  });
  const unsubBG = onSnapshot(bgRef, (snap) => { 
    bgRows = snap.docs.map(d => ({ id: d.id, ...d.data() })); 
    publish(); 
  });

  return () => { unsubMaster?.(); unsubBG?.(); };
}

export function unifyForCharts(rows = []) {
  return rows.map((r) => ({
    ...r,
    patientName: r.name,
    tests: r.selectedTests,
  }));
}

export async function fetchTestTimings() { return testTimings || {}; }
