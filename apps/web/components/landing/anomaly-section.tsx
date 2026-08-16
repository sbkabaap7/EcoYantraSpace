"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Shield, GitBranch, Clock, AlertTriangle, ArrowUpRight } from "lucide-react";

/* ── IoT Node positions ──────────────────────────── */
const NODES = [
  { id: "N01", x: 50,  y: 48,  type: "renewable",  label: "Solar Farm A" },
  { id: "N02", x: 22,  y: 28,  type: "building",   label: "Block C-4" },
  { id: "N03", x: 75,  y: 22,  type: "cold-chain",  label: "Cold Store" },
  { id: "N04", x: 38,  y: 72,  type: "mobility",   label: "EV Hub 7" },
  { id: "N05", x: 80,  y: 68,  type: "storage",    label: "Battery A" },
  { id: "N06", x: 62,  y: 44,  type: "anomaly",    label: "Device #17" }, // the anomaly device
  { id: "N07", x: 15,  y: 60,  type: "water",      label: "Pump Stn 2" },
  { id: "N08", x: 88,  y: 42,  type: "circularity",label: "Waste Proc" },
];

const EDGES = [
  ["N01","N06"], ["N02","N06"], ["N03","N06"],
  ["N04","N06"], ["N05","N06"], ["N07","N06"],
  ["N01","N02"], ["N03","N08"], ["N04","N05"],
];

const TYPE_COLOR: Record<string, string> = {
  renewable:   "#00e87a",
  building:    "#4fa6e0",
  "cold-chain":"#7ad4e0",
  mobility:    "#a0e87a",
  storage:     "#4fa6e0",
  anomaly:     "#ff5252",
  water:       "#4fa6e0",
  circularity: "#e8aa3a",
};

/* ── Alert feed data ─────────────────────────────── */
const ALERTS = [
  { id: 1, severity: "high",   device: "Device #17",   msg: "Energy 4,820 kWh — 10× expected range",   time: "00:04" },
  { id: 2, severity: "medium", device: "Cold Store",    msg: "Temperature drift detected (+3.2°C)",      time: "02:18" },
  { id: 3, severity: "low",    device: "Solar Farm A",  msg: "Power factor below threshold (0.78)",       time: "05:33" },
  { id: 4, severity: "clear",  device: "EV Hub 7",      msg: "Baseline restored after 2h deviation",     time: "06:41" },
  { id: 5, severity: "medium", device: "Battery A",     msg: "Unusual discharge pattern at off-peak",    time: "08:15" },
];

/* ── IoT Network SVG ─────────────────────────────── */
function IotNetworkSvg({ highlightedNode }: { highlightedNode: string | null }) {
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: "100%" }}>
      {/* Grid lines */}
      {[20, 40, 60, 80].map((v) => (
        <g key={v}>
          <line x1={v} y1={0} x2={v} y2={100} stroke="rgba(0,232,122,0.06)" strokeWidth="0.3" />
          <line x1={0} y1={v} x2={100} y2={v} stroke="rgba(0,232,122,0.06)" strokeWidth="0.3" />
        </g>
      ))}

      {/* Edges */}
      {EDGES.map(([a, b]) => {
        const na = NODES.find((n) => n.id === a)!;
        const nb = NODES.find((n) => n.id === b)!;
        const isAnomalyEdge = a === "N06" || b === "N06";
        return (
          <line
            key={`${a}-${b}`}
            x1={na.x} y1={na.y}
            x2={nb.x} y2={nb.y}
            stroke={isAnomalyEdge ? "rgba(255,82,82,0.25)" : "rgba(0,232,122,0.12)"}
            strokeWidth={isAnomalyEdge ? "0.6" : "0.4"}
            strokeDasharray={isAnomalyEdge ? "2 2" : undefined}
          />
        );
      })}

      {/* Data pulse along edges */}
      {EDGES.slice(0, 4).map(([a, b], i) => {
        const na = NODES.find((n) => n.id === a)!;
        const nb = NODES.find((n) => n.id === b)!;
        return (
          <circle key={`pulse-${i}`} r="0.8" fill="#00e87a" opacity="0.9">
            <animateMotion
              dur={`${2 + i * 0.4}s`}
              repeatCount="indefinite"
              path={`M${na.x},${na.y} L${nb.x},${nb.y}`}
            />
          </circle>
        );
      })}

      {/* Nodes */}
      {NODES.map((node) => {
        const color = TYPE_COLOR[node.type] ?? "#00e87a";
        const isAnomaly = node.type === "anomaly";
        const isHighlighted = highlightedNode === node.id;

        return (
          <g key={node.id} transform={`translate(${node.x},${node.y})`}>
            {/* Pulse rings for anomaly */}
            {isAnomaly && (
              <>
                <circle r="4" fill="none" stroke="#ff5252" strokeWidth="0.5" opacity="0.6">
                  <animate attributeName="r" values="3;7;3" dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.8;0;0.8" dur="2s" repeatCount="indefinite" />
                </circle>
                <circle r="2" fill="none" stroke="#ff5252" strokeWidth="0.4" opacity="0.4">
                  <animate attributeName="r" values="2;5;2" dur="2s" begin="0.5s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.6;0;0.6" dur="2s" begin="0.5s" repeatCount="indefinite" />
                </circle>
              </>
            )}

            {/* Node circle */}
            <circle
              r={isAnomaly ? "3.5" : "2.5"}
              fill={isAnomaly ? "#1a0a0a" : "#081410"}
              stroke={color}
              strokeWidth={isAnomaly ? "1.2" : "0.6"}
              style={{ filter: isAnomaly ? `drop-shadow(0 0 3px ${color})` : undefined }}
            />
            <circle r={isAnomaly ? "1.4" : "1"} fill={color} opacity={isAnomaly ? 1 : 0.8} />

            {/* Label (only visible nodes) */}
            {(isAnomaly || isHighlighted) && (
              <text
                y="-4"
                textAnchor="middle"
                fontSize="3.2"
                fontWeight="600"
                fill={color}
                style={{ fontFamily: "Inter" }}
              >
                {node.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function AnomalySection() {
  const [visibleAlerts, setVisibleAlerts] = useState<typeof ALERTS>([]);
  const timerRef = useRef<ReturnType<typeof setInterval>>(null);
  const highlighted = NODES.find((node) => node.label === visibleAlerts[0]?.device)?.id ?? null;

  // Sequentially reveal alerts to simulate live feed
  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      if (i < ALERTS.length) {
        const alert = ALERTS[i];
        if (alert) {
          setVisibleAlerts((prev) => [alert, ...prev]);
        }
        i++;
      } else {
        clearInterval(interval);
      }
    }, 900);
    timerRef.current = interval;
    return () => clearInterval(interval);
  }, []);

  const features = [
    { icon: <Shield size={13} />, color: "var(--anomaly-color)", text: "Hybrid detection: Isolation Forest + robust median/MAD envelopes" },
    { icon: <GitBranch size={13} />, color: "var(--green)", text: "Device-specific adaptive baselines — no hard-coded thresholds" },
    { icon: <AlertTriangle size={13} />, color: "#ff7272", text: "Replay attack protection — duplicate message IDs flagged as security signals" },
    { icon: <Clock size={13} />, color: "var(--carbon-color)", text: "30-day audit trail stored in persistent SQLite database" },
  ];

  return (
    <section className="anomaly-section" id="anomaly" aria-labelledby="anomaly-title">
      <div className="anomaly-inner">
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 40, flexWrap: "wrap" }}>
          <div>
            <div className="deepdive__eyebrow" style={{ color: "var(--anomaly-color)" }}>
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: "0.12em",
                border: "1px solid rgba(232,170,58,0.3)", borderRadius: 4,
                padding: "2px 7px", background: "rgba(232,170,58,0.08)",
              }}>02</span>
              Anomaly Intelligence
            </div>
            <h2 className="deepdive__title" id="anomaly-title">NOTICE<br />THE BREAK.</h2>
          </div>
          <p className="deepdive__desc" style={{ maxWidth: 360 }}>
            EcoSphere Sentinel watches device telemetry in real time. When a reading breaks the
            expected pattern — energy spike, rapid change, forecast residual, replay risk — it surfaces
            an actionable alert with signal contributions and a recommended next action.
          </p>
        </div>

        {/* Main grid */}
        <div className="anomaly-grid">
          {/* IoT network */}
          <div>
            <div className="iot-network" aria-label="IoT device network visualization" role="img">
              <div className="iot-network__bg-grid" aria-hidden="true" />
              <IotNetworkSvg highlightedNode={highlighted} />
              {/* Corner labels */}
              <div style={{
                position: "absolute", bottom: 12, left: 14,
                fontSize: 9, fontWeight: 700, letterSpacing: "0.14em",
                color: "var(--muted)", textTransform: "uppercase",
              }}>
                12 Assets · 30 Days
              </div>
              <div style={{
                position: "absolute", top: 12, right: 14,
                display: "flex", gap: 12, fontSize: 9, fontWeight: 600,
              }}>
                <span style={{ color: "var(--green)" }}>● Normal</span>
                <span style={{ color: "#ff5252" }}>● Anomaly</span>
              </div>
            </div>

            {/* Device metrics */}
            <div className="device-metrics" style={{ marginTop: 14 }}>
              <div className="device-metric">
                <span className="device-metric__value" style={{ color: "#ff5252" }}>1</span>
                <span className="device-metric__label">High severity</span>
              </div>
              <div className="device-metric">
                <span className="device-metric__value" style={{ color: "var(--anomaly-color)" }}>2</span>
                <span className="device-metric__label">Medium alerts</span>
              </div>
              <div className="device-metric">
                <span className="device-metric__value" style={{ color: "var(--green)" }}>9</span>
                <span className="device-metric__label">Devices normal</span>
              </div>
            </div>
          </div>

          {/* Alert feed + features */}
          <div>
            {/* Alert feed */}
            <div className="alert-header">
              <span className="alert-header__title">Live Alert Feed</span>
              <span className="alert-count">{visibleAlerts.length} events</span>
            </div>
            <div className="alert-feed" role="log" aria-live="polite" aria-label="Security alerts">
              {visibleAlerts.map((a) => (
                <div key={a.id} className="alert-item" style={{ animationDelay: "0ms" }}>
                  <div className={`alert-dot alert-dot--${a.severity}`} aria-hidden="true" />
                  <div className="alert-item__info">
                    <div className="alert-item__device">{a.device}</div>
                    <div className="alert-item__msg">{a.msg}</div>
                  </div>
                  <div className="alert-item__time">{a.time}s</div>
                </div>
              ))}
            </div>

            {/* Feature list */}
            <ul className="feature-list" role="list" style={{ marginTop: 24 }}>
              {features.map((f, i) => (
                <li key={i}>
                  <div className="feature-icon" style={{ background: `${f.color}18`, color: f.color }}>
                    {f.icon}
                  </div>
                  <span>{f.text}</span>
                </li>
              ))}
            </ul>

            <Link href="/anomaly" className="anomaly-dashboard-cta">
              <span className="anomaly-dashboard-cta__icon" aria-hidden="true"><Shield size={16} /></span>
              <span>
                <small>Anomaly Intelligence Workspace</small>
                <strong>Inspect explainable detections <ArrowUpRight size={14} aria-hidden="true" /></strong>
              </span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
