import React from "react";

export function ChipList({ items, kind }) {
  return (
    <div className="chips">
      {items.map((kw, i) => (
        <span key={`${kw}-${i}`} className={`chip chip-${kind}`}>
          {kw}
        </span>
      ))}
    </div>
  );
}

export default function KeywordChips({ matchedKeywords = [], missingKeywords = [] }) {
  return (
    <section className="mt-6">
      <h2 className="section-title">
        Keywords, <span className="serif">found and missing</span>
      </h2>

      <div className="kw-layout">
        <div className="block block-lime">
          <p className="kw-head">On your resume ({matchedKeywords.length})</p>
          {matchedKeywords.length === 0 ? (
            <p>None matched yet. Add a job description for a precise comparison.</p>
          ) : (
            <ChipList items={matchedKeywords} kind="plain" />
          )}
        </div>

        <div className="box">
          <p className="kw-head">Not on your resume ({missingKeywords.length})</p>
          {missingKeywords.length === 0 ? (
            <p className="grey">Nothing important is missing.</p>
          ) : (
            <ChipList items={missingKeywords} kind="missing" />
          )}
        </div>
      </div>
    </section>
  );
}
