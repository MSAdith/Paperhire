import { getAccessToken } from "./supabaseClient.js";

// Every feature endpoint requires a signed-in user, so every call carries the
// Supabase access token. A 401 means the session is gone: listeners (the auth
// provider) send the user back to sign in.
export const UNAUTHENTICATED_EVENT = "paperhire:unauthenticated";

async function authHeaders(extra = {}) {
  const token = await getAccessToken();
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

function notifyIfSignedOut(response) {
  if (response.status === 401) window.dispatchEvent(new Event(UNAUTHENTICATED_EVENT));
}

// fetch() with the auth header added.
export async function apiFetch(url, init = {}) {
  const response = await fetch(url, { ...init, headers: await authHeaders(init.headers || {}) });
  notifyIfSignedOut(response);
  return response;
}

export async function postJSON(url, body) {
  const response = await apiFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    throw new Error("The server returned an unexpected response. Please try again.");
  }

  if (!response.ok) {
    throw new Error(data?.error || "Request failed. Please try again.");
  }
  return data;
}

export async function getJSON(url) {
  const response = await apiFetch(url);
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const err = new Error(data?.error || "Request failed. Please try again.");
    err.status = response.status;
    throw err;
  }
  return data;
}

export async function downloadFile(url, body, filename) {
  const response = await apiFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    let message = "Download failed. Please try again.";
    try {
      const data = await response.json();
      if (data?.error) message = data.error;
    } catch {
      // non-JSON error body; keep default message
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

export function downloadTextFile(text, filename) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}
