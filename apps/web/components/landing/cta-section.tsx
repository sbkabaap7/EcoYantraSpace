"use client";

import { ArrowUpRight } from "lucide-react";

export function CtaSection() {
  return (
    <>
      {/* ── CTA ───────────────────────────────────────── */}
      <section className="cta-section" id="contact" aria-labelledby="cta-title">
        {/* Glow orb */}
        <div className="cta-section__orb" aria-hidden="true" />

        <p className="cta-section__eyebrow" aria-hidden="true">The field is open</p>

        <h2 className="cta-section__title" id="cta-title">
          MAKE THE<br />
          INVISIBLE<br />
          <em>DECISIVE.</em>
        </h2>

        <p className="cta-section__sub">
          Environmental intelligence for consequential work.
          Carbon, anomaly, and forest monitoring — unified.
        </p>

        <div className="cta-section__actions" style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
          <a href="/register" className="btn btn-primary" style={{ height: 56, padding: "0 32px", fontSize: 15 }}>
            Create a workspace <ArrowUpRight size={16} aria-hidden="true" />
          </a>
          <a href="/login" className="btn btn-ghost" style={{ height: 56 }}>
            Sign in
          </a>
        </div>

        {/* Tagline strip */}
        <div style={{
          position: "absolute",
          bottom: 52,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          gap: "clamp(24px,4vw,80px)",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: "var(--muted)",
        }} aria-hidden="true">
          <span>Carbon</span>
          <span style={{ color: "var(--border-strong)" }}>·</span>
          <span>Anomaly</span>
          <span style={{ color: "var(--border-strong)" }}>·</span>
          <span>Forest</span>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────── */}
      <footer>
        <div className="footer__inner">
          {/* Brand */}
          <div>
            <span className="footer__brand-name">ECO<em>YANTRA</em>SPACE</span>
            <p className="footer__tagline">
              Production climate intelligence for energy, ecosystems, and infrastructure.
              Built as a pnpm monorepo.
            </p>
          </div>

          {/* Systems */}
          <div>
            <p className="footer__col-title">Systems</p>
            <ul className="footer__links">
              <li><a href="#carbon">Carbon Intelligence</a></li>
              <li><a href="#anomaly">Anomaly Detection</a></li>
              <li><a href="#forest">Forest Monitoring</a></li>
              <li><a href="#platform">Architecture</a></li>
            </ul>
          </div>

          {/* Platform */}
          <div>
            <p className="footer__col-title">Platform</p>
            <ul className="footer__links">
              <li><a href="/dashboard">Workspace</a></li>
              <li><a href="/login">Sign in</a></li>
              <li><a href="/register">Create account</a></li>
            </ul>
          </div>

          {/* Stack */}
          <div>
            <p className="footer__col-title">Stack</p>
            <ul className="footer__links">
              <li><a href="https://nextjs.org">Next.js 16</a></li>
              <li><a href="https://expressjs.com">Express 5</a></li>
              <li><a href="https://fastapi.tiangolo.com">FastAPI</a></li>
              <li><a href="https://mongoosejs.com">MongoDB</a></li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="footer__bottom">
          <span>© 2026 EcoYantraSpace. All rights reserved.</span>
          <span className="footer__status">Systems operational</span>
        </div>
      </footer>
    </>
  );
}
