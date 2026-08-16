"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ArrowUpRight } from "lucide-react";

gsap.registerPlugin(ScrollTrigger);

/* ── Mini Carbon Chart SVG ───────────────────────── */
function CarbonMiniChart() {
  const points = [
    "10,70 30,60 50,55 70,62 90,50 110,45 130,52 150,40 170,38 190,44 210,35"
  ];
  return (
    <svg viewBox="0 0 220 80" fill="none" style={{ width: "100%", height: "auto" }}>
      {/* Confidence band */}
      <polyline
        points="10,78 30,68 50,63 70,72 90,58 110,53 130,61 150,47 170,45 190,52 210,42"
        fill="none"
        stroke="rgba(79,166,224,0.15)"
        strokeWidth="8"
      />
      {/* Actual line */}
      <polyline
        points={points[0]}
        fill="none"
        stroke="#4fa6e0"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Forecast dashed */}
      <polyline
        points="170,38 190,32 210,27"
        fill="none"
        stroke="#00e87a"
        strokeWidth="2"
        strokeDasharray="4 3"
        strokeLinecap="round"
      />
      {/* CO2 bars */}
      {[10,30,50,70,90,110,130,150,170,190,210].map((x, i) => (
        <rect key={i} x={x - 3} y={72 - (i % 4) * 6} width="6" height={(i % 4) * 6 + 4}
          fill="rgba(79,166,224,0.3)" rx="1" />
      ))}
    </svg>
  );
}

/* ── Mini Anomaly Pulse ──────────────────────────── */
function AnomalyMiniViz() {
  return (
    <svg viewBox="0 0 220 80" fill="none" style={{ width: "100%", height: "auto" }}>
      {/* Baseline */}
      <line x1="10" y1="50" x2="200" y2="50" stroke="rgba(232,170,58,0.2)" strokeWidth="1" strokeDasharray="3 4" />
      {/* Normal signal */}
      {[10,25,40,55,70,85,100,115,130].map((x, i) => (
        <circle key={i} cx={x} cy={50 + Math.sin(i) * 4} r="2" fill="rgba(232,170,58,0.5)" />
      ))}
      {/* Anomaly spike */}
      <polyline
        points="130,50 140,50 150,18 160,52 170,50"
        fill="none"
        stroke="#e8aa3a"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="150" cy="18" r="4" fill="#e8aa3a" />
      <circle cx="150" cy="18" r="10" fill="none" stroke="#e8aa3a" strokeWidth="1" strokeOpacity="0.4" />
      <circle cx="150" cy="18" r="16" fill="none" stroke="#e8aa3a" strokeWidth="0.5" strokeOpacity="0.2" />
      {/* Alert text */}
      <text x="158" y="18" fill="#e8aa3a" fontSize="8" fontWeight="600">ANOMALY</text>
    </svg>
  );
}

/* ── Mini Forest Grid ────────────────────────────── */
function ForestMiniViz() {
  const ndviColors = [
    "#004d1a","#006b24","#0a8a30","#18a842","#32c85e",
    "#8b1a1a","#c13030","#e85252","#005522","#00773a",
    "#0a6b28","#00a84a","#006b22","#004d18","#2a6640",
    "#005520","#0a9938","#00bf4a","#006b24","#003d14",
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: 3 }}>
      {ndviColors.map((c, i) => (
        <div
          key={i}
          style={{
            aspectRatio: "1",
            background: c,
            borderRadius: 2,
            animation: `tile-in 0.4s ease ${i * 0.02}s both`,
          }}
        />
      ))}
    </div>
  );
}

/* ── Chapters data ───────────────────────────────── */
const chapters = [
  {
    id:       "carbon",
    step:     "01",
    color:    "var(--carbon-color)",
    tag:      "Carbon Intelligence",
    headline: ["TRACE", "IMPACT."],
    desc:     "Forecast energy demand up to 168 hours ahead. Identify peak load, recommend cleaner operating windows, and model efficiency and renewable scenarios — all powered by a calibrated ML model.",
    link:     "#carbon",
    Visual:   CarbonMiniChart,
  },
  {
    id:       "anomaly",
    step:     "02",
    color:    "var(--anomaly-color)",
    tag:      "Anomaly Intelligence",
    headline: ["NOTICE", "THE BREAK."],
    desc:     "Detect unusual combinations of energy, current, temperature, and time-of-day using a hybrid Isolation Forest. Catch replay attacks, identify high-severity events, and route investigations to the right device.",
    link:     "/anomaly",
    Visual:   AnomalyMiniViz,
  },
  {
    id:       "forest",
    step:     "03",
    color:    "var(--forest-color)",
    tag:      "Forest Intelligence",
    headline: ["READ", "THE LAND."],
    desc:     "Automatically retrieve Sentinel-2 satellite imagery for any bounding box, compute NDVI change maps, and surface forest loss patches, hotspots, and carbon-exposure estimates.",
    link:     "#forest",
    Visual:   ForestMiniViz,
  },
];

export function IntelligenceSection() {
  const stageRef   = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const stage = stageRef.current;
      if (!stage) return;

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: stage,
          start: "top top",
          end: "+=280%",
          pin: true,
          scrub: 1.4,
          anticipatePin: 1,
          onUpdate: (self) => {
            if (progressRef.current) {
              progressRef.current.style.width = `${self.progress * 100}%`;
            }
          },
        },
      });

      const chapters = stage.querySelectorAll<HTMLElement>(".intel-chapter");

      // Chapter 0 already visible at start
      gsap.set(chapters[0]!, { opacity: 1, x: 0, y: 0, scale: 1 });
      gsap.set(chapters[1]!, { opacity: 0, x: 80 });
      gsap.set(chapters[2]!, { opacity: 0, scale: 0.9 });

      tl
        // 0→1 transition
        .to(chapters[0]!, { opacity: 0, x: -80, duration: 0.35 }, 0.28)
        .to(chapters[1]!, { opacity: 1, x: 0, duration: 0.35 }, 0.33)
        // 1→2 transition
        .to(chapters[1]!, { opacity: 0, y: -60, duration: 0.35 }, 0.65)
        .to(chapters[2]!, { opacity: 1, scale: 1, duration: 0.4 }, 0.68);
    },
    { scope: stageRef }
  );

  return (
    <section className="intel-section" id="intelligence" aria-label="Intelligence systems">
      <div ref={stageRef} className="intel-stage">
        {/* Progress bar */}
        <div className="intel-progress-bar" aria-hidden="true">
          <div ref={progressRef} className="intel-progress-bar__fill" />
        </div>

        {chapters.map((ch, idx) => (
          <div
            key={ch.id}
            className="intel-chapter"
            aria-hidden={idx !== 0}
            style={{ opacity: idx === 0 ? 1 : 0 }}
          >
            {/* Left: text */}
            <div>
              <div className="intel-chapter__step">
                <span className="intel-chapter__step-num">{ch.step}</span>
                <span style={{ color: ch.color }}>{ch.tag}</span>
              </div>
              <h2 className="intel-chapter__headline" style={{ color: ch.color === "var(--forest-color)" ? "var(--ink)" : "var(--ink)" }}>
                {ch.headline.map((line, i) => (
                  <span key={i} style={{ display: "block" }}>{line}</span>
                ))}
              </h2>
              <p className="intel-chapter__desc">{ch.desc}</p>
              <a href={ch.link} className="intel-chapter__link" style={{ color: ch.color }}>
                Explore module <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            </div>

            {/* Right: visual */}
            <div className="intel-visual">
              <div className="intel-visual__grid" aria-hidden="true" />
              <div style={{ padding: 24, width: "100%" }}>
                <ch.Visual />
              </div>
              {/* Corner label */}
              <div style={{
                position: "absolute",
                top: 16, right: 16,
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: ch.color,
                padding: "4px 10px",
                border: `1px solid ${ch.color}33`,
                borderRadius: 20,
                background: `${ch.color}11`,
              }}>
                {ch.tag}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
