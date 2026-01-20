

// scripts/owner_static_mock.cjs
// Run: node scripts/owner_static_mock.cjs

const fs = require("fs");
const path = require("path");

function addMinutes(date, mins) {
  return new Date(date.getTime() + mins * 60000);
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Sources
const SOURCES = ["OPD", "IPD", "Third Floor"];

// Tests per dept
const TESTS = {
  biochem: ["LFT", "GLU"],
  hormones: ["TSH"],
  haem: ["CBC"],
  coag: ["PT", "APTT"],
  backroom: ["ESR"]
};

// --------------------------------------------------------------
// MAIN GENERATOR
// --------------------------------------------------------------
function generateStatic(count = 150, startReg = 10000) {
  const today = new Date();
  today.setHours(6, 0, 0, 0);

  const master = [];
  const deptMaps = {
    biochem: [],
    hormones: [],
    haem: [],
    coag: [],
    backroom: []
  };

  for (let i = 0; i < count; i++) {
    const regNo = String(startReg + i);

    // Set base timeline for this patient
    const printed = addMinutes(today, i * 3); // like real world
    const collected = addMinutes(printed, rand(3, 20));
    const scanned = addMinutes(collected, rand(1, 10));
    const saved = addMinutes(scanned, rand(2, 40));
    const validated = addMinutes(saved, rand(1, 30));

    const timePrinted = printed.toISOString();
    const timeCollected = collected.toISOString();

    const patient = {
      regNo,
      patientName: `Patient ${regNo}`,
      source: SOURCES[rand(0, SOURCES.length - 1)],
      timePrinted,
      timeCollected,
      selectedTests: TESTS // full list for completeness
    };

    master.push(patient);

    // For every department, create entries per test
    Object.entries(TESTS).forEach(([dept, tests]) => {
      tests.forEach((test) => {
        deptMaps[dept].push({
          regNo,
          department: dept,
          test,
          timeCollected,                    // REQUIRED BY CHARTS
          timeScanned: scanned.toISOString(),
          timeSaved: saved.toISOString(),
          timeValidated: validated.toISOString()
        });
      });
    });
  }

  return { master, deptMaps };
}

// --------------------------------------------------------------
// WRITE OUTPUT
// --------------------------------------------------------------
const OUT = path.join(__dirname, "..", "src", "owner", "data", "owner_static_data.json");

const data = generateStatic(150, 10000);

fs.writeFileSync(OUT, JSON.stringify(data, null, 2), "utf8");

console.log(
  `Generated ${OUT}\n` +
    `master: ${data.master.length}, ` +
    `biochem: ${data.deptMaps.biochem.length}, ` +
    `hormones: ${data.deptMaps.hormones.length}, ` +
    `haem: ${data.deptMaps.haem.length}, ` +
    `coag: ${data.deptMaps.coag.length}, ` +
    `backroom: ${data.deptMaps.backroom.length}`
);