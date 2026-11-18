import React, { useEffect, useMemo, useState } from "react";
import { apiFetch, getJSON, postJSON } from "../lib/api.js";
import { useToast } from "../lib/toast.jsx";
import { Alert, Button, EmptyState, Loading, PanelIntro } from "./ui.jsx";

export const STATUSES = [
  { id: "saved", label: "Saved" },
  { id: "applied", label: "Applied" },
  { id: "interview", label: "Interview" },
  { id: "offer", label: "Offer" },
  { id: "rejected", label: "Rejected" }
];

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "");
const todayKey = () => new Date().toISOString().slice(0, 10);

async function patchApplication(id, body) {
  const res = await apiFetch(`/api/tracker/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || "Couldn't update this application.");
  return data.application;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function Summary({ apps }) {
  const c = (s) => apps.filter((a) => a.status === s).length;
  const parts = [
    plural(c("saved"), "saved", "saved"),
    plural(c("applied"), "applied", "applied"),
    plural(c("interview"), "interview", "interviews"),
    plural(c("offer"), "offer", "offers"),
    plural(c("rejected"), "rejected", "rejected")
  ];
  return <p className="tracker-summary">{parts.join(" · ")}</p>;
}

function AddForm({ onAdded, onCancel }) {
  const toast = useToast();
  const [form, setForm] = useState({ title: "", company: "", location: "", jobUrl: "", note: "", followUpDate: "", status: "saved" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const body = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== ""));
      const data = await postJSON("/api/tracker", body);
      onAdded(data.application);
      toast.success("Added to your tracker");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="box tracker-form mt-3" onSubmit={submit}>
      <div className="form-grid">
        <div>
          <label className="label" htmlFor="tfTitle">Job title</label>
          <input id="tfTitle" className="input" required maxLength={200} value={form.title} onChange={set("title")} />
        </div>
        <div>
          <label className="label" htmlFor="tfCompany">Company</label>
          <input id="tfCompany" className="input" required maxLength={200} value={form.company} onChange={set("company")} />
        </div>
        <div>
          <label className="label" htmlFor="tfStatus">Status</label>
          <select id="tfStatus" className="select" value={form.status} onChange={set("status")}>
            {STATUSES.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="tfLocation">Location <span className="label-hint">(optional)</span></label>
          <input id="tfLocation" className="input" maxLength={200} value={form.location} onChange={set("location")} />
        </div>
        <div>
          <label className="label" htmlFor="tfUrl">Job link <span className="label-hint">(optional)</span></label>
          <input id="tfUrl" className="input" type="url" maxLength={1000} placeholder="https://" value={form.jobUrl} onChange={set("jobUrl")} />
        </div>
        <div>
          <label className="label" htmlFor="tfFollow">Follow up on <span className="label-hint">(optional)</span></label>
          <input id="tfFollow" className="input" type="date" value={form.followUpDate} onChange={set("followUpDate")} />
        </div>
      </div>
      <div className="field mt-3">
        <label className="label" htmlFor="tfNote">Note <span className="label-hint">(optional, {500 - form.note.length} left)</span></label>
        <input id="tfNote" className="input" maxLength={500} value={form.note} onChange={set("note")} placeholder="e.g. Referred by Asha" />
      </div>
      {error && <Alert>{error}</Alert>}
      <div className="action-row">
        <Button type="submit" disabled={saving}>{saving ? "Adding…" : "Add to tracker"}</Button>
        <button type="button" className="link-btn" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function Card({ app, onMove, onUpdate, onRemove, onDragStart, dragging }) {
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(app.note);
  const [followUpDate, setFollowUpDate] = useState(app.followUpDate);
  const due = app.followUpDate && app.followUpDate <= todayKey() && !["offer", "rejected"].includes(app.status);

  return (
    <article
      className={`tcard ${dragging ? "tcard-dragging" : ""}`}
      draggable
      onDragStart={(e) => onDragStart(e, app.id)}
      aria-label={`${app.title} at ${app.company}`}
    >
      <p className="tcard-title">{app.title}</p>
      <p className="tcard-company">{app.company}</p>
      <p className="tcard-meta">
        {[app.location, `Added ${fmtDate(app.createdAt)}`].filter(Boolean).join(" · ")}
      </p>
      {app.followUpDate && <p className={`tcard-follow ${due ? "tcard-due" : ""}`}>Follow up {fmtDate(app.followUpDate)}</p>}
      {app.note && !editing && <p className="tcard-note">{app.note}</p>}

      {editing && (
        <form
          className="tcard-edit"
          onSubmit={(e) => {
            e.preventDefault();
            onUpdate(app.id, { note, followUpDate: followUpDate || null }).then(() => setEditing(false));
          }}
        >
          <label className="visually-hidden" htmlFor={`note-${app.id}`}>Note</label>
          <textarea id={`note-${app.id}`} className="textarea textarea-sm" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note" />
          <label className="label mt-1" htmlFor={`fu-${app.id}`}>Follow up on</label>
          <input id={`fu-${app.id}`} className="input input-sm" type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
          <div className="tcard-actions">
            <button type="submit" className="btn btn-primary btn-sm">Save</button>
            <button type="button" className="link-btn small" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="tcard-foot">
        <label className="visually-hidden" htmlFor={`st-${app.id}`}>Status</label>
        <select id={`st-${app.id}`} className="tcard-status" value={app.status} onChange={(e) => onMove(app.id, e.target.value)}>
          {STATUSES.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
        <div className="tcard-links">
          {app.jobUrl && (
            <a href={app.jobUrl} target="_blank" rel="noopener noreferrer">Job ↗</a>
          )}
          {!editing && (
            <button type="button" className="link-btn small" onClick={() => setEditing(true)}>Edit</button>
          )}
          <button type="button" className="link-btn small" onClick={() => onRemove(app.id)} aria-label={`Remove ${app.title}`}>Remove</button>
        </div>
      </div>
    </article>
  );
}

export default function TrackerBoard() {
  const toast = useToast();
  const [apps, setApps] = useState(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [dragId, setDragId] = useState(null);
  const [overColumn, setOverColumn] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getJSON("/api/tracker")
      .then((d) => !cancelled && setApps(d.applications))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, []);

  const byStatus = useMemo(() => {
    const groups = Object.fromEntries(STATUSES.map((s) => [s.id, []]));
    for (const a of apps || []) (groups[a.status] || groups.saved).push(a);
    return groups;
  }, [apps]);

  // Optimistic: move now, roll back if the server says no.
  const move = async (id, status) => {
    const before = apps;
    const current = apps.find((a) => a.id === id);
    if (!current || current.status === status) return;
    setApps((list) => list.map((a) => (a.id === id ? { ...a, status } : a)));
    try {
      const updated = await patchApplication(id, { status });
      setApps((list) => list.map((a) => (a.id === id ? updated : a)));
    } catch (err) {
      setApps(before);
      toast.error(err.message);
    }
  };

  const update = async (id, fields) => {
    try {
      const updated = await patchApplication(id, fields);
      setApps((list) => list.map((a) => (a.id === id ? updated : a)));
      toast.success("Saved");
    } catch (err) {
      toast.error(err.message);
      throw err;
    }
  };

  const remove = async (id) => {
    const before = apps;
    setApps((list) => list.filter((a) => a.id !== id));
    try {
      const res = await apiFetch(`/api/tracker/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) throw new Error("Couldn't remove this application.");
    } catch (err) {
      setApps(before);
      toast.error(err.message);
    }
  };

  const onDragStart = (e, id) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  };

  const onDrop = (e, status) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain") || dragId;
    setDragId(null);
    setOverColumn(null);
    if (id) move(id, status);
  };

  return (
    <div>
      <div className="toolbar">
        <PanelIntro title={<>Your applications, <span className="serif">in one place</span></>}>
          Drag cards between columns, or change the status on any card. Only job details are saved here, never your
          resume.
        </PanelIntro>
        {!adding && (
          <Button onClick={() => setAdding(true)}>Add an application</Button>
        )}
      </div>

      {adding && (
        <AddForm
          onCancel={() => setAdding(false)}
          onAdded={(app) => {
            setApps((list) => [app, ...(list || [])]);
            setAdding(false);
          }}
        />
      )}

      {error && <Alert>{error}</Alert>}
      {!apps && !error && <Loading label="Loading your tracker" lines={3} />}

      {apps && (
        <>
          <Summary apps={apps} />
          {apps.length === 0 && !adding && (
            <EmptyState title="Nothing tracked yet.">
              Press "Track this job" on any job in Job matches, or add one yourself with the button above.
            </EmptyState>
          )}
          {apps.length > 0 && (
            <div className="board">
              {STATUSES.map((s) => (
                <section
                  key={s.id}
                  className={`column column-${s.id} ${overColumn === s.id ? "column-over" : ""}`}
                  aria-label={`${s.label}, ${byStatus[s.id].length}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOverColumn(s.id);
                  }}
                  onDragLeave={() => setOverColumn((c) => (c === s.id ? null : c))}
                  onDrop={(e) => onDrop(e, s.id)}
                >
                  <h3 className="column-head">
                    {s.label} <span className="grey">{byStatus[s.id].length}</span>
                  </h3>
                  <div className="column-cards">
                    {byStatus[s.id].map((app) => (
                      <Card
                        key={app.id}
                        app={app}
                        dragging={dragId === app.id}
                        onDragStart={onDragStart}
                        onMove={move}
                        onUpdate={update}
                        onRemove={remove}
                      />
                    ))}
                    {byStatus[s.id].length === 0 && <p className="column-empty">Drop a card here</p>}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
