import crypto from "crypto";
import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase.js";

// Storage for the tracker and AI feedback. Production uses
// Supabase (service role, server only). Tests swap in the in-memory version
// with setStores(memoryStores()).
//
// Every tracker method takes the signed-in user's id from the server and
// scopes the query to it; callers never pass a user id from the request body.

// ---------- In-memory ----------
export function memoryStores() {
  const applications = new Map();
  const feedback = [];

  return {
    tracker: {
      async list(userId) {
        return [...applications.values()].filter((a) => a.user_id === userId).sort((a, b) => b.created_at.localeCompare(a.created_at));
      },
      async count(userId) {
        return [...applications.values()].filter((a) => a.user_id === userId).length;
      },
      async findByExternalId(userId, externalId) {
        return [...applications.values()].find((a) => a.user_id === userId && a.external_job_id === externalId) || null;
      },
      async insert(userId, fields) {
        const now = new Date().toISOString();
        const row = { ...fields, id: crypto.randomUUID(), user_id: userId, created_at: now, updated_at: now };
        applications.set(row.id, row);
        return row;
      },
      async update(userId, id, fields) {
        const row = applications.get(id);
        if (!row || row.user_id !== userId) return null;
        Object.assign(row, fields, { updated_at: new Date().toISOString() });
        return row;
      },
      async remove(userId, id) {
        const row = applications.get(id);
        if (!row || row.user_id !== userId) return false;
        applications.delete(id);
        return true;
      }
    },
    feedback: {
      async insert(row) {
        const stored = { ...row, id: feedback.length + 1, created_at: new Date().toISOString() };
        feedback.push(stored);
        return stored;
      },
      async all() {
        return [...feedback];
      }
    }
  };
}

// ---------- Supabase ----------
const APP_COLUMNS = "id,user_id,title,company,location,job_url,status,note,follow_up_date,external_job_id,created_at,updated_at";

function check(error, what) {
  if (error) throw new Error(`Could not ${what}: ${error.message}`);
}

function supabaseStores() {
  const db = () => getSupabaseAdmin();
  return {
    tracker: {
      async list(userId) {
        const { data, error } = await db().from("applications").select(APP_COLUMNS).eq("user_id", userId).order("created_at", { ascending: false });
        check(error, "load applications");
        return data;
      },
      async count(userId) {
        const { count, error } = await db().from("applications").select("id", { count: "exact", head: true }).eq("user_id", userId);
        check(error, "count applications");
        return count || 0;
      },
      async findByExternalId(userId, externalId) {
        const { data, error } = await db().from("applications").select(APP_COLUMNS).eq("user_id", userId).eq("external_job_id", externalId).limit(1);
        check(error, "look up application");
        return data[0] || null;
      },
      async insert(userId, fields) {
        const { data, error } = await db().from("applications").insert({ ...fields, user_id: userId }).select(APP_COLUMNS).single();
        check(error, "save application");
        return data;
      },
      async update(userId, id, fields) {
        const { data, error } = await db()
          .from("applications")
          .update({ ...fields, updated_at: new Date().toISOString() })
          .eq("id", id)
          .eq("user_id", userId)
          .select(APP_COLUMNS);
        check(error, "update application");
        return data[0] || null;
      },
      async remove(userId, id) {
        const { data, error } = await db().from("applications").delete().eq("id", id).eq("user_id", userId).select("id");
        check(error, "delete application");
        return data.length > 0;
      }
    },
    feedback: {
      async insert(row) {
        const { error } = await db().from("ai_feedback").insert(row);
        check(error, "save feedback");
        return row;
      },
      async all() {
        const rows = [];
        for (let from = 0; from < 50000; from += 1000) {
          const { data, error } = await db()
            .from("ai_feedback")
            .select("created_at,user_id,feature,rating,reason,comment,provider,model,response_ms")
            .order("id", { ascending: true })
            .range(from, from + 999);
          check(error, "read feedback");
          rows.push(...data);
          if (data.length < 1000) break;
        }
        return rows;
      }
    }
  };
}

let override = null;

export function setStores(stores) {
  override = stores || null;
}

let fallbackMemory = null;

export function getStores() {
  if (override) return override;
  if (isSupabaseConfigured()) return supabaseStores();
  // No database (local dev without Supabase): auth is off then anyway, so this
  // only keeps code paths from crashing.
  fallbackMemory = fallbackMemory || memoryStores();
  return fallbackMemory;
}
