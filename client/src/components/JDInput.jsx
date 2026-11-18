import React from "react";

export default function JDInput({ jdText, setJdText, selectedJob, onClearSelectedJob }) {
  return (
    <div className="field">
      <label htmlFor="sharedJdInput" className="label">
        Job description <span className="label-hint">(shared by every tab)</span>
      </label>

      {selectedJob && (
        <p className="selected-job">
          <span>
            {selectedJob.title}{selectedJob.company ? ` at ${selectedJob.company}` : ""}
          </span>
          {onClearSelectedJob && (
            <button type="button" className="x-btn" onClick={onClearSelectedJob} aria-label="Clear selected job">
              ×
            </button>
          )}
        </p>
      )}

      <textarea
        id="sharedJdInput"
        className="textarea"
        placeholder="Paste the job description, or pick one in Job matches."
        value={jdText}
        onChange={(e) => setJdText(e.target.value)}
      />
    </div>
  );
}
