import React, { useState } from "react";
import { postJSON } from "../lib/api.js";

const REASONS = [
  { id: "made_things_up", label: "Made things up" },
  { id: "too_generic", label: "Too generic" },
  { id: "wrong_tone", label: "Wrong tone" },
  { id: "bad_formatting", label: "Bad formatting" },
  { id: "other", label: "Other" }
];

// Thumbs up/down under an AI result. Sends only the rating, an optional reason
// chip and a short comment, plus how long the result took; never the result itself.
// Give it a `key` that changes with each new result so it resets.
export default function AiFeedback({ feature, responseMs }) {
  const [state, setState] = useState("idle"); // idle | sending | done
  const [open, setOpen] = useState(false); // the "What was wrong?" form
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");

  const send = async (rating, extra = {}) => {
    setState("sending");
    setError("");
    try {
      await postJSON("/api/feedback", { feature, rating, responseMs, ...extra });
      setState("done");
    } catch (err) {
      setError(err.message);
      setState("idle");
    }
  };

  if (state === "done") {
    return (
      <p className="feedback feedback-done" role="status">
        Thanks, that helps us improve it.
      </p>
    );
  }

  return (
    <div className="feedback">
      <div className="feedback-row">
        <span className="feedback-q">Was this useful?</span>
        <button
          type="button"
          className="thumb"
          aria-label="Yes, useful"
          aria-pressed={false}
          disabled={state === "sending"}
          onClick={() => send("up")}
        >
          <span aria-hidden="true">👍</span>
        </button>
        <button
          type="button"
          className={`thumb ${open ? "thumb-active" : ""}`}
          aria-label="No, not useful"
          aria-pressed={open}
          aria-expanded={open}
          disabled={state === "sending"}
          onClick={() => setOpen((v) => !v)}
        >
          <span aria-hidden="true">👎</span>
        </button>
      </div>

      {open && (
        <form
          className="feedback-form"
          onSubmit={(e) => {
            e.preventDefault();
            send("down", { reason: reason || undefined, comment: comment.trim() || undefined });
          }}
        >
          <p className="feedback-label" id={`fb-${feature}`}>What was wrong?</p>
          <div className="feedback-chips" role="group" aria-labelledby={`fb-${feature}`}>
            {REASONS.map((r) => (
              <button
                key={r.id}
                type="button"
                className={`chip chip-toggle ${reason === r.id ? "chip-on" : ""}`}
                aria-pressed={reason === r.id}
                onClick={() => setReason(reason === r.id ? "" : r.id)}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="feedback-send">
            <label className="visually-hidden" htmlFor={`fb-comment-${feature}`}>Anything else? (optional)</label>
            <input
              id={`fb-comment-${feature}`}
              className="input input-sm"
              maxLength={300}
              placeholder="Anything else? (optional, one line)"
              value={comment}
              onChange={(e) => setComment(e.target.value.replace(/\n/g, " "))}
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={state === "sending"}>
              {state === "sending" ? "Sending…" : "Send"}
            </button>
          </div>
        </form>
      )}
      {error && <p className="small feedback-error">{error}</p>}
    </div>
  );
}
