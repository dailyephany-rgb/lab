

// src/owner/charts/CountsBar.jsx
import React from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export default function CountsBar({ counts }) {
  const data = [
    {
      name: "Collected",
      value:
        counts.totalPatientsCollected ??
        counts.totalPrinted ?? 0,    // backward compatibility
    },
    {
      name: "Saved",
      value:
        counts.totalPatientsSaved ??
        counts.saved ?? 0,
    },
    {
      name: "Validated",
      value:
        counts.totalPatientsValidated ??
        counts.validated ?? 0,
    },
  ];

  return (
    <div style={{ width: "100%", height: 260 }}>
      <ResponsiveContainer>
        <BarChart data={data}>
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="value" fill="#2563eb" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
