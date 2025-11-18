// ✅ firebaseConfig.js — Final Version
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBS-JGY1X6GLM7YVXVSJuYvti_utJXMS5I",
  authDomain: "vasundhara-4c6e5.firebaseapp.com",
  projectId: "vasundhara-4c6e5",
  storageBucket: "vasundhara-4c6e5.appspot.com",
  messagingSenderId: "544519199327",
  appId: "1:544519199327:web:7e3f4cf69bef3954f2bea9",
  measurementId: "G-H8J28B9B44",
};

// ✅ Ensure only one Firebase instance exists
let app;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
  console.log("🔥 Firebase initialized");
} else {
  app = getApp();
  console.log("♻️ Firebase already initialized — using existing app");
}

export const db = getFirestore(app);
