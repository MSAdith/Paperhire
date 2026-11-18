import React, { useState } from "react";
import { linkProps } from "../lib/router.js";

const KEY = "ph_notice_seen";

function seen() {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

// First-visit notice about the one analytics cookie. Dismissal is remembered
// in this browser only.
export default function CookieNotice() {
  const [open, setOpen] = useState(() => !seen());
  if (!open) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(KEY, "1");
    } catch {
      // storage blocked: the notice just shows again next visit
    }
    setOpen(false);
  };

  return (
    <div className="cookie-notice" role="region" aria-label="Cookie notice">
      <p>
        We use one cookie with an anonymous ID to count visits, and basic usage stats to improve the site. Resumes are
        never stored. <a {...linkProps("/privacy")}>Privacy</a>
      </p>
      <button type="button" className="btn btn-secondary btn-sm" onClick={dismiss}>
        OK
      </button>
    </div>
  );
}
