import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "../lib/auth.jsx";
import { getJSON } from "../lib/api.js";
import { linkProps, navigate } from "../lib/router.js";

export function Wordmark() {
  return (
    <span className="wordmark">
      paper<span className="wordmark-hire">hire</span>
    </span>
  );
}

function Avatar({ user }) {
  const [broken, setBroken] = useState(false);
  const initial = (user.name || user.email || "?").trim().charAt(0).toUpperCase();
  if (user.avatarUrl && !broken) {
    return <img className="avatar" src={user.avatarUrl} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} />;
  }
  return (
    <span className="avatar avatar-initial" aria-hidden="true">
      {initial}
    </span>
  );
}

function UserMenu({ user, onSignOut }) {
  const [open, setOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const ref = useRef(null);

  // Only to decide whether to show the Admin link; access itself is checked on the server.
  useEffect(() => {
    let cancelled = false;
    getJSON("/api/admin/me")
      .then((d) => !cancelled && setIsAdmin(Boolean(d.admin)))
      .catch(() => !cancelled && setIsAdmin(false));
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const go = (path) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <div className="user-menu" ref={ref}>
      <button type="button" className="user-button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Avatar user={user} />
        <span className="user-name">{user.name || user.email}</span>
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-head">
            <p className="menu-name">{user.name || "Signed in"}</p>
            <p className="menu-email">{user.email}</p>
          </div>
          <button type="button" role="menuitem" onClick={() => go("/tracker")}>
            Application tracker
          </button>
          {isAdmin && (
            <button type="button" role="menuitem" onClick={() => go("/admin")}>
              Admin dashboard
            </button>
          )}
          <button type="button" role="menuitem" onClick={() => go("/privacy")}>
            Privacy
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export default function Header({ onReset, hasResults }) {
  const auth = useAuth();

  return (
    <header className="site-header">
      <div className="container header-inner">
        <a
          href="/"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            if (onReset) onReset();
          }}
          aria-label="Paperhire home"
        >
          <span className="brand-mark" aria-hidden="true" />
          <Wordmark />
        </a>

        <nav className="header-nav" aria-label="Site">
          {hasResults && (
            <button type="button" className="link-btn" onClick={onReset}>
              New resume
            </button>
          )}
          {auth.ready && auth.user && (
            <a className="header-link header-tracker" {...linkProps("/tracker")}>
              Tracker
            </a>
          )}
          {auth.ready && auth.user && (
            <UserMenu
              user={auth.user}
              onSignOut={async () => {
                await auth.signOut();
                navigate("/");
              }}
            />
          )}
          {auth.ready && !auth.user && auth.configured && (
            <>
              <a className="header-link" {...linkProps("/signin")}>
                Sign in
              </a>
              <a className="btn btn-primary btn-sm" {...linkProps("/signup")}>
                Sign up
              </a>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
