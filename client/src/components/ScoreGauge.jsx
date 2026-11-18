import React, { useEffect } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { toneBlock, toneFor } from "./ui.jsx";

// The score as a flat colour block: lime for high, sun for medium, tomato for
// low. The number counts up once; the scale bar below fills with it.
export default function ScoreGauge({ score, label = "ATS score" }) {
  const reduce = useReducedMotion();
  const end = Math.min(100, Math.max(0, Math.round(score || 0)));
  const progress = useMotionValue(reduce ? end : 0);
  const display = useTransform(progress, (v) => Math.round(v));
  const scale = useTransform(progress, (v) => v / 100);

  useEffect(() => {
    if (reduce) {
      progress.set(end);
      return undefined;
    }
    const controls = animate(progress, end, { duration: 1.1, ease: [0.2, 0.7, 0.2, 1] });
    return () => controls.stop();
  }, [end, reduce, progress]);

  return (
    <div className={`block score-block ${toneBlock[toneFor(end)]}`} role="img" aria-label={`${label}: ${end} out of 100`}>
      <p className="score-label">{label}</p>
      <div aria-hidden="true">
        <p className="score-number">
          <motion.span>{display}</motion.span>
          <small>/100</small>
        </p>
        <div className="score-scale">
          <motion.div className="score-scale-fill" style={{ width: "100%", scaleX: scale }} />
        </div>
      </div>
    </div>
  );
}
