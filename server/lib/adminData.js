import { getSupabaseAdmin } from "./supabase.js";

// Reads for the admin dashboard and auth-event bookkeeping. All of these run
// with the service-role key on the server only.

const PAGE = 1000;
// Safety cap so one dashboard load can't pull unbounded data. At this app's
// scale it's never reached; past it, move the aggregation into SQL.
const MAX_EVENTS = 200000;

const EVENT_COLUMNS = "created_at,type,name,path,result,duration_ms,route,error_type,user_id,visitor_id,device,browser,country,city";

export async function fetchAllEvents() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const rows = [];
  for (let from = 0; from < MAX_EVENTS; from += PAGE) {
    const { data, error } = await supabase
      .from("events")
      .select(EVENT_COLUMNS)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Could not read events: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

export async function fetchAllUsers() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const users = [];
  for (let page = 1; page <= 200; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PAGE });
    if (error) throw new Error(`Could not list users: ${error.message}`);
    users.push(...data.users);
    if (data.users.length < PAGE) break;
  }
  return users;
}

// Most recent sign_up/sign_in event for a user, or null.
export async function fetchLastAuthEvent(userId) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("events")
    .select("type,created_at")
    .eq("user_id", userId)
    .in("type", ["sign_up", "sign_in"])
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`Could not read auth events: ${error.message}`);
  return data[0] || null;
}
