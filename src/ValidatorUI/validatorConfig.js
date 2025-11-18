
import biochemRouting from "../biochem_testRouting.json";
import hormoneRouting from "../hormone_testRouting.json";
import coagRouting from "../coag_testRouting.json";
import backroomRouting from "../backroom_routing.json";

export const validatorConfigs = {
  // 🧪 Biochemistry + Hormones
  biochem_main: {
    title: "Biochemistry — Main Analyzer",
    collection: "biochemistry_register",
    tests: biochemRouting.MainAnalyzer.tests,
  },
  hormones_main: {
    title: "Hormones — Main Analyzer",
    collection: "hormones_register",
    tests: hormoneRouting.MainAnalyzer.tests,
  },
  biochem_backup: {
    title: "Biochemistry — Backup Analyzer",
    collection: "biochem_backup",
    tests: biochemRouting.BackupAnalyzer.tests,
  },
  hormones_backup: {
    title: "Hormones — Backup Analyzer",
    collection: "hormones_backup",
    tests: hormoneRouting.BackupAnalyzer.tests,
  },

  // 🩸 Coagulation + Haematology
  coagulation: {
    title: "Coagulation Department",
    collection: "coagulation_register",
    tests: coagRouting.Analyzer.tests,
  },
  haematology: {
    title: "Haematology Department",
    collection: "haematology_register",
    tests: ["Haemogram", "HB Haemoglobin", "Lamellar Body Count"],
  },

  // 🧬 Backroom Departments
  bloodgroup_testing: {
    title: "Blood Group & Rh Type — Testing",
    collection: "bloodgroup_testing_register",
    tests: ["ABO GROUP & RH TYPE"],
  },
  bloodgroup_retesting: {
    title: "Blood Group & Rh Type — Retesting",
    collection: "bloodgroup_retesting_register",
    tests: ["ABO GROUP & RH TYPE"],
  },
  serology: {
    title: "Serology Register",
    collection: "serology_register",
    tests: backroomRouting.SerologyRegister,
  },
  rapidcard: {
    title: "Rapid Card Register",
    collection: "rapid_card_register",
    tests: backroomRouting.RapidCardRegister,
  },
  urine: {
    title: "Urine Analysis Register",
    collection: "urine_analysis_register",
    tests: backroomRouting.UrineAnalysisRegister,
  },
  esr: {
    title: "ESR Register",
    collection: "esr_register",
    tests: ["ESR TEST"],
  },
};