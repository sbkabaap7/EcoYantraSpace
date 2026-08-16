"use client";

/* Code samples intentionally render literal JSON syntax. */
/* eslint-disable react/jsx-no-comment-textnodes, react/no-unescaped-entities */

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowUpRight, Map, Layers, GitCompare, TreePine } from "lucide-react";

/* ── NDVI tile colours (8×8 grid) ────────────────── */
// Values from -1 to 1 mapped to colours: red=bare/loss, amber=sparse, green=healthy
const NDVI_VALUES = [
  0.82, 0.78, 0.75, 0.88, 0.91, 0.85, 0.79, 0.83,
  0.76, 0.72, 0.68, 0.80, 0.87, 0.91, 0.88, 0.77,
  0.65, 0.58, 0.42, 0.31, 0.22, 0.75, 0.84, 0.80,
  0.70, 0.48, 0.15, -0.1, 0.08, 0.55, 0.78, 0.82,
  0.75, 0.52, 0.12, -0.2, 0.05, 0.48, 0.72, 0.80,
  0.78, 0.65, 0.35, 0.22, 0.42, 0.68, 0.80, 0.85,
  0.84, 0.80, 0.72, 0.68, 0.75, 0.82, 0.88, 0.90,
  0.86, 0.84, 0.80, 0.78, 0.82, 0.88, 0.91, 0.89,
];

function ndviToColor(val: number): string {
  if (val < -0.1) return "#8b1a1a";
  if (val < 0.1)  return "#c13030";
  if (val < 0.25) return "#d4622a";
  if (val < 0.4)  return "#e8aa3a";
  if (val < 0.55) return "#c8d44a";
  if (val < 0.65) return "#78c846";
  if (val < 0.75) return "#32a832";
  if (val < 0.85) return "#0e8c24";
  return "#006b18";
}

// Tiles where deforestation is detected (change > threshold)
const CHANGE_TILES = new Set([11, 12, 13, 18, 19, 20, 27, 28, 35, 36]);

/* ── Forest Section ──────────────────────────────── */
export function ForestSection() {
  const [showChange, setShowChange] = useState(false);
  const [animIndex, setAnimIndex] = useState(0);

  // Progressively reveal tiles
  useEffect(() => {
    const timer = setInterval(() => {
      setAnimIndex((p) => Math.min(p + 4, NDVI_VALUES.length));
    }, 60);
    return () => clearInterval(timer);
  }, []);

  // Toggle change overlay every 4 seconds
  useEffect(() => {
    const id = setInterval(() => setShowChange((p) => !p), 4000);
    return () => clearInterval(id);
  }, []);

  const features = [
    { icon: <Map size={13} />,       color: "var(--forest-color)", text: "Automatic Sentinel-2 NDVI analysis — no image upload required" },
    { icon: <Layers size={13} />,    color: "var(--green)",        text: "Forest loss/gain patches with ranked hotspots and carbon exposure range" },
    { icon: <GitCompare size={13} />,color: "var(--carbon-color)", text: "Before/after composite with seasonal comparability scoring" },
    { icon: <TreePine size={13} />,  color: "var(--green)",        text: "Optional U-Net trainable path for labeled mask datasets" },
  ];

  const forestStats = [
    { label: "Forest coverage",  value: "84.3%",  color: "var(--green)" },
    { label: "Area analysed",    value: "2,450km²", color: "var(--forest-color)" },
    { label: "Loss detected",    value: "16.7ha",  color: "#ff7272" },
    { label: "Confidence",       value: "91.2%",   color: "var(--green)" },
  ];

  return (
    <section className="forest-section" id="forest" aria-labelledby="forest-title">
      <div className="forest-inner">
        {/* Header */}
        <div className="deepdive__eyebrow" style={{ color: "var(--forest-color)" }}>
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: "0.12em",
            border: "1px solid rgba(0,232,122,0.3)", borderRadius: 4,
            padding: "2px 7px", background: "rgba(0,232,122,0.08)",
          }}>03</span>
          Forest Intelligence
        </div>
        <h2 className="deepdive__title" id="forest-title" style={{ marginBottom: 8 }}>READ<br />THE LAND.</h2>
        <p className="deepdive__desc">
          VanDrishti retrieves Sentinel-2 satellite imagery, computes NDVI change maps,
          and surfaces forest loss and gain for any bounding box on Earth —
          from a single JSON request.
        </p>

        <div className="forest-grid">
          {/* Copy side */}
          <div>
            <ul className="feature-list" role="list">
              {features.map((f, i) => (
                <li key={i}>
                  <div className="feature-icon" style={{ background: `${f.color}18`, color: f.color }}>
                    {f.icon}
                  </div>
                  <span>{f.text}</span>
                </li>
              ))}
            </ul>

            {/* Forest stats */}
            <div className="forest-stats">
              {forestStats.map((s) => (
                <div key={s.label} className="forest-stat">
                  <span className="forest-stat__value" style={{ color: s.color }}>{s.value}</span>
                  <span className="forest-stat__label">{s.label}</span>
                </div>
              ))}
            </div>

            <Link href="/forest" className="forest-dashboard-cta">
              <span className="forest-dashboard-cta__icon" aria-hidden="true"><Map size={16} /></span>
              <span>
                <small>Forest Intelligence Workspace</small>
                <strong>Explore the geospatial analysis <ArrowUpRight size={14} aria-hidden="true" /></strong>
              </span>
            </Link>

            {/* API code snippet */}
            <div className="code-block" style={{ marginTop: 24 }}>
              <div className="code-block__header">
                <div className="code-block__dots"><span /><span /><span /></div>
                <span className="code-block__lang">JSON</span>
              </div>
              <div className="code-block__body">
                <span className="t-comment">// POST /api/v1/forest/analyses</span>{"\n"}
                {"{"}{"\n"}
                {"  "}<span className="t-key">"projectId"</span>{"  : "}<span className="t-string">"66e..."</span>{",\n"}
                {"  "}<span className="t-key">"west"</span>{"       : "}<span className="t-number">76.98</span>{",\n"}
                {"  "}<span className="t-key">"south"</span>{"      : "}<span className="t-number">10.08</span>{",\n"}
                {"  "}<span className="t-key">"east"</span>{"       : "}<span className="t-number">77.00</span>{",\n"}
                {"  "}<span className="t-key">"north"</span>{"      : "}<span className="t-number">10.10</span>{",\n"}
                {"  "}<span className="t-key">"before_start"</span>{": "}<span className="t-string">"2023-01-01"</span>{",\n"}
                {"  "}<span className="t-key">"after_start"</span>{" : "}<span className="t-string">"2025-01-01"</span>{",\n"}
                {"  "}<span className="t-key">"sensitivity"</span>{" : "}<span className="t-number">0.55</span>{"\n"}
                {"}"}
              </div>
            </div>
          </div>

          {/* NDVI visualisation */}
          <div>
            <div className="ndvi-container" aria-label="NDVI satellite tile grid" role="img">
              <div className="ndvi-container__header">
                <span className="ndvi-container__title">NDVI Change Map — Sentinel-2</span>
                <div className="compare-badges">
                  <span className="compare-badge compare-badge--before">Before 2023</span>
                  <span className="compare-badge compare-badge--after">After 2025</span>
                </div>
              </div>

              {/* NDVI legend */}
              <div className="ndvi-legend">
                <span>Bare</span>
                <div className="ndvi-legend__bar" />
                <span>Dense</span>
              </div>

              {/* Tile grid */}
              <div className="ndvi-grid" style={{ marginTop: 10 }}>
                {NDVI_VALUES.map((val, i) => {
                  const isChange = CHANGE_TILES.has(i);
                  return (
                    <div
                      key={i}
                      className="ndvi-tile"
                      role="cell"
                      aria-label={`NDVI ${val.toFixed(2)}`}
                      style={{
                        background: ndviToColor(val),
                        opacity: i < animIndex ? 1 : 0,
                        animationDelay: `${i * 20}ms`,
                        position: "relative",
                      }}
                      title={`NDVI: ${val.toFixed(2)}${isChange ? " — Change detected" : ""}`}
                    >
                      {isChange && showChange && (
                        <div className="ndvi-change-overlay" aria-hidden="true" />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Change detection status */}
              <div style={{
                marginTop: 12,
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontSize: 11,
                color: "var(--muted)",
              }}>
                <div style={{
                  width: 7, height: 7, borderRadius: "50%",
                  background: showChange ? "#ff5252" : "var(--green)",
                  boxShadow: `0 0 6px ${showChange ? "#ff5252" : "var(--green)"}`,
                  flexShrink: 0,
                  animation: "blink 1.5s ease infinite",
                }} />
                {showChange
                  ? "Change detection overlay — 16.7ha loss detected"
                  : "Healthy canopy — NDVI &gt; 0.65 in 78% of tiles"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
