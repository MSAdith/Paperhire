import React from "react";
import { Meter, toneFor } from "./ui.jsx";

// One row of the category breakdown: name and score, what was found, what to fix.
export default function CategoryCard({ category, index = 0 }) {
  const { name, score, max, findings = [], fixes = [] } = category;
  const percentage = max > 0 ? (score / max) * 100 : 0;

  return (
    <div className="cat-row">
      <div>
        <h3 className="cat-name">
          <span className={`chip-score tone-${toneFor(percentage)}`}>
            {score}/{max}
          </span>
          {name}
        </h3>
        <Meter percent={percentage} delay={0.1 + index * 0.05} />
      </div>

      {findings.length > 0 ? (
        <ul className="findings">
          {findings.map((f, idx) => (
            <li key={idx}>{f}</li>
          ))}
        </ul>
      ) : (
        <div />
      )}

      <div>
        {fixes.length > 0 ? (
          fixes.map((fix, idx) => (
            <p key={idx} className="fix">
              <strong>Fix</strong>
              {fix}
            </p>
          ))
        ) : (
          <p className="fix fix-none">Nothing to fix here.</p>
        )}
      </div>
    </div>
  );
}
