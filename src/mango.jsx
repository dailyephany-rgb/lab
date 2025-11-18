

import React, { useState, useRef } from "react";
import "./mango.css";
import testMapping from "./test_mapping.json";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebaseConfig.js";

export default function Mango() {
  const departments = [
    { key: "haem", label: "Haematology" },
    { key: "bio", label: "Bio-Chemistry" },
    { key: "coa", label: "Coagulation" },
    { key: "sero", label: "Serology" },
    { key: "micro", label: "Microbiology" },
    { key: "hormone", label: "Hormones" },
    { key: "urine", label: "Urine Examination" },
  ];

  const allTests = Object.entries(testMapping).flatMap(([dept, tests]) =>
    tests.map((t) => ({ dept, test: t }))
  );

  // Refs
  const fatherRef = useRef();
  const doctorRef = useRef();
  const categoryRef = useRef();
  const sourceRef = useRef();
  const regRef = useRef();
  const diagnosticRef = useRef();
  const timePrintedRef = useRef();
  const ageRef = useRef();
  const ageUnitRef = useRef();
  const genderRef = useRef();
  const phoneRef = useRef();
  const searchRef = useRef();

  const goNext = (e, nextRef) => {
    if (e.key === "Enter") {
      e.preventDefault();
      nextRef?.current?.focus();
    }
  };

  // FORM DATA
  const [formData, setFormData] = useState({
    source: "OPD",
    regNo: "",
    diagnosticNo: "",
    timePrinted: "",
    name: "",
    father: "",
    age: "",
    ageUnit: "years",
    gender: "M",
    phone: "",
    doctor: "",
    category: "",
    tests: {},
    expandedDept: {},
    selectedTests: [],
  });

  // ERROR STATE FOR RED HIGHLIGHTING
  const [errors, setErrors] = useState({});

  // SEARCH
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState([]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setErrors((prev) => ({ ...prev, [name]: false }));
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchText(value);

    if (!value.trim()) {
      setSearchResults([]);
      return;
    }

    const results = allTests.filter((t) =>
      t.test.toLowerCase().includes(value.toLowerCase())
    );

    setSearchResults(results.slice(0, 25));
  };

  const handleSelectSearchTest = (dept, test) => {
    setErrors((prev) => ({ ...prev, selectedTests: false }));
    setFormData((prev) => {
      if (!prev.selectedTests.some((t) => t.dept === dept && t.test === test)) {
        return {
          ...prev,
          selectedTests: [...prev.selectedTests, { dept, test }],
        };
      }
      return prev;
    });

    setSearchText("");
    setSearchResults([]);
    searchRef.current?.focus();
  };

  const toggleDept = (key) => {
    setFormData((prev) => ({
      ...prev,
      expandedDept: {
        ...prev.expandedDept,
        [key]: !prev.expandedDept[key],
      },
    }));
  };

  // VALIDATION
  const validateForm = () => {
    const requiredFields = [
      "name",
      "father",
      "doctor",
      "category",
      "source",
      "regNo",
      "diagnosticNo",
      "age",
      "ageUnit",
      "gender",
      "phone",
    ];

    let newErrors = {};

    requiredFields.forEach((field) => {
      if (!formData[field] || String(formData[field]).trim() === "") {
        newErrors[field] = true;
      }
    });

    if (!formData.selectedTests || formData.selectedTests.length === 0) {
      newErrors.selectedTests = true;
      alert("❗ Please select at least one test.");
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // SAVE ENTRY
  const handleSave = async () => {
    if (!validateForm()) {
      alert("❗ Please fill all required fields before saving.");
      return;
    }

    try {
      // ⭐ FIXED: timePrinted now matches timezone like timeCollected
      const fullTimePrinted = formData.timePrinted
        ? (() => {
            const [h, m] = formData.timePrinted.split(":");
            const d = new Date();
            d.setHours(Number(h));
            d.setMinutes(Number(m));
            d.setSeconds(0);
            d.setMilliseconds(0);
            return d;
          })()
        : serverTimestamp();

      const entryData = {
        regNo: formData.regNo,
        diagnosticNo: formData.diagnosticNo,
        timePrinted: fullTimePrinted, // ⭐ Firestore Timestamp with correct timezone
        name: formData.name,
        father: formData.father,
        age: formData.age,
        ageUnit: formData.ageUnit,
        gender: formData.gender,
        phone: formData.phone,
        doctor: formData.doctor,
        category: formData.category,
        source: formData.source,
        selectedTests: formData.selectedTests,

        // ⭐ Already perfect
        timeCollected: serverTimestamp(),
      };

      await addDoc(collection(db, "master_register"), entryData);

      alert("✅ Entry saved successfully!");

      // RESET FORM
      setFormData({
        source: "OPD",
        regNo: "",
        diagnosticNo: "",
        timePrinted: "",
        name: "",
        father: "",
        age: "",
        ageUnit: "years",
        gender: "M",
        phone: "",
        doctor: "",
        category: "",
        tests: {},
        expandedDept: {},
        selectedTests: [],
      });

      setSearchText("");
      setSearchResults([]);
      setErrors({});

      sourceRef.current?.focus();
    } catch (error) {
      console.error("❌ Error saving:", error);
      alert("Failed to save entry.");
    }
  };

  return (
    <div className="mango-container">
      <header className="mango-header">
        <div className="mango-header-left">
          <img
            src="https://upload.wikimedia.org/wikipedia/commons/6/6b/Letter_V.svg"
            alt="Hospital Logo"
            className="mango-logo"
          />
          <h1>Vasundhara Hospital Limited</h1>
        </div>
        <div className="mango-status">
          <span className="dot"></span> Last Sync <strong>30s ago</strong> | Connected | Records:{" "}
          <strong>127</strong>
        </div>
      </header>

      <div className="mango-content">
        {/* LEFT PANEL */}
        <div className="left-panel">
          <button className="scan-btn">📷 Scan QR</button>
          <p className="or-text">or</p>

          <label>Source</label>
          <select
            ref={sourceRef}
            name="source"
            className={errors.source ? "input-error" : ""}
            value={formData.source}
            onChange={handleInputChange}
            onKeyDown={(e) => goNext(e, regRef)}
          >
            <option value="OPD">OPD</option>
            <option value="IPD">IPD</option>
            <option value="Third Floor">Third Floor</option>
          </select>

          <label>Reg. No.</label>
          <input
            ref={regRef}
            name="regNo"
            className={errors.regNo ? "input-error" : ""}
            value={formData.regNo}
            onChange={handleInputChange}
            onKeyDown={(e) => goNext(e, diagnosticRef)}
          />

          <label>Diagnostic No.</label>
          <input
            ref={diagnosticRef}
            name="diagnosticNo"
            className={errors.diagnosticNo ? "input-error" : ""}
            value={formData.diagnosticNo}
            onChange={handleInputChange}
            onKeyDown={(e) => goNext(e, timePrintedRef)}
          />

          <label>🕓 Time Printed</label>
          <input
            type="time"
            ref={timePrintedRef}
            name="timePrinted"
            value={formData.timePrinted}
            onChange={handleInputChange}
            onKeyDown={(e) => goNext(e, ageRef)}
          />

          <label>Age</label>
          <div className="inline-input">
            <input
              ref={ageRef}
              name="age"
              type="number"
              className={errors.age ? "input-error" : ""}
              value={formData.age}
              onChange={handleInputChange}
              onKeyDown={(e) => goNext(e, ageUnitRef)}
            />

            <select
              ref={ageUnitRef}
              name="ageUnit"
              className={errors.ageUnit ? "input-error" : ""}
              value={formData.ageUnit}
              onChange={handleInputChange}
              onKeyDown={(e) => goNext(e, genderRef)}
            >
              <option value="years">Years</option>
              <option value="months">Months</option>
            </select>

            <select
              ref={genderRef}
              name="gender"
              className={errors.gender ? "input-error" : ""}
              value={formData.gender}
              onChange={handleInputChange}
              onKeyDown={(e) => goNext(e, phoneRef)}
            >
              <option value="M">M</option>
              <option value="F">F</option>
            </select>
          </div>

          <label>Phone Number</label>
          <input
            ref={phoneRef}
            name="phone"
            className={errors.phone ? "input-error" : ""}
            value={formData.phone}
            onChange={handleInputChange}
            onKeyDown={(e) => goNext(e, searchRef)}
            placeholder="Enter phone number"
          />

          <label>Search Tests</label>
          <input
            ref={searchRef}
            type="text"
            placeholder="Type to search..."
            value={searchText}
            onChange={handleSearchChange}
          />

          {errors.selectedTests && (
            <p style={{ color: "red", marginTop: 4 }}>
              ❗ Please select at least one test.
            </p>
          )}

          {searchResults.length > 0 && (
            <div className="search-results-box">
              {searchResults.map((item, i) => (
                <div
                  key={i}
                  className="search-result-item"
                  onClick={() => handleSelectSearchTest(item.dept, item.test)}
                >
                  <strong>{item.test}</strong>
                  <span style={{ marginLeft: 8, color: "#777" }}>
                    ({item.dept})
                  </span>
                </div>
              ))}
            </div>
          )}

          <h4>Departments</h4>
          <div className="checkboxes">
            {departments.map((dept) => (
              <div key={dept.key} className="dept-block">
                <div className="dept-header" onClick={() => toggleDept(dept.key)}>
                  <strong>{dept.label}</strong>
                  <span>{formData.expandedDept[dept.key] ? "▲" : "▼"}</span>
                </div>

                {formData.expandedDept[dept.key] && (
                  <div className="test-list">
                    {(testMapping[dept.label] || []).map((test, idx) => {
                      const isChecked = formData.selectedTests.some(
                        (t) => t.dept === dept.label && t.test === test
                      );

                      return (
                        <label key={idx} className="test-item">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) =>
                              handleTestCheckbox(dept.label, test, e.target.checked)
                            }
                          />
                          {test}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="left-buttons">
            <button className="print-btn">🖨 Print Labels</button>
            <button className="save-btn" onClick={handleSave}>
              💾 Save Entry
            </button>
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="right-panel">
          <h3>Manual Entry</h3>

          <label>Patient Name</label>
          <input
            name="name"
            className={errors.name ? "input-error" : ""}
            value={formData.name}
            onChange={handleInputChange}
            onKeyDown={(e) => goNext(e, fatherRef)}
          />

          <label>Father / Husband</label>
          <input
            ref={fatherRef}
            name="father"
            className={errors.father ? "input-error" : ""}
            value={formData.father}
            onChange={handleInputChange}
            onKeyDown={(e) => goNext(e, doctorRef)}
          />

          <label>Doctor / Consultant</label>
          <select
            ref={doctorRef}
            name="doctor"
            className={errors.doctor ? "input-error" : ""}
            value={formData.doctor}
            onChange={handleInputChange}
            onKeyDown={(e) => goNext(e, categoryRef)}
          >
            <option value="">Select Doctor</option>
            <option>Dr. Anil Sharma</option>
            <option>Dr. Renu Makwana</option>
            <option>Dr. Sanjay Makwana</option>
            <option>Dr. Kapil</option>
          </select>

          <label>Category</label>
          <select
            ref={categoryRef}
            name="category"
            className={errors.category ? "input-error" : ""}
            value={formData.category}
            onChange={handleInputChange}
            onKeyDown={(e) => goNext(e, sourceRef)}
          >
            <option value="">Select Category</option>
            <option>RGHS</option>
            <option>CGHS</option>
            <option>General</option>
            <option>Insurance</option>
          </select>

          <label>Auto-generated Preview</label>
          <div className="preview-box">
            {`${formData.regNo || ""} HEM 01 | ${formData.regNo || ""} BIO-1 VJ7780 COA 01`}
          </div>

          {formData.selectedTests.length > 0 && (
            <div className="selected-tests">
              <h4>Selected Tests</h4>
              <ul>
                {formData.selectedTests.map((t, i) => (
                  <li key={i}>✅ {t.dept} — {t.test}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="sync-status">
            <button className="sync-btn">🔄 Sync Status</button>
          </div>
        </div>
      </div>
    </div>
  );
}