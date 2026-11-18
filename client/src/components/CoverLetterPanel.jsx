import React, { useEffect, useState } from "react";
import JDInput from "./JDInput.jsx";
import { postJSON, downloadFile } from "../lib/api.js";
import { useToast } from "../lib/toast.jsx";
import AiFeedback from "./AiFeedback.jsx";
import { Alert, Button, EmptyState, Loading, PanelIntro } from "./ui.jsx";

const TONES = [
  { id: "formal", label: "Formal" },
  { id: "confident", label: "Confident" },
  { id: "concise", label: "Concise" }
];

function wordCount(text) {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

export default function CoverLetterPanel({ resumeText, jdText, setJdText, selectedJob, onClearSelectedJob }) {
  const toast = useToast();
  const [tone, setTone] = useState("formal");
  const [companyName, setCompanyName] = useState(selectedJob?.company || "");
  const [roleTitle, setRoleTitle] = useState(selectedJob?.title || "");
  const [letter, setLetter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState("");
  const [responseMs, setResponseMs] = useState(null);
  const [resultKey, setResultKey] = useState(0);

  useEffect(() => {
    if (selectedJob) {
      setCompanyName(selectedJob.company || "");
      setRoleTitle(selectedJob.title || "");
    }
  }, [selectedJob]);

  const handleGenerate = async () => {
    setLoading(true);
    setError("");
    try {
      const started = performance.now();
      const data = await postJSON("/api/cover-letter", { resumeText, jdText, tone, companyName, roleTitle });
      setResponseMs(Math.round(performance.now() - started));
      if (data.letter) {
        setResultKey((k) => k + 1);
        setLetter(data.letter);
        toast.success("Cover letter ready");
      }
      if (data.error) setError(data.error);
    } catch (err) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(letter);
      toast.success("Copied!");
    } catch {
      toast.error("Couldn't access the clipboard. Select the text and copy it manually.");
    }
  };

  const handleDownload = async (format) => {
    setDownloading(format);
    setError("");
    try {
      await downloadFile("/api/cover-letter/download", { letter, format }, `cover-letter.${format}`);
      toast.success(`Downloaded cover-letter.${format}`);
    } catch (err) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setDownloading("");
    }
  };

  const canGenerate = jdText && jdText.trim().length >= 20;
  const words = wordCount(letter);

  return (
    <div className="panel-grid">
      <div>
        <PanelIntro title={<>A cover letter that <span className="serif">sounds like you</span></>}>
          250 to 350 words, built only from what's on your resume and what the job asks for.
        </PanelIntro>

        <div className="mt-4">
          <JDInput jdText={jdText} setJdText={setJdText} selectedJob={selectedJob} onClearSelectedJob={onClearSelectedJob} />
        </div>

        <div className="field mt-3">
          <label className="label" htmlFor="clCompany">Company <span className="label-hint">(optional)</span></label>
          <input id="clCompany" className="input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="e.g. Infosys" />
        </div>
        <div className="field">
          <label className="label" htmlFor="clRole">Role <span className="label-hint">(optional)</span></label>
          <input id="clRole" className="input" value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} placeholder="e.g. Junior Software Developer" />
        </div>
        <div className="field">
          <span className="label" id="toneLabel">Tone</span>
          <div className="segmented" role="radiogroup" aria-labelledby="toneLabel">
            {TONES.map((t) => (
              <button key={t.id} type="button" role="radio" aria-checked={tone === t.id} onClick={() => setTone(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {error && <Alert>{error}</Alert>}

        <div className="action-row">
          <Button disabled={loading || !canGenerate} onClick={handleGenerate}>
            {loading ? "Writing…" : letter ? "Write it again" : "Write my cover letter"}
          </Button>
        </div>
      </div>

      <div>
        {!canGenerate && !letter && (
          <EmptyState title="Paste a job description to unlock this tab.">
            The letter is written for one specific role, so it needs that job description first.
          </EmptyState>
        )}

        {canGenerate && !letter && !loading && (
          <EmptyState title="Pick a tone, then write it.">
            You can edit every word before copying or downloading.
          </EmptyState>
        )}

        {loading && <Loading label="Writing your letter" lines={8} />}

        {!loading && letter && (
          <div className="box">
            <div className="toolbar">
              <h3 className="card-title">Your cover letter</h3>
              <div className="toolbar-actions">
                <Button variant="secondary" size="sm" onClick={handleCopy}>
                  Copy
                </Button>
                <Button variant="secondary" size="sm" disabled={!!downloading} onClick={() => handleDownload("docx")}>
                  {downloading === "docx" ? "Preparing…" : "Word (.docx)"}
                </Button>
                <Button variant="secondary" size="sm" disabled={!!downloading} onClick={() => handleDownload("pdf")}>
                  {downloading === "pdf" ? "Preparing…" : "PDF"}
                </Button>
              </div>
            </div>
            <p className="small grey mt-1">{words} words. Edit freely before you send it.</p>
            <textarea
              className="textarea textarea-lg mt-2"
              value={letter}
              onChange={(e) => setLetter(e.target.value)}
              aria-label="Cover letter text"
            />
            <AiFeedback key={resultKey} feature="cover_letter" responseMs={responseMs} />
          </div>
        )}
      </div>
    </div>
  );
}
