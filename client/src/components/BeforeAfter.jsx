import React from "react";
import { toneBlock, toneFor } from "./ui.jsx";

function Metric({ label, before, after, unit = "" }) {
  const delta = after != null && before != null ? after - before : null;
  const hasAfter = after != null;

  return (
    <div className={hasAfter ? `block ${toneBlock[toneFor(after)]}` : "box"}>
      <p className="ba-metric-label">{label}</p>
      <p className="ba-values">
        {delta !== 0 && (
          <>
            <span className="ba-before" aria-label={`Before: ${before ?? "unknown"}`}>{before ?? "–"}{unit}</span>
            <span className="ba-arrow" aria-hidden="true">→</span>
          </>
        )}
        <span className="ba-after" aria-label={`After: ${after ?? "unknown"}`}>{after ?? "–"}{unit}</span>
      </p>
      {delta != null && (
        <p className="ba-delta">
          {delta > 0 ? `Up ${delta} from ${before}${unit}` : delta < 0 ? `Down ${Math.abs(delta)} from ${before}${unit}` : "Same as your original"}
        </p>
      )}
    </div>
  );
}

export default function BeforeAfter({ before, after }) {
  return (
    <div className="ba mt-5">
      <Metric label="ATS score" before={before?.atsScore} after={after?.atsScore} />
      <Metric label="Job description keyword match" before={before?.jdMatchPercent} after={after?.jdMatchPercent} unit="%" />
    </div>
  );
}
