import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../lib/auth.jsx";
import { getJSON } from "../lib/api.js";
import NotFound from "./NotFound.jsx";
import { BarList, LineChart } from "./charts.jsx";
import { AiUsageSection, FeedbackSection } from "./AdminFeedback.jsx";
import { Button, Loading, toneBlock, toneFor } from "./ui.jsx";

const RANGES = [
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "all", label: "All time" }
];

const FEATURE_LABELS = {
  ats_analyze: "ATS checks",
  job_search: "Job searches",
  tailor: "Tailored resumes",
  cover_letter: "Cover letters",
  interview_prep: "Interview prep",
  skill_gap: "Skill gap",
  download_pdf: "PDF downloads",
  download_docx: "Word downloads",
  reach_out: "Outreach messages",
  tracker_add: "Tracker: added",
  tracker_move: "Tracker: moved"
};

const regionNames = typeof Intl !== "undefined" && Intl.DisplayNames ? new Intl.DisplayNames(["en"], { type: "region" }) : null;
const countryName = (code) => {
  try {
    return (regionNames && regionNames.of(code)) || code;
  } catch {
    return code;
  }
};

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "–");
const fmtNumber = (n) => (n === null || n === undefined ? "–" : n.toLocaleString());

function Stat({ label, value, hint, className = "box" }) {
  return (
    <div className={`stat-card ${className}`}>
      <p className="stat-card-label">{label}</p>
      <p className="stat-card-value">{fmtNumber(value)}</p>
      {hint && <p className="stat-card-hint">{hint}</p>}
    </div>
  );
}

function csvEscape(value) {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(rows) {
  const header = ["Name", "Email", "Signed up", "Last seen", "Analyses", "Sign-in method"];
  const lines = [header, ...rows.map((u) => [u.name, u.email, u.signedUpAt, u.lastSeenAt, u.analyses, u.method])];
  const blob = new Blob([lines.map((l) => l.map(csvEscape).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `paperhire-users-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const COLUMNS = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "signedUpAt", label: "Signed up" },
  { key: "lastSeenAt", label: "Last seen" },
  { key: "analyses", label: "Analyses" },
  { key: "method", label: "Sign-in" }
];

function UsersTable({ users }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState({ key: "signedUpAt", dir: "desc" });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? users.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(q)) : users;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = a[sort.key] ?? "";
      const bv = b[sort.key] ?? "";
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [users, query, sort]);

  const toggle = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  return (
    <section className="mt-6">
      <div className="toolbar">
        <h2 className="section-title">
          Users <span className="grey">{users.length}</span>
        </h2>
        <div className="toolbar-actions">
          <label className="visually-hidden" htmlFor="userSearch">Search users</label>
          <input
            id="userSearch"
            className="input input-sm"
            placeholder="Search name or email"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Button variant="secondary" size="sm" onClick={() => downloadCsv(rows)} disabled={rows.length === 0}>
            Export CSV
          </Button>
        </div>
      </div>
      <div className="table-wrap mt-3">
        <table className="data-table">
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key} aria-sort={sort.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                  <button type="button" onClick={() => toggle(c.key)}>
                    {c.label}
                    <span aria-hidden="true">{sort.key === c.key ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className="grey">
                  {users.length === 0 ? "No users yet." : "No users match that search."}
                </td>
              </tr>
            ) : (
              rows.map((u) => (
                <tr key={u.id}>
                  <td>{u.name || <span className="grey">–</span>}</td>
                  <td>{u.email}</td>
                  <td>{fmtDate(u.signedUpAt)}</td>
                  <td>{fmtDate(u.lastSeenAt)}</td>
                  <td className="num">{u.analyses}</td>
                  <td>{u.method}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Dashboard() {
  const [range, setRange] = useState("30d");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    getJSON(`/api/admin/summary?range=${range}`)
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [range]);

  const rangeLabel = RANGES.find((r) => r.id === range).label.toLowerCase();

  return (
    <div className="admin">
      <div className="ws-head">
        <div>
          <h1 className="ws-file">
            Dashboard <span className="serif">at a glance</span>
          </h1>
          <p className="ws-meta">
            {data ? `Updated ${new Date(data.generatedAt).toLocaleTimeString()}` : "Loading…"} · No resume content is ever recorded.
          </p>
        </div>
        <div className="segmented range-filter" role="radiogroup" aria-label="Date range">
          {RANGES.map((r) => (
            <button key={r.id} type="button" role="radio" aria-checked={range === r.id} onClick={() => setRange(r.id)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="alert">{error}</div>}
      {loading && !data && <Loading label="Counting visitors" lines={4} />}

      {data && (
        <div style={{ opacity: loading ? 0.5 : 1 }}>
          <div className="stat-grid mt-5">
            <Stat className="block block-lime stat-hero" label={`Visitors, ${rangeLabel}`} value={data.stats.totalVisitors} hint="Unique visitor IDs" />
            <Stat label="Unique today" value={data.stats.uniqueToday} />
            <Stat label="Unique, 7 days" value={data.stats.unique7d} />
            <Stat label="Unique, 30 days" value={data.stats.unique30d} />
            <Stat className="block block-ink" label="Total users" value={data.stats.totalUsers} />
            <Stat label="New sign-ups, 7 days" value={data.stats.newSignups7d} />
            <Stat label="Active users today (DAU)" value={data.stats.dau} hint={`${fmtNumber(data.stats.wau)} this week (WAU)`} />
          </div>

          <div className="chart-grid mt-5">
            <section className="box">
              <h2 className="chart-title">Visitors per day</h2>
              <LineChart data={data.daily} valueKey="visitors" color="var(--cobalt)" label="Visitors" />
            </section>
            <section className="box">
              <h2 className="chart-title">Sign-ups per day</h2>
              <LineChart data={data.daily} valueKey="signups" color="var(--tomato)" label="Sign-ups" />
            </section>
          </div>

          <div className="admin-split mt-5">
            <section className="box">
              <h2 className="chart-title">Feature usage, {rangeLabel}</h2>
              <BarList
                label="Feature usage"
                items={data.featureUsage.map((f) => ({ label: FEATURE_LABELS[f.name] || f.name, count: f.count }))}
                emptyText="No features used in this period."
              />
            </section>

            <section className="ai-health">
              <div className={`block ${data.ai.successRate === null ? "block-ink" : toneBlock[toneFor(data.ai.successRate)]}`}>
                <p className="stat-card-label">AI success rate</p>
                <p className="stat-card-value">{data.ai.successRate === null ? "–" : `${data.ai.successRate}%`}</p>
                <p className="stat-card-hint">
                  {fmtNumber(data.ai.calls)} calls · avg {data.ai.avgDurationMs === null ? "–" : `${(data.ai.avgDurationMs / 1000).toFixed(1)}s`}
                </p>
              </div>
              <div className="box">
                <p className="stat-card-label">AI failures by type</p>
                <ul className="kv-list mt-1">
                  <li><span>Failed or timed out</span><strong>{data.ai.failures.failed}</strong></li>
                  <li><span>Rate limited</span><strong>{data.ai.failures.rate_limited}</strong></li>
                  <li><span>Out of credits</span><strong>{data.ai.failures.out_of_credits}</strong></li>
                </ul>
              </div>
              <div className="box">
                <p className="stat-card-label">JSearch this month</p>
                <p className="quota-line">
                  <strong>{data.jsearch.usedThisMonth}</strong> of ~{data.jsearch.quota} free searches
                </p>
                <div className="quota-track" aria-hidden="true">
                  <div
                    className={`quota-fill ${data.jsearch.usedThisMonth / data.jsearch.quota > 0.8 ? "tone-low" : "tone-high"}`}
                    style={{ width: `${Math.min(100, (data.jsearch.usedThisMonth / data.jsearch.quota) * 100)}%` }}
                  />
                </div>
                <p className="stat-card-hint">Cached repeats don't count.</p>
              </div>
            </section>
          </div>

          <AiUsageSection data={data} rangeLabel={rangeLabel} />

          <div className="geo-grid mt-5">
            <section className="box">
              <h2 className="chart-title">Top countries</h2>
              <BarList stacked label="Top countries" items={data.geo.countries.map((c) => ({ ...c, label: countryName(c.label) }))} emptyText="Location shows up on Vercel deployments." />
            </section>
            <section className="box">
              <h2 className="chart-title">Top cities</h2>
              <BarList stacked label="Top cities" items={data.geo.cities} emptyText="Location shows up on Vercel deployments." />
            </section>
            <section className="box">
              <h2 className="chart-title">Devices</h2>
              <BarList stacked label="Devices" items={data.devices.map((d) => ({ ...d, label: d.label.charAt(0).toUpperCase() + d.label.slice(1) }))} />
            </section>
            <section className="box">
              <h2 className="chart-title">Browsers</h2>
              <BarList stacked label="Browsers" items={data.browsers} />
            </section>
          </div>

          {data.errors.length > 0 && (
            <section className="mt-6">
              <h2 className="section-title">Errors, {rangeLabel}</h2>
              <div className="table-wrap mt-3">
                <table className="data-table">
                  <thead>
                    <tr><th>Route</th><th>Error</th><th className="num">Count</th></tr>
                  </thead>
                  <tbody>
                    {data.errors.map((e) => (
                      <tr key={`${e.route}-${e.type}`}>
                        <td>{e.route}</td>
                        <td>{e.type}</td>
                        <td className="num">{e.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {data.feedback && <FeedbackSection feedback={data.feedback} rangeLabel={rangeLabel} />}

          <UsersTable users={data.users} />
        </div>
      )}
    </div>
  );
}

export default function AdminPage() {
  const auth = useAuth();
  const [access, setAccess] = useState("checking");

  useEffect(() => {
    if (!auth.ready) return undefined;
    if (!auth.user) {
      setAccess("denied");
      return undefined;
    }
    let cancelled = false;
    getJSON("/api/admin/me")
      .then((d) => !cancelled && setAccess(d.admin ? "granted" : "denied"))
      .catch(() => !cancelled && setAccess("denied"));
    return () => {
      cancelled = true;
    };
  }, [auth.ready, auth.user]);

  // Signed-out users and non-admins get the same not-found page; the server
  // enforces this independently on every /api/admin call.
  if (access === "checking") return <Loading label="Checking access" lines={2} />;
  if (access === "denied") return <NotFound />;
  return <Dashboard />;
}
