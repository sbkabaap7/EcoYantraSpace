"use client";

import { useState, useEffect } from "react";
import { ArrowUpRight, Menu, X } from "lucide-react";

const links = [
  { href: "#intelligence", label: "Systems" },
  { href: "#carbon", label: "Carbon" },
  { href: "#anomaly", label: "Anomaly" },
  { href: "#forest", label: "Forest" },
  { href: "#platform", label: "Platform" },
];

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <nav className={`site-nav${scrolled ? " site-nav--scrolled" : ""}`} id="site-nav">
        {/* Logo */}
        <a href="#top" className="nav-logo" aria-label="EcoYantraSpace home">
          <div className="nav-logo__mark" aria-hidden="true">⬡</div>
          <span className="nav-logo__text">
            ECO<em>YANTRA</em>SPACE
          </span>
        </a>

        {/* Desktop links */}
        <ul className="nav-links" role="list">
          {links.map((l) => (
            <li key={l.href}>
              <a href={l.href}>{l.label}</a>
            </li>
          ))}
        </ul>

        {/* Desktop CTA */}
        <a href="/login" className="nav-cta">
          Open workspace <ArrowUpRight size={13} aria-hidden="true" />
        </a>

        {/* Mobile hamburger */}
        <button
          className="nav-menu-btn"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </nav>

      {/* Mobile drawer */}
      <div className={`nav-drawer${open ? " is-open" : ""}`} role="dialog" aria-modal="true">
        {links.map((l) => (
          <a key={l.href} href={l.href} onClick={() => setOpen(false)}>
            {l.label}
          </a>
        ))}
        <a href="/login" className="btn btn-primary" style={{ marginTop: 8 }} onClick={() => setOpen(false)}>
          Open workspace <ArrowUpRight size={13} />
        </a>
      </div>
    </>
  );
}
