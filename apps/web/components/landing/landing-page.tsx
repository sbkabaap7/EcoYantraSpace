"use client";

import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { useReducedMotion } from "motion/react";

import { Cursor }               from "./cursor";
import { Nav }                  from "./nav";
import { HeroSection }          from "./hero-section";
import { IntelligenceSection }  from "./intelligence-section";
import { CarbonSection }        from "./carbon-section";
import { AnomalySection }       from "./anomaly-section";
import { ForestSection }        from "./forest-section";
import { ArchitectureSection }  from "./architecture-section";
import { CtaSection }           from "./cta-section";

gsap.registerPlugin(ScrollTrigger);

/* ── Scroll-reveal for section elements ─────────── */
function useScrollReveal() {
  useEffect(() => {
    const targets = document.querySelectorAll<HTMLElement>(".reveal-up, .reveal-fade");

    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target as HTMLElement;
            el.style.animation =
              el.classList.contains("reveal-fade")
                ? "reveal-fade 0.85s cubic-bezier(0.16,1,0.3,1) forwards"
                : "reveal-up 0.85s cubic-bezier(0.16,1,0.3,1) forwards";
            obs.unobserve(el);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );

    targets.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);
}

/* ── Metric counter animation ────────────────────── */
function useCounters() {
  useEffect(() => {
    const counters = document.querySelectorAll<HTMLElement>("[data-count]");

    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target as HTMLElement;
          const target = parseFloat(el.dataset.count ?? "0");
          const suffix = el.dataset.suffix ?? "";
          const decimals = el.dataset.decimals ? parseInt(el.dataset.decimals) : 0;
          const duration = 1800;
          const start = performance.now();

          const tick = (now: number) => {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
            const current = target * eased;
            el.textContent = current.toFixed(decimals) + suffix;
            if (progress < 1) requestAnimationFrame(tick);
          };

          requestAnimationFrame(tick);
          obs.unobserve(el);
        });
      },
      { threshold: 0.5 }
    );

    counters.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);
}

/* ── Magnetic buttons ────────────────────────────── */
function useMagneticButtons() {
  useEffect(() => {
    const buttons = document.querySelectorAll<HTMLElement>(".btn-primary, .nav-cta");

    const handlers: { el: HTMLElement; onMove: (e: MouseEvent) => void; onLeave: () => void }[] = [];

    buttons.forEach((btn) => {
      const onMove = (e: MouseEvent) => {
        const rect = btn.getBoundingClientRect();
        const dx = e.clientX - (rect.left + rect.width / 2);
        const dy = e.clientY - (rect.top + rect.height / 2);
        gsap.to(btn, {
          x: dx * 0.22,
          y: dy * 0.22,
          duration: 0.4,
          ease: "power2.out",
        });
      };

      const onLeave = () => {
        gsap.to(btn, { x: 0, y: 0, duration: 0.5, ease: "elastic.out(1, 0.5)" });
      };

      btn.addEventListener("mousemove", onMove);
      btn.addEventListener("mouseleave", onLeave);
      handlers.push({ el: btn, onMove, onLeave });
    });

    return () => {
      handlers.forEach(({ el, onMove, onLeave }) => {
        el.removeEventListener("mousemove", onMove);
        el.removeEventListener("mouseleave", onLeave);
      });
    };
  }, []);
}

/* ── Main component ──────────────────────────────── */
export function LandingPage() {
  const reduced = useReducedMotion();

  /* Lenis smooth scroll with GSAP integration */
  useEffect(() => {
    if (reduced) return;

    const lenis = new Lenis({
      lerp: 0.075,
      smoothWheel: true,
      touchMultiplier: 1.5,
    });

    // Sync Lenis with GSAP ticker
    const tick = (time: number) => {
      lenis.raf(time * 1000);
    };
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    // Sync Lenis scroll updates with ScrollTrigger
    lenis.on("scroll", ScrollTrigger.update);

    return () => {
      lenis.destroy();
      gsap.ticker.remove(tick);
    };
  }, [reduced]);

  /* GSAP ScrollTrigger defaults */
  useEffect(() => {
    if (reduced) return;
    ScrollTrigger.defaults({ scroller: window });
    return () => {
      ScrollTrigger.getAll().forEach((st) => st.kill());
    };
  }, [reduced]);

  useScrollReveal();
  useCounters();
  useMagneticButtons();

  return (
    <div id="top" style={{ position: "relative" }}>
      {/* Film grain overlay */}
      <div className="noise-overlay" aria-hidden="true" />

      {/* Custom cursor (desktop only via CSS pointer media) */}
      {!reduced && <Cursor />}

      {/* Navigation */}
      <Nav />

      {/* ── Sections ─────────────────────────────── */}
      <main>
        <HeroSection />
        {/* ── Data readout ticker (HUD/terminal style) ─── */}
        <div className="data-readout" aria-hidden="true">
          <div className="data-readout__scroll">
            {/* Duplicate items for seamless loop */}
            {[...Array(2)].flatMap((_, pass) =>
              [
                { label: "CARBON·CO₂",    value: "412.4 ppm" },
                { label: "NDVI·SAHYADRI", value: "0.84" },
                { label: "TEMP·ANOMALY",  value: "+0.38°C" },
                { label: "ENERGY·DEMAND", value: "78.3 kWh" },
                { label: "FOREST·LOSS",   value: "16.7 ha" },
                { label: "DEVICES·LIVE",  value: "12 / 12" },
                { label: "FORECAST·H",    value: "72h horizon" },
                { label: "SENTINEL-2",    value: "2025-01 pass" },
                { label: "ISOLATIONFOREST", value: "0.12 score" },
                { label: "CONFIDENCE",    value: "91.2%" },
              ].map((d, i) => (
                <div key={`${pass}-${i}`} className="data-readout__item">
                  <span>{d.label}</span>
                  <strong>{d.value}</strong>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="metric-strip" role="region" aria-label="Platform statistics" style={{ padding: "0 var(--gutter)" }}>
          <div className="metric-strip__item">
            <span className="metric-strip__value" data-count="168" data-suffix="h">168h</span>
            <span className="metric-strip__label">Maximum forecast horizon</span>
          </div>
          <div className="metric-strip__item">
            <span className="metric-strip__value" data-count="12" data-suffix="+">12+</span>
            <span className="metric-strip__label">IoT asset categories</span>
          </div>
          <div className="metric-strip__item">
            <span className="metric-strip__value" data-count="0.60" data-decimals="2">0.60</span>
            <span className="metric-strip__label">Anomaly alert threshold</span>
          </div>
          <div className="metric-strip__item">
            <span className="metric-strip__value" data-count="2500" data-suffix="km²">2500km²</span>
            <span className="metric-strip__label">Max satellite area</span>
          </div>
        </div>

        <IntelligenceSection />
        <CarbonSection />
        <AnomalySection />
        <ForestSection />
        <ArchitectureSection />
      </main>

      <CtaSection />
    </div>
  );
}
