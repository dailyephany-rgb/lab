


import React, { useState, useRef, useEffect } from "react";
import "./mango.css";
import testMapping from "./test_mapping.json";
import { collection, serverTimestamp, setDoc, doc, getDoc } from "firebase/firestore";
import { db } from "./firebaseConfig.js";

export default function Mango() {
  const departments = [
    { key: "haem", label: "Haematology" },
    { key: "bio", label: "Bio-Chemistry" },
    { key: "coa", label: "Coagulation" },
    { key: "sero", label: "Serology" },
    { key: "micro", label: "MicroBiology" },
    { key: "path", label: "Clinical Pathology" },
    { key: "hormone", label: "Hormones" },
    { key: "urine", label: "Urine Examination" },
  ];

  const allTests = departments.flatMap((d) =>
    (testMapping[d.label] || []).map((test) => ({
      dept: d.label,
      test,
    }))
  );

  // Refs
  const nameRef = useRef();
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

  const [errors, setErrors] = useState({});
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [isEditMode, setIsEditMode] = useState(false);

  useEffect(() => {
    const editDataRaw = localStorage.getItem("editPatientData");
    if (editDataRaw) {
      const editData = JSON.parse(editDataRaw);
      let timeStr = "";
      if (editData.timePrinted) {
        const d = editData.timePrinted.seconds 
          ? new Date(editData.timePrinted.seconds * 1000) 
          : new Date(editData.timePrinted);
        timeStr = d.getHours().toString().padStart(2, '0') + ":" + d.getMinutes().toString().padStart(2, '0');
      }
      setFormData({ ...editData, timePrinted: timeStr, expandedDept: {} });
      setIsEditMode(true);
      localStorage.removeItem("editPatientData");
      alert(`Editing Entry: ${editData.regNo}`);
    }
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setErrors((prev) => ({ ...prev, [name]: false }));
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchText(value);
    setFocusedIndex(-1);
    if (!value.trim()) { setSearchResults([]); return; }
    const lower = value.toLowerCase();
    const results = allTests.filter((t) => t.test.toLowerCase().startsWith(lower));
    setSearchResults(results.slice(0, 50));
  };

  const handleSearchKeyDown = (e) => {
    if (searchResults.length === 0) {
      if (e.key === "Enter") goNext(e, searchRef);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIndex((prev) => (prev < searchResults.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIndex((prev) => (prev > 0 ? prev - 1 : searchResults.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = focusedIndex >= 0 ? searchResults[focusedIndex] : searchResults[0];
      if (item) handleSelectSearchTest(item.dept, item.test);
    }
  };

  const handleSelectSearchTest = (dept, test) => {
    setFormData((prev) => {
      if (!prev.selectedTests.some((t) => t.dept === dept && t.test === test)) {
        return { ...prev, selectedTests: [...prev.selectedTests, { dept, test }] };
      }
      return prev;
    });
    setSearchText("");
    setSearchResults([]);
    setFocusedIndex(-1);
    searchRef.current?.focus();
  };

  const handleTestCheckbox = (dept, test, isChecked) => {
    setFormData((prev) => {
      if (isChecked) {
        if (!prev.selectedTests.some((t) => t.dept === dept && t.test === test)) {
          return { ...prev, selectedTests: [...prev.selectedTests, { dept, test }] };
        }
      } else {
        return { ...prev, selectedTests: prev.selectedTests.filter((t) => !(t.dept === dept && t.test === test)) };
      }
      return prev;
    });
  };

  // --- ADDED: Test removal logic for Selected Tests list ---
  const handleRemoveSelectedTest = (index) => {
    setFormData((prev) => {
      const newList = [...prev.selectedTests];
      newList.splice(index, 1);
      return { ...prev, selectedTests: newList };
    });
  };

  const toggleDept = (key) => {
    setFormData((prev) => ({
      ...prev,
      expandedDept: { ...prev.expandedDept, [key]: !prev.expandedDept[key] },
    }));
  };

  const goNext = (e, nextRef) => {
    if (e.key === "Enter") {
      e.preventDefault();
      nextRef?.current?.focus();
    }
  };

  const validateForm = () => {
    const requiredFields = ["name", "father", "doctor", "category", "source", "regNo", "diagnosticNo", "age", "phone"];
    let newErrors = {};
    requiredFields.forEach((f) => { if (!formData[f]) newErrors[f] = true; });
    if (!formData.selectedTests?.length) newErrors.selectedTests = true;
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) {
      alert("❗ Please fill all required fields.");
      return;
    }

    const regNo = String(formData.regNo).trim();
    const docRef = doc(db, "master_register", regNo);

    try {
      if (!isEditMode) {
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          alert(`⚠️ Entry already exists for Reg No: ${regNo}. Form will now clear.`);
          
          setFormData({
            source: "OPD", regNo: "", diagnosticNo: "", timePrinted: "",
            name: "", father: "", age: "", ageUnit: "years", gender: "M",
            phone: "", doctor: "", category: "", tests: {}, expandedDept: {}, selectedTests: [],
          });
          
          nameRef.current?.focus();
          return;
        }
      }

      const fullTimePrinted = formData.timePrinted
        ? (() => {
            const [h, m] = formData.timePrinted.split(":");
            const d = new Date();
            d.setHours(Number(h)); d.setMinutes(Number(m));
            return d;
          })()
        : serverTimestamp();

      const entryData = {
        ...formData,
        regNo,
        timePrinted: fullTimePrinted,
        timeCollected: isEditMode ? formData.timeCollected : serverTimestamp(),
      };
      
      delete entryData.expandedDept; 

      await setDoc(docRef, entryData, { merge: true });
      alert(`✅ Entry ${isEditMode ? "Updated" : "Saved"} successfully!`);

      setFormData({
        source: "OPD", regNo: "", diagnosticNo: "", timePrinted: "",
        name: "", father: "", age: "", ageUnit: "years", gender: "M",
        phone: "", doctor: "", category: "", tests: {}, expandedDept: {}, selectedTests: [],
      });
      setIsEditMode(false);
      nameRef.current?.focus();
    } catch (error) {
      console.error(error);
      alert("Error saving entry.");
    }
  };

  return (
    <div className="mango-container">
      <header className="mango-header">
        <div className="mango-header-left">
          <img src="https://upload.wikimedia.org/wikipedia/commons/6/6b/Letter_V.svg" alt="Logo" className="mango-logo" />
          <h1>Vasundhara Hospital Limited</h1>
        </div>
      </header>

      <div className="mango-content">
        <div className="left-panel">
          <button className="scan-btn">📷 Scan QR</button>
          <p className="or-text">or</p>

          <label>Source</label>
          <select ref={sourceRef} name="source" value={formData.source} onChange={handleInputChange} onKeyDown={(e) => goNext(e, regRef)}>
            <option value="OPD">OPD</option>
            <option value="IPD">IPD</option>
            <option value="Third Floor">Third Floor</option>
          </select>

          <label>Reg. No. {isEditMode && <span style={{color:'orange'}}>(EDITING)</span>}</label>
          <input ref={regRef} name="regNo" className={errors.regNo ? "input-error" : ""} value={formData.regNo} onChange={handleInputChange} onKeyDown={(e) => goNext(e, diagnosticRef)} disabled={isEditMode} />

          <label>Diagnostic No.</label>
          <input ref={diagnosticRef} name="diagnosticNo" className={errors.diagnosticNo ? "input-error" : ""} value={formData.diagnosticNo} onChange={handleInputChange} onKeyDown={(e) => goNext(e, timePrintedRef)} />

          <label>🕓 Time Printed</label>
          <input type="time" ref={timePrintedRef} name="timePrinted" value={formData.timePrinted} onChange={handleInputChange} onKeyDown={(e) => goNext(e, ageRef)} />

          <label>Age</label>
          <div className="inline-input">
            <input ref={ageRef} name="age" type="number" className={errors.age ? "input-error" : ""} value={formData.age} onChange={handleInputChange} onKeyDown={(e) => goNext(e, ageUnitRef)} />
            <select ref={ageUnitRef} name="ageUnit" value={formData.ageUnit} onChange={handleInputChange} onKeyDown={(e) => goNext(e, genderRef)}>
              <option value="years">Years</option><option value="months">Months</option><option value="days">Days</option>
            </select>
            <select ref={genderRef} name="gender" value={formData.gender} onChange={handleInputChange} onKeyDown={(e) => goNext(e, phoneRef)}>
              <option value="M">M</option><option value="F">F</option>
            </select>
          </div>

          <label>Phone Number</label>
          <input ref={phoneRef} name="phone" value={formData.phone} onChange={handleInputChange} onKeyDown={(e) => goNext(e, searchRef)} />

          <label>Search Tests</label>
          <div className="search-wrapper">
            <input ref={searchRef} type="text" placeholder="Type to search..." value={searchText} onChange={handleSearchChange} onKeyDown={handleSearchKeyDown} />
            {searchResults.length > 0 && (
              <div className="search-results-box">
                {searchResults.map((item, i) => (
                  <div key={i} className={`search-result-item ${i === focusedIndex ? "focused" : ""}`} onClick={() => handleSelectSearchTest(item.dept, item.test)}>
                    <strong>{item.test}</strong> <span>({item.dept})</span>
                  </div>
                ))}
              </div>
            )}
          </div>

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
                      const isChecked = formData.selectedTests.some((t) => t.dept === dept.label && t.test === test);
                      return (
                        <label key={idx} className="test-item">
                          <input type="checkbox" checked={isChecked} onChange={(e) => handleTestCheckbox(dept.label, test, e.target.checked)} />
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
            <button className="save-btn" onClick={handleSave}>{isEditMode ? "💾 Update Entry" : "💾 Save Entry"}</button>
          </div>
        </div>

        <div className="right-panel">
          <h3>Manual Entry</h3>
          <label>Patient Name</label>
          <input ref={nameRef} name="name" className={errors.name ? "input-error" : ""} value={formData.name} onChange={handleInputChange} onKeyDown={(e) => goNext(e, fatherRef)} />
          
          <label>Father / Husband</label>
          <input ref={fatherRef} name="father" className={errors.father ? "input-error" : ""} value={formData.father} onChange={handleInputChange} onKeyDown={(e) => goNext(e, doctorRef)} />
          
          <label>Doctor / Consultant</label>
          <select ref={doctorRef} name="doctor" value={formData.doctor} onChange={handleInputChange} onKeyDown={(e) => goNext(e, categoryRef)}>
             <option value="">Select Doctor</option>
             <option>Dr. Anil Sharma</option>
             <option>Dr. Renu Makwana</option>
             <option>Dr. Sanjay Makwana</option>
             <option>Dr. Kapil Kumar Raheja</option>
             <option>Dr. Vivek Lakhawat</option>
             <option>Sanjeev Sanghvi</option>
             <option>Dr. Akhil Govil</option>
             <option>Dr. Jitendra Khetawat</option>
             <option>Dr. Ashish Joshi</option>
             <option>Dr. Ashok Bishnoi</option>
             <option>Consultant Gynaecology</option>
             <option>Consultant ART</option>
             <option>Dr. Vinod Shaily</option>
             <option>Dr. Dabi</option>
             <option>Dr. Saurabh Kuvera</option>
             <option>Dr. Pravesh Vyas</option>
             <option>Dr. Neha Agarwal</option>
             <option>Dr. Jyotsana Sharma</option>
          </select>
          
          <label>Category</label>
          <select ref={categoryRef} name="category" value={formData.category} onChange={handleInputChange} onKeyDown={(e) => goNext(e, sourceRef)}>
            <option value="">Select Category</option>
            <option>RGHS</option>
            <option>CGHS</option>
            <option>General</option>
            <option>Insurance</option>
          </select>

          {/* --- UPDATED: List with removal button to allow editing selected tests --- */}
          {formData.selectedTests.length > 0 && (
            <div className="selected-tests">
              <h4>Selected Tests</h4>
              <ul style={{ listStyle: "none", padding: 0 }}>
                {formData.selectedTests.map((t, i) => (
                  <li key={i} style={{ 
                    display: "flex", 
                    justifyContent: "space-between", 
                    alignItems: "center",
                    padding: "4px 0" 
                  }}>
                    <span>✅ {t.dept} — {t.test}</span>
                    <button 
                      onClick={() => handleRemoveSelectedTest(i)}
                      style={{
                        background: "#ff4d4d",
                        color: "white",
                        border: "none",
                        borderRadius: "50%",
                        width: "20px",
                        height: "20px",
                        cursor: "pointer",
                        lineHeight: "18px",
                        fontWeight: "bold",
                        fontSize: "14px"
                      }}
                      title="Remove test"
                    >
                      −
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
