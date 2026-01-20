

// src/owner/charts/StackedStageLines.jsx
import React, { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid
} from "recharts";

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload) return null;

  const ordered = [
    payload.find(p => p.dataKey === "printedToCollected"),
    payload.find(p => p.dataKey === "collectedToScanned"),
    payload.find(p => p.dataKey === "scannedToSaved"),
    payload.find(p => p.dataKey === "savedToValidated"),
  ].filter(Boolean);

  return (
    <div
      style={{
        background: "white",
        border: "1px solid #ccc",
        padding: "8px 12px",
        borderRadius: "4px"
      }}
    >
      <div style={{ fontWeight: "bold", marginBottom: 4 }}>{label}</div>

      {ordered.map((item, index) => (
        <div key={index} style={{ color: item.stroke }}>
          {item.name}: {item.value} min
        </div>
      ))}
    </div>
  );
};

export default function StackedStageLines({ unifiedRows }) {
  const data = useMemo(() => {
    if (!unifiedRows || unifiedRows.length === 0) return [];

    const sorted = [...unifiedRows].sort(
      (a, b) => new Date(a.timePrinted) - new Date(b.timePrinted)
    );

    return sorted.map((p, index) => {
      const tP = p.timePrinted   ? new Date(p.timePrinted).getTime() : null;
      const tC = p.timeCollected ? new Date(p.timeCollected).getTime() : null;
      const tS = p.timeScanned   ? new Date(p.timeScanned).getTime() : null;
      const tSv= p.timeSaved     ? new Date(p.timeSaved).getTime() : null;
      const tV = p.timeValidated ? new Date(p.timeValidated).getTime() : null;

      const pc = tP && tC ? Math.max(0, Math.round((tC - tP) / 60000)) : 0;
      const cs = tC && tS ? Math.max(0, Math.round((tS - tC) / 60000)) : 0;
      const ss = tS && tSv ? Math.max(0, Math.round((tSv - tS) / 60000)) : 0;
      const sv = tSv && tV ? Math.max(0, Math.round((tV - tSv) / 60000)) : 0;

      return {
        x: index + 1,
        printedToCollected: pc,
        collectedToScanned: cs,
        scannedToSaved: ss,
        savedToValidated: sv
      };
    });
  }, [unifiedRows]);

  const maxVal = data.reduce(
    (m, d) =>
      Math.max(
        m,
        d.printedToCollected +
        d.collectedToScanned +
        d.scannedToSaved +
        d.savedToValidated
      ),
    0
  );

  const yMax = Math.ceil((maxVal + 5) / 20) * 20;

  return (
    <div style={{ width: "100%", height: 380 }}>
      <ResponsiveContainer>
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />

          <XAxis
            dataKey="x"
            label={{
              value: "Patient Sequence (sorted by Printed Time)",
              position: "insideBottom",
              offset: -5
            }}
          />

          <YAxis
            label={{ value: "Minutes", angle: -90, position: "insideLeft" }}
            domain={[0, yMax]}
            ticks={[...Array(yMax / 20 + 1)].map((_, i) => i * 20)}
          />

          <Tooltip content={<CustomTooltip />} />

          {/* ✔ LEGEND PERFECTLY BELOW AXIS */}
          <Legend
            verticalAlign="bottom"
            align="center"
            wrapperStyle={{
              marginTop: 45,     // ← pushes it BELOW the X-axis labels cleanly
              paddingTop: 10
            }}
            payload={[
              { value: "Printed → Collected", type: "square", color: "#4f46e5" },
              { value: "Collected → Scanned", type: "square", color: "#dc2626" },
              { value: "Scanned → Saved",   type: "square", color: "#059669" },
              { value: "Saved → Validated", type: "square", color: "#f59e0b" }
            ]}
          />

          <Area
            type="monotone"
            dataKey="printedToCollected"
            stroke="#4f46e5"
            fill="#c7d2fe"
            stackId="1"
          />
          <Area
            type="monotone"
            dataKey="collectedToScanned"
            stroke="#dc2626"
            fill="#fecaca"
            stackId="1"
          />
          <Area
            type="monotone"
            dataKey="scannedToSaved"
            stroke="#059669"
            fill="#bbf7d0"
            stackId="1"
          />
          <Area
            type="monotone"
            dataKey="savedToValidated"
            stroke="#f59e0b"
            fill="#fef3c7"
            stackId="1"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}