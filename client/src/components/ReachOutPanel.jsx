import React, { useEffect, useRef, useState } from "react";
import JDInput from "./JDInput.jsx";
import AiFeedback from "./AiFeedback.jsx";
import { postJSON } from "../lib/api.js";
import { useToast } from "../lib/toast.jsx";
import { Alert, Button, EmptyState, Loading, PanelIntro } from "./ui.jsx";

const TYPES = [
  { id: "linkedin_referral", label: "LinkedIn referral", hint: "Note to an employee, 300 characters" },
  { id: "cold_email", label: "Cold email", hint: "To a recruiter" },
  { id: "follow_up", label: "Follow-up", hint: "After applying" },
  { id: "thank_you", label: "Thank-you", hint: "After an interview" }
];
const TONES = [
  { id: "friendly", label: "Friendly" },
  { id: "formal", label: "Formal" }
];
const LINKEDIN_LIMIT = 300;

export default function ReachOutPanel({ resumeText, jdText, setJdText, selectedJob, onClearSelectedJob }) {
  const toast = useToast();
  const [messageType, setMessageType] = useState("linkedin_referral");
  const [tone, setTone] = useState("friendly");
  const [companyName, setCompanyName] = useState(selectedJob?.company || "");
  const [recipientName, setRecipientName] = useState("");
  const [recipientRole, setRecipientRole] = useState("");
  const [result, setResult] = useState(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [responseMs, setResponseMs] = useState(null);
  const generation = useRef(0);

  useEffect(() => {
    if (selectedJob?.company) setCompanyName(selectedJob.company);
  }, [selectedJob]);

  const handleGenerate = async () => {
    setLoading(true);
    setError("");
    const started = performance.now();
    try {
      const data = await postJSON("/api/reach-out", { resumeText, jdText, companyName, messageType, tone, recipientName, recipientRole });
      setResponseMs(Math.round(performance.now() - started));
      if (data.message) {
        generation.current += 1;
        setResult(data);
        setMessage(data.message);
        setSubject(data.subject || "");
        toast.success("Message ready");
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
      await navigator.clipboard.writeText(result?.charLimit ? message : `Subject: ${subject}\n\n${message}`);
      toast.success("Copied!");
    } catch {
      toast.error("Couldn't access the clipboard. Select the text and copy it manually.");
    }
  };

  const canGenerate = jdText && jdText.trim().length >= 20 && companyName.trim().length > 0;
  const limit = result?.charLimit || null;
  const over = limit && message.length > limit;

  return (
    <div className="panel-grid">
      <div>
        <PanelIntro title={<>Reach out, <span className="serif">without the cringe</span></>}>
          A referral request, cold email, follow-up or thank-you note, written from what's actually on your resume.
        </PanelIntro>

        <div className="mt-4">
          <JDInput jdText={jdText} setJdText={setJdText} selectedJob={selectedJob} onClearSelectedJob={onClearSelectedJob} />
        </div>

        <div className="field mt-3">
          <span className="label" id="msgTypeLabel">Message</span>
          <div className="type-grid" role="radiogroup" aria-labelledby="msgTypeLabel">
            {TYPES.map((t) => (
              <button key={t.id} type="button" role="radio" aria-checked={messageType === t.id} className="type-option" onClick={() => setMessageType(t.id)}>
                <strong>{t.label}</strong>
                <span>{t.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label className="label" htmlFor="roCompany">Company</label>
          <input id="roCompany" className="input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="e.g. Razorpay" />
        </div>
        <div className="two-col">
          <div className="field">
            <label className="label" htmlFor="roName">Their name <span className="label-hint">(optional)</span></label>
            <input id="roName" className="input" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="e.g. Asha" />
          </div>
          <div className="field">
            <label className="label" htmlFor="roRole">Their role <span className="label-hint">(optional)</span></label>
            <input id="roRole" className="input" value={recipientRole} onChange={(e) => setRecipientRole(e.target.value)} placeholder="e.g. Senior Engineer" />
          </div>
        </div>
        <div className="field">
          <span className="label" id="roToneLabel">Tone</span>
          <div className="segmented" role="radiogroup" aria-labelledby="roToneLabel">
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
            {loading ? "Writing…" : result ? "Regenerate" : "Write my message"}
          </Button>
        </div>
      </div>

      <div>
        {!(jdText && jdText.trim().length >= 20) && !result && (
          <EmptyState title="Paste a job description to unlock this tab.">
            Or pick a job in Job matches; its description and company fill in here.
          </EmptyState>
        )}

        {jdText && jdText.trim().length >= 20 && !result && !loading && (
          <EmptyState title="Pick who you're writing to, then write it.">
            LinkedIn notes stay under the 300-character limit. Everything is editable before you copy it.
          </EmptyState>
        )}

        {loading && <Loading label="Writing your message" lines={4} />}

        {!loading && result && (
          <div className="box">
            <div className="toolbar">
              <h3 className="card-title">{TYPES.find((t) => t.id === result.messageType)?.label}</h3>
              <div className="toolbar-actions">
                <Button variant="secondary" size="sm" onClick={handleCopy}>
                  Copy
                </Button>
                <Button variant="secondary" size="sm" onClick={handleGenerate} disabled={loading || !canGenerate}>
                  Regenerate
                </Button>
              </div>
            </div>

            {!limit && (
              <div className="field mt-3">
                <label className="label" htmlFor="roSubject">Subject</label>
                <input id="roSubject" className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>
            )}

            <div className="field mt-3">
              <div className="label-row">
                <label className="label" htmlFor="roMessage">Message</label>
                {limit && (
                  <span className={`char-count ${over ? "char-over" : ""}`} aria-live="polite">
                    {message.length} / {limit}
                    {over ? " · too long for LinkedIn" : ""}
                  </span>
                )}
              </div>
              <textarea
                id="roMessage"
                className={`textarea ${limit ? "" : "textarea-lg"}`}
                style={limit ? { minHeight: 160 } : undefined}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>

            <AiFeedback key={generation.current} feature="reach_out" responseMs={responseMs} />
          </div>
        )}
      </div>
    </div>
  );
}
