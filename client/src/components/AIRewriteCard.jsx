import React from "react";

export default function AIRewriteCard({ aiRewrites }) {
  if (!aiRewrites) return null;

  const { summary = [], rewrites = [] } = aiRewrites;

  return (
    <section className="mt-6">
      <h2 className="section-title">
        Lines worth <span className="serif">rewriting</span>
      </h2>

      {summary.length > 0 && (
        <ul className="findings mt-3" style={{ fontSize: "var(--fs-md)", lineHeight: "24px" }}>
          {summary.map((line, idx) => (
            <li key={idx} style={{ color: "var(--ink)" }}>{line}</li>
          ))}
        </ul>
      )}

      {rewrites.length > 0 && (
        <div className="mt-3">
          {rewrites.map((item, idx) => (
            <div key={idx} className="rewrite">
              <div className="rewrite-old">
                <span className="rewrite-label">You wrote</span>
                <p>{item.original}</p>
              </div>
              <div className="rewrite-new">
                <span className="rewrite-label">Try</span>
                <p>{item.rewritten}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
