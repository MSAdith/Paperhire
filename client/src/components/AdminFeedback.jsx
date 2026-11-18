import React, { useMemo, useState } from "react";
import { BarList, LineChart } from "./charts.jsx";

const FEATURE_NAMES = {
  tailor: "Tailor resume",
  cover_letter: "Cover letter",
  interview_prep: "Interview prep",
  skill_gap: "Skill gap plans",
  reach_out: "Reach out"
};

const REASON_NAMES = {
  made_things_up: "Made things up",
  too_generic: "Too generic",
  wrong_tone: "Wrong tone",
  bad_formatting: "Bad formatting",
  other: "Other"
};

const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

// AI usage per day and per user.
export function AiUsageSection({ data, rangeLabel }) {
  return (
    <div className="chart-grid mt-5">
      <section className="box">
        <h2 className="chart-title">AI calls per day</h2>
        <LineChart data={data.daily} valueKey="aiCalls" color="var(--ink)" label="AI calls" />
      </section>
      <section className="box">
        <h2 className="chart-title">Top users by AI calls, {rangeLabel}</h2>
        <BarList
          label="Top users by AI calls"
          items={data.topAiUsers.map((u) => ({ label: u.name ? `${u.name} (${u.email})` : u.email, count: u.count }))}
          emptyText="No AI calls in this period."
        />
      </section>
    </div>
  );
}

// 👍 rate per feature, most common 👎 reasons, and the latest comments.
export function FeedbackSection({ feedback, rangeLabel }) {
  const [feature, setFeature] = useState("all");

  const rated = feedback.byFeature.filter((f) => f.up + f.down > 0);
  const comments = useMemo(
    () => (feature === "all" ? feedback.comments : feedback.comments.filter((c) => c.feature === feature)),
    [feedback.comments, feature]
  );

  return (
    <section className="mt-6">
      <h2 className="section-title">
        Feedback <span className="grey">{feedback.total}</span>
      </h2>

      <div className="chart-grid mt-3">
        <section className="box">
          <h3 className="chart-title">👍 rate by feature, {rangeLabel}</h3>
          <BarList
            label="Thumbs-up rate by feature"
            items={rated.map((f) => ({ label: `${FEATURE_NAMES[f.feature]} (${f.up + f.down})`, count: f.upRate }))}
            format={(v) => `${v}%`}
            max={100}
            emptyText="No ratings in this period."
          />
        </section>
        <section className="box">
          <h3 className="chart-title">Most common 👎 reasons</h3>
          <BarList
            label="Thumbs-down reasons"
            items={feedback.reasons.filter((r) => r.count > 0).map((r) => ({ label: REASON_NAMES[r.reason], count: r.count }))}
            emptyText="No thumbs-down with a reason in this period."
          />
        </section>
      </div>

      <div className="toolbar mt-5">
        <h3 className="card-title">Latest comments</h3>
        <div>
          <label className="visually-hidden" htmlFor="fbFeature">Filter by feature</label>
          <select id="fbFeature" className="select input-sm" value={feature} onChange={(e) => setFeature(e.target.value)}>
            <option value="all">All features</option>
            {Object.entries(FEATURE_NAMES).map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="table-wrap mt-2">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Feature</th>
              <th>Reason</th>
              <th>Comment</th>
              <th>Model</th>
              <th>User</th>
            </tr>
          </thead>
          <tbody>
            {comments.length === 0 ? (
              <tr>
                <td colSpan={6} className="grey">No comments for this filter.</td>
              </tr>
            ) : (
              comments.map((c, i) => (
                <tr key={`${c.createdAt}-${i}`}>
                  <td>{fmtDate(c.createdAt)}</td>
                  <td>{FEATURE_NAMES[c.feature] || c.feature}</td>
                  <td>{c.reason ? REASON_NAMES[c.reason] : <span className="grey">–</span>}</td>
                  <td className="wrap">{c.comment}</td>
                  <td className="grey">{c.model || "–"}</td>
                  <td>{c.email}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
