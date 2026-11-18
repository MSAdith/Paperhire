import React from "react";
import { motion } from "motion/react";

export function Button({ variant = "primary", size, block, className = "", children, ...rest }) {
  const classes = ["btn", `btn-${variant}`, size === "sm" ? "btn-sm" : "", block ? "btn-block" : "", className]
    .filter(Boolean)
    .join(" ");
  return (
    <button type="button" className={classes} {...rest}>
      {children}
    </button>
  );
}

export function LinkButton({ variant = "secondary", size, className = "", children, ...rest }) {
  const classes = ["btn", `btn-${variant}`, size === "sm" ? "btn-sm" : "", className].filter(Boolean).join(" ");
  return (
    <a className={classes} {...rest}>
      {children}
    </a>
  );
}

// Score bands used everywhere: high = lime, medium = sun, low = tomato.
export function toneFor(percent) {
  if (percent >= 75) return "high";
  if (percent >= 50) return "mid";
  return "low";
}

export const toneBlock = { high: "block-lime", mid: "block-sun", low: "block-tomato" };

// Thin ink meter that grows once when it first renders (transform only).
export function Meter({ percent = 0, delay = 0 }) {
  const clamped = Math.max(0, Math.min(100, percent || 0));
  return (
    <div className="meter" role="presentation">
      <motion.div
        className="meter-fill"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: clamped / 100 }}
        transition={{ duration: 0.7, ease: [0.3, 0.7, 0.2, 1], delay }}
      />
    </div>
  );
}

export function Alert({ tone = "error", children }) {
  return (
    <div className={`alert ${tone === "note" ? "alert-note" : ""}`} role={tone === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}

export function EmptyState({ title, children }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {children && <p className="empty-text">{children}</p>}
    </div>
  );
}

export function Loading({ label, lines = 4 }) {
  return (
    <div className="loading" role="status" aria-live="polite">
      <p className="loading-label">{label}</p>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="ghost-line" style={{ width: `${[92, 78, 85, 64, 88, 70][i % 6]}%` }} />
      ))}
    </div>
  );
}

export function Checkbox({ checked, onChange, children }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

export function PanelIntro({ title, children }) {
  return (
    <div>
      <h2 className="section-title">{title}</h2>
      {children && <p className="intro">{children}</p>}
    </div>
  );
}
