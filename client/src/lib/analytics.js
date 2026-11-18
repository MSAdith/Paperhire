import { getAccessToken } from "./supabaseClient.js";

// Anonymous visitor id in a first-party cookie, so unique visitors can be
// counted (including signed-out ones). It's random and not tied to any
// personal data. Page views send only the path, never page content.
const COOKIE = "ph_vid";
const ONE_YEAR = 60 * 60 * 24 * 365;

function randomId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return Array.from(window.crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function ensureVisitorId() {
  const match = document.cookie.match(/(?:^|;\s*)ph_vid=([^;]+)/);
  if (match) return match[1];
  const id = randomId();
  document.cookie = `${COOKIE}=${id}; Max-Age=${ONE_YEAR}; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  return id;
}

export async function trackPageView(path) {
  try {
    ensureVisitorId();
    const token = await getAccessToken();
    await fetch("/api/events/page-view", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ path }),
      keepalive: true
    });
  } catch {
    // Analytics must never get in the way.
  }
}
