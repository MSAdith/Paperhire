import React, { useState } from "react";
import JDInput from "./JDInput.jsx";
import { postJSON, downloadTextFile } from "../lib/api.js";
import { useToast } from "../lib/toast.jsx";
import AiFeedback from "./AiFeedback.jsx";
import { Alert, Button, EmptyState, Loading, PanelIntro } from "./ui.jsx";

const GROUP_META = [
  { id: "technical", label: "Technical" },
  { id: "projectDeepDive", label: "Project Deep-Dive" },
  { id: "behavioural", label: "HR & Behavioural" }
];

function toPlainText(groups) {
  const lines = [];
  for (const { id, label } of GROUP_META) {
    const items = groups[id] || [];
    if (items.length === 0) continue;
    lines.push(label.toUpperCase(), "");
    items.forEach((item, i) => {
      lines.push(`${i + 1}. ${item.question}`);
      lines.push(`   What they're looking for: ${item.lookingFor}`);
      item.answerPointers.forEach((p) => lines.push(`   - ${p}`));
      lines.push("");
    });
  }
  return lines.join("\n");
}

export default function InterviewPrepPanel({ resumeText, jdText, setJdText, selectedJob, onClearSelectedJob }) {
  const toast = useToast();
  const [groups, setGroups] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [responseMs, setResponseMs] = useState(null);
  const [resultKey, setResultKey] = useState(0);

  const handleGenerate = async () => {
    setLoading(true);
    setError("");
    try {
      const started = performance.now();
      const data = await postJSON("/api/interview-prep", { resumeText, jdText });
      setResponseMs(Math.round(performance.now() - started));
      if (data.groups) {
        setResultKey((k) => k + 1);
        setGroups(data.groups);
        toast.success("Interview questions ready");
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
      await navigator.clipboard.writeText(toPlainText(groups));
      toast.success("Copied!");
    } catch {
      toast.error("Couldn't access the clipboard. Use Export instead.");
    }
  };

  const handleExport = () => {
    downloadTextFile(toPlainText(groups), "interview-prep.txt");
    toast.success("Downloaded interview-prep.txt");
  };

  const canGenerate = jdText && jdText.trim().length >= 20;
  const total = groups ? GROUP_META.reduce((n, g) => n + (groups[g.id]?.length || 0), 0) : 0;

  return (
    <div className="panel-grid">
      <div>
        <PanelIntro title={<>Questions they'll <span className="serif">probably</span> ask</>}>
          For each one: what the interviewer is really checking, and points from your own resume to answer with.
        </PanelIntro>

        <div className="mt-4">
          <JDInput jdText={jdText} setJdText={setJdText} selectedJob={selectedJob} onClearSelectedJob={onClearSelectedJob} />
        </div>

        {error && <Alert>{error}</Alert>}

        <div className="action-row">
          <Button disabled={loading || !canGenerate} onClick={handleGenerate}>
            {loading ? "Preparing…" : groups ? "New set of questions" : "Prepare my questions"}
          </Button>
        </div>
      </div>

      <div>
        {!canGenerate && !groups && (
          <EmptyState title="Paste a job description to unlock this tab.">
            Questions are matched to the role, your projects and the skills it asks for.
          </EmptyState>
        )}

        {canGenerate && !groups && !loading && (
          <EmptyState title="15 to 20 questions, in three groups.">
            Technical, a deep-dive on your projects, and HR. Open any question to see how to answer it.
          </EmptyState>
        )}

        {loading && <Loading label="Thinking like your interviewer" lines={7} />}

        {!loading && groups && (
          <div>
            <div className="toolbar">
              <h3 className="card-title">{total} questions</h3>
              <div className="toolbar-actions">
                <Button variant="secondary" size="sm" onClick={handleCopy}>
                  Copy all
                </Button>
                <Button variant="secondary" size="sm" onClick={handleExport}>
                  Export .txt
                </Button>
              </div>
            </div>

            <div className="mt-4">
              {GROUP_META.map(({ id, label }) =>
                groups[id] && groups[id].length > 0 ? (
                  <div key={id} className="qa-group">
                    <h4 className="qa-group-title">
                      {label} <span className="grey">{groups[id].length}</span>
                    </h4>
                    {groups[id].map((item, i) => (
                      <details key={i} className="qa">
                        <summary className="qa-summary">
                          <span className="qa-num">{String(i + 1).padStart(2, "0")}</span>
                          <span className="qa-question">{item.question}</span>
                          <span className="qa-toggle" aria-hidden="true" />
                        </summary>
                        <div className="qa-body">
                          <div>
                            <p className="qa-label">What they're looking for</p>
                            <p className="qa-text">{item.lookingFor}</p>
                          </div>
                          <div>
                            <p className="qa-label">Answer with</p>
                            <ul className="findings">
                              {item.answerPointers.map((p, j) => (
                                <li key={j}>{p}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </details>
                    ))}
                  </div>
                ) : null
              )}
            </div>
            <AiFeedback key={resultKey} feature="interview_prep" responseMs={responseMs} />
          </div>
        )}
      </div>
    </div>
  );
}
