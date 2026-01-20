

import React, { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export default function DelayHistogram({ violators }) {
  const data = useMemo(() => {
    // Initialize buckets for excess time categories
    const buckets = { "0-5": 0, "5-10": 0, "10-20": 0, "20+": 0 };
    
    (violators || []).forEach(v => {
      // v.excess is calculated in the data fetcher as (Actual Duration - Allowed Limit)
      const d = v.excess;
      
      // Categorize based on the amount of EXTRA time taken
      // Only count if there is an actual delay (d > 0)
      if (d > 0 && d <= 5) buckets["0-5"]++;
      else if (d > 5 && d <= 10) buckets["5-10"]++;
      else if (d > 10 && d <= 20) buckets["10-20"]++;
      else if (d > 20) buckets["20+"]++;
    });
    
    return Object.keys(buckets).map(k => ({ name: k, value: buckets[k] }));
  }, [violators]);

  return (
    <div style={{ width: "100%", height: 200 }}>
      <ResponsiveContainer>
        <BarChart data={data}>
          <XAxis dataKey="name" />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Bar dataKey="value" fill="#ef4444" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
