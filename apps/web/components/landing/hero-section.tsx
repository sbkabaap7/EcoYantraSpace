"use client";

import { useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { ArrowUpRight } from "lucide-react";
import gsap from "gsap";
import { SplitText } from "gsap/SplitText";

// Load heavy canvas only on client
const HeroBackground = dynamic(
  () => import("./hero-background").then((m) => m.HeroBackground),
  { ssr: false }
);

gsap.registerPlugin(SplitText);

const metrics = [
  { value: "168h",  label: "Forecast horizon" },
  { value: "12+",   label: "Asset types tracked" },
  { value: "0.60",  label: "Anomaly threshold" },
];

// Words that cycle in the headline (reference video style)
const CYCLE_WORDS = ["IMPACT.", "CARBON.", "FOREST.", "FUTURE."];

export function HeroSection() {
  const sectionRef   = useRef<HTMLElement>(null);
  const eyebrowRef   = useRef<HTMLDivElement>(null);
  const titleRef     = useRef<HTMLHeadingElement>(null);
  const cycleRef     = useRef<HTMLSpanElement>(null);
  const descRef      = useRef<HTMLParagraphElement>(null);
  const actRef       = useRef<HTMLDivElement>(null);
  const metricsRef   = useRef<HTMLDivElement>(null);
  const hudTopRef    = useRef<HTMLDivElement>(null);
  const hudBotRef    = useRef<HTMLDivElement>(null);
  const scanRef      = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | undefined;
    const ctx = gsap.context(() => {
      /* ── 1. Entrance timeline ──────────────────── */
      const tl = gsap.timeline({ defaults: { ease: "expo.out" } });

      // Eyebrow letter-by-letter
      if (eyebrowRef.current) {
        const split = new SplitText(eyebrowRef.current, { type: "chars" });
        tl.fromTo(
          split.chars,
          { opacity: 0, y: 14, rotateX: -40 },
          { opacity: 1, y: 0, rotateX: 0, duration: 0.7, stagger: 0.025 },
          0.2
        );
      }

      // Main headline — word-by-word with clip path
      if (titleRef.current) {
        const split = new SplitText(titleRef.current, { type: "words,lines" });
        tl.fromTo(
          split.lines,
          { clipPath: "inset(0 0 100% 0)", y: 60 },
          { clipPath: "inset(0 0 0% 0)", y: 0, duration: 1.1, stagger: 0.12 },
          0.45
        );
      }

      // Description fade
      tl.fromTo(
        descRef.current,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.85 },
        0.95
      );

      // Buttons
      tl.fromTo(
        actRef.current,
        { opacity: 0, y: 16 },
        { opacity: 1, y: 0, duration: 0.7 },
        1.1
      );

      // Metrics count-up + fade
      tl.fromTo(
        metricsRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.7 },
        1.25
      );

      // HUD brackets slide in from edges
      tl.fromTo(
        hudTopRef.current,
        { scaleX: 0, opacity: 0 },
        { scaleX: 1, opacity: 1, duration: 0.8, ease: "power3.out", transformOrigin: "left" },
        0.6
      );
      tl.fromTo(
        hudBotRef.current,
        { scaleX: 0, opacity: 0 },
        { scaleX: 1, opacity: 1, duration: 0.8, ease: "power3.out", transformOrigin: "right" },
        0.7
      );

      /* ── 2. Cyclic word swap (reference video style) ── */
      if (cycleRef.current) {
        let idx = 1;
        const el = cycleRef.current;

        const swap = () => {
          gsap.to(el, {
            y: -40,
            opacity: 0,
            duration: 0.35,
            ease: "power2.in",
            onComplete: () => {
              el.textContent = CYCLE_WORDS[idx % CYCLE_WORDS.length]!;
              idx++;
              gsap.fromTo(
                el,
                { y: 40, opacity: 0 },
                { y: 0, opacity: 1, duration: 0.45, ease: "power3.out" }
              );
            },
          });
        };

        intervalId = setInterval(swap, 2600);
      }
    }, sectionRef);

    return () => {
      if (intervalId) clearInterval(intervalId);
      ctx.revert();
    };
  }, []);

  /* ── Scan line anim via CSS var ───────────────────── */
  useEffect(() => {
    const scan = scanRef.current;
    if (!scan) return;

    let start: number;
    let raf: number;
    const dur = 3400; // ms per cycle

    const tick = (ts: number) => {
      if (!start) start = ts;
      const p = ((ts - start) % dur) / dur;
      scan.style.top = `${p * 100}%`;
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <section
      ref={sectionRef}
      className="hero"
      id="top"
      aria-labelledby="hero-headline"
      style={{ position: "relative", overflow: "hidden" }}
    >
      {/* ── Full-viewport animated background canvas ── */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
        }}
        aria-hidden="true"
      >
        <HeroBackground />
      </div>

      {/* ── Radial vignette over the canvas ─────────── */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
          background: `
            radial-gradient(ellipse 70% 60% at 50% 50%, transparent 30%, var(--bg) 100%),
            linear-gradient(to right, var(--bg) 0%, transparent 22%, transparent 78%, var(--bg) 100%),
            linear-gradient(to bottom, rgba(4,12,8,0.55) 0%, transparent 30%, transparent 75%, var(--bg) 100%)
          `,
          pointerEvents: "none",
        }}
      />

      {/* ── HUD bracket lines ────────────────────────── */}
      <div
        ref={hudTopRef}
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "14%",
          left: "var(--gutter)",
          right: "var(--gutter)",
          height: 1,
          background: "linear-gradient(to right, var(--green), rgba(0,232,122,0.12) 60%, transparent)",
          zIndex: 3,
          opacity: 0,
        }}
      />
      <div
        ref={hudBotRef}
        aria-hidden="true"
        style={{
          position: "absolute",
          bottom: "18%",
          left: "var(--gutter)",
          right: "var(--gutter)",
          height: 1,
          background: "linear-gradient(to left, var(--green), rgba(0,232,122,0.12) 60%, transparent)",
          zIndex: 3,
          opacity: 0,
        }}
      />

      {/* Scanning line */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "var(--gutter)",
          right: "var(--gutter)",
          zIndex: 3,
          pointerEvents: "none",
          overflow: "hidden",
          top: "14%",
          bottom: "18%",
        }}
      >
        <div
          ref={scanRef}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            height: 1,
            background: "linear-gradient(to right, transparent, rgba(0,232,122,0.45) 20%, rgba(0,232,122,0.7) 50%, rgba(0,232,122,0.45) 80%, transparent)",
            boxShadow: "0 0 12px 2px rgba(0,232,122,0.25)",
          }}
        />
      </div>

      {/* ── Corner HUD markers ───────────────────────── */}
      {[
        { top: "14%",  left: "var(--gutter)",  borderTop: "1px solid", borderLeft: "1px solid" },
        { top: "14%",  right: "var(--gutter)", borderTop: "1px solid", borderRight: "1px solid" },
        { bottom: "18%", left: "var(--gutter)",  borderBottom: "1px solid", borderLeft: "1px solid" },
        { bottom: "18%", right: "var(--gutter)", borderBottom: "1px solid", borderRight: "1px solid" },
      ].map((style, i) => (
        <div
          key={i}
          aria-hidden="true"
          style={{
            position: "absolute",
            width: 20,
            height: 20,
            borderColor: "rgba(0,232,122,0.65)",
            zIndex: 4,
            ...style,
          }}
        />
      ))}

      {/* ── Coordinates HUD text ─────────────────────── */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "calc(14% - 20px)",
          left: "var(--gutter)",
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          letterSpacing: "0.18em",
          color: "rgba(0,232,122,0.5)",
          zIndex: 4,
        }}
      >
        ECO-INTELLIGENCE / SCAN-ACTIVE
      </div>
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "calc(14% - 20px)",
          right: "var(--gutter)",
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          letterSpacing: "0.18em",
          color: "rgba(0,232,122,0.5)",
          zIndex: 4,
          textAlign: "right",
        }}
      >
        10.08°N · 77.00°E
      </div>
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          bottom: "calc(18% - 20px)",
          left: "var(--gutter)",
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          letterSpacing: "0.18em",
          color: "rgba(0,232,122,0.35)",
          zIndex: 4,
        }}
      >
        v3.0 · CARBON · ANOMALY · FOREST
      </div>

      {/* ── Actual hero content (z above canvas) ──────── */}
      <div style={{ position: "relative", zIndex: 5, display: "contents" }}>
        {/* Left: Copy */}
        <div className="hero__content">
          <div ref={eyebrowRef} className="hero__eyebrow" style={{ opacity: 0 }}>
            <span className="hero__eyebrow-dot" aria-hidden="true" />
            Climate Intelligence Platform&nbsp;·&nbsp;v3.0
          </div>

          <h1 ref={titleRef} className="hero__headline" id="hero-headline">
            TRACE<br />
            <em>
              <span ref={cycleRef} style={{ display: "inline-block" }}>
                IMPACT.
              </span>
            </em>
          </h1>

          <p ref={descRef} className="hero__desc" style={{ opacity: 0 }}>
            Three layers of AI-powered environmental intelligence — carbon forecasting,
            IoT anomaly detection, and satellite forest monitoring — unified in one platform.
          </p>

          <div ref={actRef} className="hero__actions" style={{ opacity: 0 }}>
            <a href="#intelligence" className="btn btn-primary">
              Explore Systems <ArrowUpRight size={15} aria-hidden="true" />
            </a>
            <a href="#platform" className="btn btn-ghost">
              View Architecture
            </a>
          </div>

          <div ref={metricsRef} className="hero__metrics" aria-label="Key platform metrics" style={{ opacity: 0 }}>
            {metrics.map((m) => (
              <div key={m.label} className="hero__metric">
                <strong>{m.value}</strong>
                <span>{m.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: keeps space — the morphing sphere lives inside the WebGL canvas */}
        <div className="hero__globe" aria-hidden="true" style={{ position: "relative" }}>
          {/* Floating data cards — sit on top of canvas */}
          <div className="globe-card globe-card--a" role="presentation">
            <span className="globe-card__label">Carbon Forecast</span>
            <span className="globe-card__value">72h</span>
            <span className="globe-card__badge">Live</span>
          </div>
          <div className="globe-card globe-card--b" role="presentation">
            <span className="globe-card__label">Anomalies Detected</span>
            <span className="globe-card__value">1,247</span>
            <span className="globe-card__badge">Updated</span>
          </div>
          <div className="globe-card globe-card--c" role="presentation">
            <span className="globe-card__label">Forest Coverage</span>
            <span className="globe-card__value">84.3%</span>
            <span className="globe-card__badge">Sentinel-2</span>
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="scroll-indicator" aria-hidden="true" style={{ zIndex: 6 }}>
        <div className="scroll-indicator__line" />
        <span>Scroll</span>
      </div>
    </section>
  );
}
