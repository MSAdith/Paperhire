import React from "react";
import ScoreGauge from "./ScoreGauge.jsx";
import CategoryCard from "./CategoryCard.jsx";
import KeywordChips from "./KeywordChips.jsx";
import AIRewriteCard from "./AIRewriteCard.jsx";

export default function ResultsView({ results }) {
  const {
    total,
    verdict,
    categories = [],
    matchedKeywords = [],
    missingKeywords = [],
    aiRewrites
  } = results;

  const toFix = categories.filter((c) => (c.fixes || []).length > 0).length;

  return (
    <div>
      <div className="score-layout">
        <ScoreGauge score={total} />

        <div className="box">
          <h2 className="verdict">{verdict}</h2>
          <p className="intro">
            Eight checks, weighted to 100: keywords, how cleanly the file parses, section structure, contact details,
            bullet impact, skills, length and spelling.
          </p>
          <div className="stats">
            <div className="stat">
              <p className="stat-num">{matchedKeywords.length}</p>
              <p className="stat-label">keywords matched</p>
            </div>
            <div className="stat">
              <p className="stat-num">{missingKeywords.length}</p>
              <p className="stat-label">keywords missing</p>
            </div>
            <div className="stat">
              <p className="stat-num">{toFix}</p>
              <p className="stat-label">{toFix === 1 ? "thing to fix" : "things to fix"}</p>
            </div>
          </div>
        </div>
      </div>

      <h2 className="section-title mt-6">
        The <span className="serif">breakdown</span>
      </h2>
      <div className="cat-list">
        {categories.map((cat, i) => (
          <CategoryCard key={i} category={cat} index={i} />
        ))}
      </div>

      <KeywordChips matchedKeywords={matchedKeywords} missingKeywords={missingKeywords} />

      {aiRewrites && <AIRewriteCard aiRewrites={aiRewrites} />}
    </div>
  );
}
