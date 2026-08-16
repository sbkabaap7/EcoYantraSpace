"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

export function Cursor() {
  const cursorRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cursor = cursorRef.current;
    const dot = dotRef.current;
    const ring = ringRef.current;
    if (!cursor || !dot || !ring) return;

    // Fast setter for performance
    const setX = gsap.quickSetter(cursor, "x", "px");
    const setY = gsap.quickSetter(cursor, "y", "px");
    const ringX = gsap.quickSetter(ring, "x", "px");
    const ringY = gsap.quickSetter(ring, "y", "px");

    let mouseX = 0;
    let mouseY = 0;
    let ringCurX = 0;
    let ringCurY = 0;

    const onMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      setX(mouseX);
      setY(mouseY);
    };

    // Lagging ring for smooth trail
    gsap.ticker.add(() => {
      const dt = 1 - Math.pow(1 - 0.14, gsap.ticker.deltaRatio());
      ringCurX += (mouseX - ringCurX) * dt;
      ringCurY += (mouseY - ringCurY) * dt;
      ringX(ringCurX);
      ringY(ringCurY);
    });

    const onEnter = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.closest("a, button, [data-cursor]") ||
        target.tagName === "A" ||
        target.tagName === "BUTTON"
      ) {
        cursor.classList.add("cursor--hover");
      }
    };

    const onLeave = () => {
      cursor.classList.remove("cursor--hover");
    };

    const onDown = () => cursor.classList.add("cursor--click");
    const onUp = () => cursor.classList.remove("cursor--click");

    window.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseover", onEnter);
    document.addEventListener("mouseout", onLeave);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("mouseup", onUp);

    return () => {
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseover", onEnter);
      document.removeEventListener("mouseout", onLeave);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("mouseup", onUp);
    };
  }, []);

  return (
    <div ref={cursorRef} className="cursor" aria-hidden="true">
      <div ref={dotRef} className="cursor__dot" />
      <div ref={ringRef} className="cursor__ring" style={{ position: "fixed", top: 0, left: 0 }} />
    </div>
  );
}
