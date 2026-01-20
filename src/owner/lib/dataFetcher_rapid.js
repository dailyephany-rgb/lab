

// ------------------------------------------------------
// src/owner/lib/dataFetcher_rapid.js — Rapid Card Analytics (STRICT Time Printed)
// ------------------------------------------------------

import { db } from "../../firebaseConfig.js";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore";

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

/* ================= RAPID CANON TESTS =================== */

const RAPID_KEYWORDS = [
  "MALARIA",
  "DENGUE",
  "TYPHOID",
  "CHIKUNGUNIA",
  "ANTIGEN"
];

const normalizeRapid = (s = "") =>
  String(s).toUpperCase().replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim();

export function isRapidTest(testName) {
  if (!testName) return false;
  const n = normalizeRapid(testName);
  return RAPID_KEYWORDS.some((k) => n.includes(k));
}

export const extractRapidTestCount = (record) => {
  const rawTests = normalizeTestsField(record.selectedTests || record.tests || record.test || []);
  const matches = rawTests.filter(testName => isRapidTest(testName));
  return matches.length;
};

/* ================= MERGE DEPT ROWS ====================== */

export function mergeDeptRows(rows = []) {
  const out = {};
  rows.forEach((r) => {
    const regId = r.regNo || r.diagnosticNo || r.id;
    if (!regId) return;

    const printedDate = toDate(r.timePrinted);
    if (!printedDate) return; 

    const key = `${regId}_rapid`;
    if (!out[key]) {
      out[key] = {
        regNo: regId,
        name: r.name || r.patientName || "",
        department: "rapid",
        source: r.source || "",
        timePrinted: printedDate, 
        timeCollected: toDate(r.timeCollected),
        timeScanned: toDate(r.timeScanned || r.scannedTime),
        timeSaved: toDate(r.timeSaved || r.savedTime),
        timeValidated: toDate(r.timeValidated || r.validatedTime),
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
    tests: Array.from(r.testList),
  }));
}

/* ================= SLA VIOLATIONS ======================= */

export function computeSLAViolations(unifiedRows, timingMap, stage = "scanned_to_saved") {
  const violators = [];
  unifiedRows.forEach((row) => {
    const allowed = timingMap["rapid"]?.[stage] ?? timingMap.default?.[stage] ?? 30;
    
    const s = toDate(row.timeScanned);
    const e = toDate(row.timeSaved);
    if (!s || !e) return;
    
    const duration = (e - s) / 60000;
    
    if (duration > allowed) {
      const excess = duration - allowed;
      const status = duration <= allowed * 1.5 ? "borderline" : "violation";
      
      violators.push({
        regNo: row.regNo,
        name: row.name,
        test: row.test,
        duration: Math.round(duration),
        excess: Math.round(excess),
        allowed, 
        status,
        department: "rapid",
        timeScanned: row.timeScanned,
        timeSaved: row.timeSaved,
      });
    }
  });
  return violators.sort((a, b) => b.excess - a.excess);
}

/* ================= KPI COMPUTATION ====================== */

export function computeKPIs(masterRows = [], rapidRows = []) {
  const masterRapid = masterRows.filter((m) => {
    const tests = normalizeTestsField(m.selectedTests || m.tests || m.test || []);
    return tests.some(isRapidTest);
  });

  const totalPatientsCollected = new Set(masterRapid.map((m) => m.regNo)).size;
  const totalTestsCollected = masterRapid.reduce((sum, m) => sum + extractRapidTestCount(m), 0);
  
  const savedRows = rapidRows.filter(r => r.isSaved);
  const totalPatientsSaved = new Set(savedRows.map((r) => r.regNo)).size;
  const totalTestsSaved = savedRows.reduce((sum, r) => sum + extractRapidTestCount(r), 0);
  
  const validatedRows = rapidRows.filter((r) => r.isValidated);
  const totalPatientsValidated = new Set(validatedRows.map((r) => r.regNo)).size;
  
  const averages = { printedToCollected: [], collectedToScanned: [], scannedToSaved: [], savedToValidated: [] };
  rapidRows.forEach((r) => {
    const A = minutesDiff(r.timePrinted, r.timeCollected);
    const B = minutesDiff(r.timeCollected, r.timeScanned);
    const C = minutesDiff(r.timeScanned, r.timeSaved);
    const D = minutesDiff(r.timeSaved, r.timeValidated);
    if (A != null) averages.printedToCollected.push(A);
    if (B != null) averages.collectedToScanned.push(B);
    if (C != null) averages.scannedToSaved.push(C);
    if (D != null) averages.savedToValidated.push(D);
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
  };
}

/* ================= SUBSCRIBE OVERVIEW =================== */

export function subscribeOverview({ onData, source = "All", dateRange }) {
  const applyFilters = (mRows, rRows) => {
    const from = dateRange?.from ? new Date(dateRange.from + "T00:00:00") : null;
    const to = dateRange?.to ? new Date(dateRange.to + "T23:59:59") : null;
    const normSource = source && source !== "All" ? source.trim().toUpperCase() : null;

    const filterFn = (row) => {
      // 1. Date Filter
      const t = toDate(row.timePrinted);
      if (!t) return false;
      if (from && t < from) return false;
      if (to && t > to) return false;

      // 2. Source Filter
      if (normSource) {
        const rowSource = (row.source || "").trim().toUpperCase();
        if (rowSource !== normSource) return false;
      }
      return true;
    };

    return {
      filteredMaster: mRows.filter(filterFn),
      filteredRapid: rRows.filter(filterFn),
    };
  };

  const masterRef = query(collection(db, "master_register"), orderBy("timePrinted", "asc"));
  const rapidRef = query(collection(db, "rapid_card_register"), orderBy("timePrinted", "asc"));
  
  let masterRows = []; 
  let rapidRows = [];

  const publish = () => {
    const { filteredMaster, filteredRapid } = applyFilters(masterRows, rapidRows);
    const merged = mergeDeptRows(filteredRapid);
    onData({ 
      masterRows: filteredMaster, 
      deptRows: merged, 
      unifiedRows: unifyForCharts(merged), 
      kpis: computeKPIs(filteredMaster, merged) 
    });
  };

  const unsubMaster = onSnapshot(masterRef, (snap) => { 
    masterRows = snap.docs.map(d => ({ id: d.id, ...d.data() })); 
    publish(); 
  });
  
  const unsubRapid = onSnapshot(rapidRef, (snap) => { 
    rapidRows = snap.docs.map(d => ({ id: d.id, ...d.data() })); 
    publish(); 
  });

  return () => { 
    unsubMaster?.(); 
    unsubRapid?.(); 
  };
}

/* ================= UNIFY FOR CHARTS ===================== */

export function unifyForCharts(rows = []) {
  return rows.map((r) => ({
    ...r,
    patientName: r.name,
    tests: r.selectedTests,
  }));
}

export async function fetchTestTimings() { 
  return testTimings || {}; 
}
