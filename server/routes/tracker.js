import express from "express";
import { getStores } from "../lib/stores.js";
import { createRateLimiter } from "../middleware/rateLimiter.js";

// Application tracker. The auth gate (app.js) guarantees req.user. Every read
// and write is scoped to req.user.id on the server; a user id in the request
// body is ignored. Another user's card answers 404, not 403, so ids can't be probed.

const router = express.Router();

export const STATUSES = ["saved", "applied", "interview", "offer", "rejected"];
const MAX_APPLICATIONS_PER_USER = 500;
const LIMITS = { title: 200, company: 200, location: 200, jobUrl: 1000, note: 500, externalId: 200 };

const limiter = createRateLimiter({ windowMs: 60 * 1000, max: 60, message: "Too many tracker changes. Please wait a moment." });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(value, max, field, errors, { required = false } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) errors.push(`${field} is required.`);
    return value === undefined ? undefined : null;
  }
  if (typeof value !== "string") {
    errors.push(`${field} must be text.`);
    return undefined;
  }
  const v = value.trim();
  if (required && !v) errors.push(`${field} is required.`);
  if (v.length > max) errors.push(`${field} must be at most ${max} characters.`);
  return v || null;
}

// Validates and maps request fields to table columns. `partial` for PATCH.
export function parseApplication(body = {}, { partial = false } = {}) {
  const errors = [];
  const out = {};
  const set = (col, v) => v !== undefined && (out[col] = v);

  set("title", text(body.title, LIMITS.title, "Job title", errors, { required: !partial }));
  set("company", text(body.company, LIMITS.company, "Company", errors, { required: !partial }));
  set("location", text(body.location, LIMITS.location, "Location", errors));
  set("note", text(body.note, LIMITS.note, "Note", errors));

  const url = text(body.jobUrl, LIMITS.jobUrl, "Job link", errors);
  if (url) {
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("bad protocol");
    } catch {
      errors.push("Job link must be an http(s) URL.");
    }
  }
  set("job_url", url);

  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) errors.push(`status must be one of: ${STATUSES.join(", ")}.`);
    else out.status = body.status;
  } else if (!partial) {
    out.status = "saved";
  }

  if (body.followUpDate !== undefined) {
    if (body.followUpDate === null || body.followUpDate === "") out.follow_up_date = null;
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(body.followUpDate) || Number.isNaN(Date.parse(body.followUpDate))) {
      errors.push("Follow-up date must be YYYY-MM-DD.");
    } else out.follow_up_date = body.followUpDate;
  }

  if (!partial) set("external_job_id", text(body.externalId, LIMITS.externalId, "externalId", errors));

  if (partial && (out.title === null || out.company === null)) errors.push("Job title and company can't be empty.");
  return { errors, fields: out };
}

const toClient = (row) => ({
  id: row.id,
  title: row.title,
  company: row.company,
  location: row.location || "",
  jobUrl: row.job_url || "",
  status: row.status,
  note: row.note || "",
  followUpDate: row.follow_up_date || "",
  externalId: row.external_job_id || null,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

router.get("/tracker", async (req, res) => {
  try {
    const rows = await getStores().tracker.list(req.user.id);
    return res.json({ applications: rows.map(toClient) });
  } catch (err) {
    console.error("Tracker list error:", err.message);
    return res.status(500).json({ error: "Couldn't load your tracker. Please try again." });
  }
});

router.post("/tracker", limiter, async (req, res) => {
  try {
    const { errors, fields } = parseApplication(req.body);
    if (errors.length) return res.status(400).json({ error: errors[0], details: errors });

    const store = getStores().tracker;
    if (fields.external_job_id) {
      const existing = await store.findByExternalId(req.user.id, fields.external_job_id);
      if (existing) return res.json({ application: toClient(existing), duplicate: true });
    }
    if ((await store.count(req.user.id)) >= MAX_APPLICATIONS_PER_USER) {
      return res.status(400).json({ error: `The tracker holds up to ${MAX_APPLICATIONS_PER_USER} applications. Remove some old ones first.` });
    }

    const row = await store.insert(req.user.id, fields);
    res.locals.feature = "tracker_add";
    return res.status(201).json({ application: toClient(row) });
  } catch (err) {
    console.error("Tracker add error:", err.message);
    return res.status(500).json({ error: "Couldn't save this application. Please try again." });
  }
});

router.patch("/tracker/:id", limiter, async (req, res) => {
  try {
    if (!UUID.test(req.params.id)) return res.status(404).json({ error: "Application not found." });
    const { errors, fields } = parseApplication(req.body, { partial: true });
    if (errors.length) return res.status(400).json({ error: errors[0], details: errors });
    if (Object.keys(fields).length === 0) return res.status(400).json({ error: "Nothing to update." });

    const store = getStores().tracker;
    // Copy the old status before updating: a store may hand back the same row object.
    const previousStatus = fields.status ? (await store.list(req.user.id)).find((a) => a.id === req.params.id)?.status : undefined;
    const row = await store.update(req.user.id, req.params.id, fields);
    if (!row) return res.status(404).json({ error: "Application not found." });
    if (fields.status && previousStatus && previousStatus !== fields.status) res.locals.feature = "tracker_move";
    return res.json({ application: toClient(row) });
  } catch (err) {
    console.error("Tracker update error:", err.message);
    return res.status(500).json({ error: "Couldn't update this application. Please try again." });
  }
});

router.delete("/tracker/:id", limiter, async (req, res) => {
  try {
    if (!UUID.test(req.params.id)) return res.status(404).json({ error: "Application not found." });
    const removed = await getStores().tracker.remove(req.user.id, req.params.id);
    if (!removed) return res.status(404).json({ error: "Application not found." });
    return res.status(204).end();
  } catch (err) {
    console.error("Tracker delete error:", err.message);
    return res.status(500).json({ error: "Couldn't remove this application. Please try again." });
  }
});

export default router;
