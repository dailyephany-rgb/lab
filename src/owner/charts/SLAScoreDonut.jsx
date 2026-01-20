

import React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Label } from "recharts";

export default function SLAScoreDonut({ total = 0, within = 0 }) {
  // If total is 3, and within is 3 (because 30/30 is now a pass), 
  // violations will be 0.
  const violations = Math.max(0, total - within);
  
  const data = [
    { name: "Within SLA", value: within, color: "#22c55e" }, // Green
    { name: "Violations", value: violations, color: "#ef4444" }, // Red
  ];

  const percentage = total > 0 ? Math.round((within / total) * 100) : 100;

  return (
    <div style={{ width: "100%", height: 200, position: "relative" }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={data}
            innerRadius={60}
            outerRadius={80}
            paddingAngle={5}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
            <Label
              value={`${percentage}%`}
              position="center"
              fill="#374151"
              style={{ fontSize: "24px", fontWeight: "bold" }}
            />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div style={{ textAlign: "center", fontSize: "12px", color: "#6b7280" }}>
        {within} Within / {violations} Violations
      </div>
    </div>
  );
}
