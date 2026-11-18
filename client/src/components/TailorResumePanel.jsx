import React, { useState } from "react";
import JDInput from "./JDInput.jsx";
import BeforeAfter from "./BeforeAfter.jsx";
import { ChipList } from "./KeywordChips.jsx";
import { postJSON, downloadFile } from "../lib/api.js";
import { useToast } from "../lib/toast.jsx";
import AiFeedback from "./AiFeedback.jsx";
import { Alert, Button, EmptyState, Loading, PanelIntro } from "./ui.jsx";

export default function TailorResumePanel({ resumeText, jdText, setJdText, selectedJob, onClearSelectedJob }) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [tailored, setTailored] = useState(null);
  const [downloading, setDownloading] = useState("");
  const [responseMs, setResponseMs] = useState(null);
  const [resultKey, setResultKey] = useState(0);

  const handleGenerate = async () => {
    setLoading(true);
    setError("");
    try {
      const started = performance.now();
      const data = await postJSON("/api/tailor", { resumeText, jdText });
      setResponseMs(Math.round(performance.now() - started));
      setResultKey((k) => k + 1);
      setResult(data);
      setTailored(data.tailored);
      if (data.error) setError(data.error);
      else if (data.tailored) toast.success(data.attempts > 1 ? "Tailored resume ready (improved on a second pass)" : "Tailored resume ready");
      else if (data.keptOriginal) toast.error("Kept your original resume: the tailored version scored lower");
    } catch (err) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const updateSummary = (value) => setTailored((t) => ({ ...t, summary: value }));

  const updateBullet = (sectionIdx, entryIdx, bulletIdx, value) =>
    setTailored((t) => ({
      ...t,
      sections: t.sections.map((s, i) =>
        i !== sectionIdx
          ? s
          : {
              ...s,
              entries: s.entries.map((e, j) =>
                j !== entryIdx ? e : { ...e, bullets: e.bullets.map((b, k) => (k === bulletIdx ? value : b)) }
              )
            }
      )
    }));

  const updateSkills = (category, value) =>
    setTailored((t) => ({
      ...t,
      skills: { ...t.skills, [category]: value.split(",").map((s) => s.trim()).filter(Boolean) }
    }));

  const handleDownload = async (format) => {
    setDownloading(format);
    setError("");
    try {
      await downloadFile("/api/tailor/download", { tailored, format, resumeText }, `tailored-resume.${format}`);
      toast.success(`Downloaded tailored-resume.${format}`);
    } catch (err) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setDownloading("");
    }
  };

  const canGenerate = jdText && jdText.trim().length >= 20;

  return (
    <div className="panel-grid">
      <div>
        <PanelIntro title={<>Tailor it to <span className="serif">one</span> job</>}>
          Reorders and rewords what's already on your resume to fit the role. Nothing gets invented: skills you don't
          have are listed separately, not added.
        </PanelIntro>

        <div className="mt-4">
          <JDInput jdText={jdText} setJdText={setJdText} selectedJob={selectedJob} onClearSelectedJob={onClearSelectedJob} />
        </div>

        {error && <Alert>{error}</Alert>}

        <div className="action-row">
          <Button disabled={loading || !canGenerate} onClick={handleGenerate}>
            {loading ? "Tailoring…" : tailored ? "Try again" : "Tailor my resume"}
          </Button>
        </div>
      </div>

      <div>
        {!canGenerate && !tailored && !result && (
          <EmptyState title="Paste a job description to unlock this tab.">
            Or open Job matches and press "Tailor my resume to this job" on any listing.
          </EmptyState>
        )}

        {canGenerate && !tailored && !result && !loading && (
          <EmptyState title="Ready. Press Tailor my resume.">
            You'll get a before/after score, an editable version, and Word or PDF downloads.
          </EmptyState>
        )}

        {loading && <Loading label="Rewriting for this job" lines={6} />}

        {!loading && result && result.keptOriginal && (
          <div className="block block-sun">
            <h3 className="card-title">Your original is the stronger version.</h3>
            <p className="mt-2">{result.note}</p>
            <label className="label mt-3" htmlFor="originalResume">
              Your original resume <span>({result.before.atsScore}/100)</span>
            </label>
            <textarea id="originalResume" className="textarea textarea-lg" value={resumeText} readOnly />
          </div>
        )}

        {!loading && result && result.before && !result.keptOriginal && <BeforeAfter before={result.before} after={result.after} />}

        {!loading && result && (result.tailored || result.keptOriginal) && <AiFeedback key={resultKey} feature="tailor" responseMs={responseMs} />}

        {!loading && tailored && (
          <>
            {tailored.gapsNotAdded && tailored.gapsNotAdded.length > 0 && (
              <div className="box box-flat mt-3">
                <p className="kw-head">Left out, because your resume doesn't show them</p>
                <ChipList items={tailored.gapsNotAdded} kind="missing" />
                <p className="small grey mt-2">The Skill gap tab has a short learning plan for each.</p>
              </div>
            )}

            <div className="box mt-3">
              <div className="toolbar">
                <h3 className="card-title">Edit before you download</h3>
                <div className="toolbar-actions">
                  <Button variant="secondary" size="sm" disabled={!!downloading} onClick={() => handleDownload("docx")}>
                    {downloading === "docx" ? "Preparing…" : "Word (.docx)"}
                  </Button>
                  <Button variant="secondary" size="sm" disabled={!!downloading} onClick={() => handleDownload("pdf")}>
                    {downloading === "pdf" ? "Preparing…" : "PDF"}
                  </Button>
                </div>
              </div>
              <p className="small grey mt-1">The scores above are for the generated version. Your edits are included in the downloads.</p>

              {tailored.contactLines && tailored.contactLines.length > 0 && (
                <div className="contact-block">
                  {tailored.contactLines.map((line, i) => (
                    <p key={i} className={i === 0 ? "contact-name" : "grey"}>{line}</p>
                  ))}
                  <p className="small grey mt-1">Copied from your original as-is.</p>
                </div>
              )}

              <div className="field mt-3">
                <label className="label" htmlFor="tailoredSummary">Summary</label>
                <textarea
                  id="tailoredSummary"
                  className="textarea"
                  style={{ minHeight: 120 }}
                  value={tailored.summary}
                  onChange={(e) => updateSummary(e.target.value)}
                />
              </div>

              {tailored.sections.map((section, sIdx) => (
                <div key={sIdx} className="edit-section">
                  <p className="edit-section-title">{section.heading}</p>
                  {section.entries.map((entry, eIdx) => (
                    <div key={eIdx} className="edit-entry">
                      {entry.header && <p className="edit-entry-header">{entry.header}</p>}
                      {entry.bullets.map((bullet, bIdx) => (
                        <textarea
                          key={bIdx}
                          className="textarea textarea-sm edit-bullet"
                          value={bullet}
                          onChange={(e) => updateBullet(sIdx, eIdx, bIdx, e.target.value)}
                          aria-label={`${section.heading}${entry.header ? ` – ${entry.header}` : ""} bullet ${bIdx + 1}`}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              ))}

              {tailored.skills && Object.keys(tailored.skills).length > 0 && (
                <div className="edit-section">
                  <p className="edit-section-title">Skills</p>
                  {Object.entries(tailored.skills).map(([category, skills]) => (
                    <div key={`${category}:${skills.join(",")}`} className="skill-row">
                      <span className="skill-row-label">{category}</span>
                      <input
                        className="input"
                        defaultValue={skills.join(", ")}
                        onBlur={(e) => updateSkills(category, e.target.value)}
                        aria-label={`${category} skills`}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
