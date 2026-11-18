import React, { useState } from "react";
import JDInput from "./JDInput.jsx";
import ScoreGauge from "./ScoreGauge.jsx";
import { ChipList } from "./KeywordChips.jsx";
import { postJSON } from "../lib/api.js";
import { useToast } from "../lib/toast.jsx";
import AiFeedback from "./AiFeedback.jsx";
import { Alert, Button, EmptyState, Loading, PanelIntro } from "./ui.jsx";

function GapRow({ gap, index }) {
  const { skill, priority, mentions, plan, resources = [] } = gap;

  return (
    <details className="qa" open={index < 2}>
      <summary className="qa-summary">
        <span className="qa-num">{String(index + 1).padStart(2, "0")}</span>
        <span className="qa-question">
          {skill}{" "}
          <span className={`tag ${priority === "required" ? "tag-required" : "tag-preferred"}`}>{priority}</span>
        </span>
        <span className="qa-toggle" aria-hidden="true" />
      </summary>
      <div className="qa-body">
        <div>
          <p className="qa-text">
            Mentioned {mentions} time{mentions === 1 ? "" : "s"} in the job description.
          </p>
          {plan && (
            <>
              <p className="qa-label mt-2">Why it matters here</p>
              <p className="qa-text" style={{ color: "var(--ink)" }}>{plan.whyItMatters}</p>
            </>
          )}
          {resources.length > 0 && (
            <>
              <p className="qa-label mt-2">Free resources</p>
              <ul className="resources">
                {resources.map((r, i) => (
                  <li key={i}>
                    <a href={r.url} target="_blank" rel="noopener noreferrer">
                      {r.title} ↗
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        {plan && (
          <div>
            <p className="qa-label">A 1–2 week plan</p>
            <ol className="plan">
              {plan.miniPlan.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </details>
  );
}

export default function SkillGapPanel({ resumeText, jdText, setJdText, selectedJob, onClearSelectedJob }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [responseMs, setResponseMs] = useState(null);
  const [resultKey, setResultKey] = useState(0);

  const handleAnalyze = async () => {
    setLoading(true);
    setError("");
    try {
      const started = performance.now();
      const result = await postJSON("/api/skill-gap", { resumeText, jdText });
      setResponseMs(Math.round(performance.now() - started));
      setResultKey((k) => k + 1);
      setData(result);
    } catch (err) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const canAnalyze = jdText && jdText.trim().length >= 20;
  const required = data ? data.gaps.filter((g) => g.priority === "required").length : 0;

  return (
    <div className="panel-grid">
      <div>
        <PanelIntro title={<>What to learn <span className="serif">next</span></>}>
          The job's required and nice-to-have skills, checked against yours, with a short plan and free resources for
          each gap.
        </PanelIntro>

        <div className="mt-4">
          <JDInput jdText={jdText} setJdText={setJdText} selectedJob={selectedJob} onClearSelectedJob={onClearSelectedJob} />
        </div>

        {error && <Alert>{error}</Alert>}

        <div className="action-row">
          <Button disabled={loading || !canAnalyze} onClick={handleAnalyze}>
            {loading ? "Checking…" : data ? "Check again" : "Find my skill gaps"}
          </Button>
        </div>
      </div>

      <div>
        {!canAnalyze && !data && (
          <EmptyState title="Paste a job description to unlock this tab.">
            We'll compare its skills with yours and rank what to learn first.
          </EmptyState>
        )}

        {canAnalyze && !data && !loading && (
          <EmptyState title="Required skills first, then the nice-to-haves.">
            Skills the job lists as alternatives ("PostgreSQL or MySQL") aren't counted against you if you have one.
          </EmptyState>
        )}

        {loading && <Loading label="Comparing skills" lines={5} />}

        {!loading && data && (
          <>
            <div className="score-layout">
              <ScoreGauge score={data.matchPercent} label="Skill coverage" />
              <div className="box">
                <h3 className="verdict">{data.matchPercent}% of the job's skills are already on your resume.</h3>
                <p className="intro">
                  {data.gaps.length === 0
                    ? "No gaps for this job description."
                    : `${data.gaps.length} gap${data.gaps.length === 1 ? "" : "s"}: ${required} required, ${data.gaps.length - required} nice-to-have.`}
                </p>
              </div>
            </div>

            {data.matchedSkills.length > 0 && (
              <div className="block block-lime mt-3">
                <p className="kw-head">Already on your resume ({data.matchedSkills.length})</p>
                <ChipList items={data.matchedSkills} kind="plain" />
                {data.coveredAlternatives && data.coveredAlternatives.length > 0 && (
                  <p className="small mt-2">
                    Not counted as gaps, because the job lists them as alternatives to a skill you have:{" "}
                    {data.coveredAlternatives.map((a) => `${a.skill} (you have ${a.coveredBy})`).join(", ")}.
                  </p>
                )}
              </div>
            )}

            {!data.aiConfigured && data.gaps.length > 0 && (
              <Alert tone="note">
                Personalised plans aren't switched on. Add <code>{data.aiKeyName || "the AI provider key"}</code> on the
                server to get a "why it matters" and a 1–2 week plan per skill. The comparison and free resources work
                without it.
              </Alert>
            )}

            {data.planError && <Alert>{data.planError}</Alert>}

            {data.gaps.length > 0 && (
              <div className="mt-5">
                <h3 className="qa-group-title">Skills to learn, most important first</h3>
                <div className="qa-group">
                  {data.gaps.map((gap, i) => (
                    <GapRow key={gap.skill} gap={gap} index={i} />
                  ))}
                </div>
                {data.gaps.some((g) => g.plan) && <AiFeedback key={resultKey} feature="skill_gap" responseMs={responseMs} />}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
