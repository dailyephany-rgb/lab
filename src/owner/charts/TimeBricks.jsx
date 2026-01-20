
// src/owner/charts/TimeBricks.jsx

import React, { useMemo, useRef, useEffect } from "react";
import "./TimeBricks.css";

export default function TimeBricks({ unifiedRows, height, onBrickClick = () => {} }) {
  
  // Ref for the main scrollable area (timeline content)
  const contentScrollRef = useRef(null);
  // Ref for the header scrollable area (hours scale)
  const headerScrollRef = useRef(null);

  const dayMinutes = 1440;
  const rowHeight = 36;
  const topScaleHeight = 48;
  const leftColumnWidth = 100;

  // 3 px per minute (4320 total)
  const timelineWidth = 4320; 

  const rows = useMemo(() => {
    if (!unifiedRows || unifiedRows.length === 0) return [];

    const sorted = [...unifiedRows].sort(
      (a, b) => new Date(a.timePrinted) - new Date(b.timePrinted)
    );

    return sorted.map((r, index) => {
      const scanned = r.timeScanned ? new Date(r.timeScanned) : null;
      const saved = r.timeSaved ? new Date(r.timeSaved) : null;

      let start = 0, end = 0;

      if (scanned) {
        const midnight = new Date(scanned);
        midnight.setHours(0, 0, 0, 0);
        start = Math.floor((scanned - midnight) / 60000);
      }

      if (saved) {
        const midnight = new Date(saved);
        midnight.setHours(0, 0, 0, 0);
        end = Math.floor((saved - midnight) / 60000);
      }

      return {
        ...r, 
        index,
        start,
        duration: Math.max(1, end - start)
      };
    });
  }, [unifiedRows]);

  // Synchronize horizontal scrolling between the header and the content
  useEffect(() => {
    const headerEl = headerScrollRef.current;
    const contentEl = contentScrollRef.current;

    if (headerEl && contentEl) {
      const handleScroll = (e) => {
        // Scroll the other element when one is scrolled
        if (e.currentTarget === contentEl) {
          headerEl.scrollLeft = contentEl.scrollLeft;
        } else if (e.currentTarget === headerEl) {
          contentEl.scrollLeft = headerEl.scrollLeft;
        }
      };

      headerEl.addEventListener('scroll', handleScroll);
      contentEl.addEventListener('scroll', handleScroll);

      return () => {
        headerEl.removeEventListener('scroll', handleScroll);
        contentEl.removeEventListener('scroll', handleScroll);
      };
    }
  }, []);

  if (rows.length === 0) return <div className="timebricks-empty">No data</div>;

  const contentHeight = rows.length * rowHeight;
  
  return (
    <div className="timebricks-container">
      
      {/* 1. UNIFIED HEADER SCALE: Combines "Reg No" label and the hours scale */}
      <div
        className="timebricks-unified-header"
        style={{ height: topScaleHeight }}
      >
        
        {/* FIXED LEFT HEADER: Reg No label */}
        <div
          className="timebricks-left-header"
          style={{ width: leftColumnWidth }}
        >
          Reg No
        </div>
        
        {/* SCROLLABLE HOURS WRAPPER (Synced scroll) */}
        <div 
          className="timebricks-scroll" 
          ref={headerScrollRef}
          // The scroll wrapper must stretch to fill the rest of the available space
          style={{ flexGrow: 1 }} 
        >
          <div
            className="timebricks-top-scale"
            // The internal scale div must be the full width to contain the hours
            style={{ width: timelineWidth }}
          >
            {Array.from({ length: 24 }).map((_, hour) => {
              const label =
                hour === 0 ? "12 AM" :
                hour < 12 ? `${hour} AM` :
                hour === 12 ? "12 PM" :
                `${hour - 12} PM`;

              return (
                <div
                  key={hour}
                  className="timebricks-top-label"
                  style={{ width: timelineWidth / 24 }}
                >
                  {label}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {/* --- END OF UNIFIED HEADER --- */}

      {/* 2. MAIN CONTENT AREA */}
      <div className="timebricks-table"> 

        {/* LEFT COLUMN: The sticky rows below the header */}
        <div
          className="timebricks-left-column"
          style={{
            width: leftColumnWidth,
            minWidth: leftColumnWidth,
            height: contentHeight // Set height to match content for sticky effect
          }}
        >
          {rows.map(r => (
            <div
              key={r.regNo} 
              className="timebricks-ylabel"
              style={{ height: rowHeight }}
            >
              {r.regNo}
            </div>
          ))}
        </div>

        {/* SCROLLABLE TIMELINE CONTENT WRAPPER */}
        <div 
          className="timebricks-scroll" 
          ref={contentScrollRef} 
          style={{ flexGrow: 1 }} // Ensures it takes available horizontal space
        >
          {/* BRICKS AREA (The wide internal content) */}
          <div
            className="timebricks-area"
            style={{ height: contentHeight, width: timelineWidth }}
          >
            {rows.map(r => {
              // Bricks are positioned absolutely, left is minutes * 3px/min, width is duration * 3px/min
              const leftPx = r.start * 3; 
              const widthPx = r.duration * 3;

              // Center the brick vertically within the row (36px row height, brick is 22px tall)
              const topOffset = (rowHeight - 22) / 2; 

              return (
                <div
                  key={r.regNo} 
                  className="timebrick"
                  onClick={() => onBrickClick(r)}
                  style={{
                    top: r.index * rowHeight + topOffset, // Calculate brick's top position
                    left: leftPx,
                    width: Math.max(28, widthPx)
                  }}
                >
                  {r.duration}m
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

