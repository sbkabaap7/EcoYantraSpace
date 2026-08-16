"use client";

import { ArrowUpRight } from "lucide-react";

/* ── Architecture Layer data ─────────────────────── */
const layers = [
  {
    icon: "🌐",
    bg:   "rgba(0,232,122,0.12)",
    color:"var(--green)",
    name: "Web Application",
    desc: "Next.js 16 App Router · React 19 · TailwindCSS 4",
    tech: "Port 3000",
  },
  {
    icon: "⚡",
    bg:   "rgba(79,166,224,0.12)",
    color:"var(--carbon-color)",
    name: "API Gateway",
    desc: "Express 5 · JWT Auth · BullMQ · Rate Limiting · OpenTelemetry",
    tech: "Port 4000",
  },
  {
    icon: "🗄️",
    bg:   "rgba(232,170,58,0.12)",
    color:"var(--anomaly-color)",
    name: "Data Layer",
    desc: "MongoDB (Mongoose) · Redis (ioredis) · AWS S3 (artifacts)",
    tech: "Managed",
  },
  {
    icon: "🧠",
    bg:   "rgba(0,232,122,0.08)",
    color:"var(--green)",
    name: "ML Services",
    desc: "CarbonSense · EcoSphere Sentinel · VanDrishti — FastAPI / Python",
    tech: "Internal",
  },
];

const principles = [
  {
    title: "Security boundary",
    desc:  "Python ML services are never exposed to the browser. All requests flow through the Express API which handles auth, rate-limiting, and tenancy.",
  },
  {
    title: "Async by design",
    desc:  "Satellite forest analysis is queued via BullMQ with automatic retries, exponential backoff, and S3 artifact storage for large image outputs.",
  },
  {
    title: "Observable",
    desc:  "Every request carries a unique ID, is logged with Pino, traced with OpenTelemetry, and exception-monitored with Sentry.",
  },
];

export function ArchitectureSection() {
  return (
    <section className="arch-section" id="platform" aria-labelledby="arch-title">
      <div className="arch-inner">
        {/* Left: text */}
        <div>
          <div className="deepdive__eyebrow" style={{ color: "var(--green)" }}>
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: "0.12em",
              border: "1px solid rgba(0,232,122,0.3)", borderRadius: 4,
              padding: "2px 7px", background: "rgba(0,232,122,0.08)",
            }}>04</span>
            Platform Architecture
          </div>
          <h2 className="deepdive__title" id="arch-title">ONE<br />SIGNAL FIELD.</h2>
          <p className="deepdive__desc">
            A security-first monorepo built for production. The Node.js API gateway
            is the single entry point — validating, authenticating, queuing,
            and orchestrating all three ML intelligence modules.
          </p>

          {/* Principles */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 8 }}>
            {principles.map((p) => (
              <div key={p.title} style={{
                padding: "16px 18px",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                background: "var(--bg-elevated)",
              }}>
                <div style={{
                  fontSize: 12, fontWeight: 700,
                  color: "var(--ink)",
                  marginBottom: 6,
                  letterSpacing: "0.01em",
                }}>
                  {p.title}
                </div>
                <div style={{ fontSize: 13, color: "var(--ink-dim)", lineHeight: 1.6 }}>
                  {p.desc}
                </div>
              </div>
            ))}
          </div>

          <a href="https://github.com" className="btn btn-ghost" style={{ marginTop: 28, display: "inline-flex" }}>
            View architecture docs <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </div>

        {/* Right: layer diagram */}
        <div className="arch-layers" aria-label="System architecture layers">
          {layers.map((layer, i) => (
            <div key={layer.name}>
              <div className="arch-layer" tabIndex={0}>
                <div
                  className="arch-layer__icon"
                  style={{ background: layer.bg }}
                  aria-hidden="true"
                >
                  <span style={{ fontSize: 18 }}>{layer.icon}</span>
                </div>
                <div>
                  <div className="arch-layer__name">{layer.name}</div>
                  <div className="arch-layer__desc">{layer.desc}</div>
                </div>
                <div className="arch-layer__tech" style={{ borderColor: layer.color, color: layer.color }}>
                  {layer.tech}
                </div>
              </div>
              {i < layers.length - 1 && (
                <div className="arch-connector" aria-hidden="true">
                  {/* Animated data packet */}
                  <svg
                    viewBox="0 0 1 24"
                    style={{
                      position: "absolute",
                      top: 0,
                      left: -2,
                      width: 5,
                      height: 24,
                      overflow: "visible",
                    }}
                    aria-hidden="true"
                  >
                    <circle cx="0.5" cy="6" r="2.5" fill={layers[i]!.color} opacity="0.9">
                      <animate
                        attributeName="cy"
                        values="0;24"
                        dur={`${1.2 + i * 0.3}s`}
                        repeatCount="indefinite"
                      />
                      <animate
                        attributeName="opacity"
                        values="1;0"
                        dur={`${1.2 + i * 0.3}s`}
                        repeatCount="indefinite"
                      />
                    </circle>
                  </svg>
                </div>
              )}
            </div>
          ))}

          {/* Security note */}
          <div style={{
            marginTop: 20,
            padding: "12px 16px",
            border: "1px solid rgba(0,232,122,0.2)",
            borderRadius: "var(--radius-sm)",
            background: "rgba(0,232,122,0.04)",
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 12,
            color: "var(--green)",
          }}>
            <span style={{ fontSize: 16 }}>🔒</span>
            ML services are never directly exposed to browser traffic
          </div>
        </div>
      </div>
    </section>
  );
}
