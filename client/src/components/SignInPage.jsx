import React, { useEffect, useState } from "react";
import { useAuth } from "../lib/auth.jsx";
import { linkProps, navigate } from "../lib/router.js";
import { Alert, Button } from "./ui.jsx";

const COPY = {
  signin: {
    title: (
      <>
        Welcome <span className="serif">back.</span>
      </>
    ),
    intro: "Sign in to check your resume, match it to jobs and prep for interviews.",
    emailButton: "Email me a sign-in link",
    switchText: "New to Paperhire?",
    switchLink: "Create an account",
    switchPath: "/signup"
  },
  signup: {
    title: (
      <>
        Make an account, <span className="serif">it takes a minute.</span>
      </>
    ),
    intro: "No password to remember. Use Google, or we'll email you a link that signs you in.",
    emailButton: "Email me a sign-up link",
    switchText: "Already have an account?",
    switchLink: "Sign in",
    switchPath: "/signin"
  }
};

function friendlyError(err, mode) {
  const msg = (err && err.message) || "";
  if (/signups? not allowed|user not found/i.test(msg) && mode === "signin") {
    return "There's no account for that email yet. Create one instead.";
  }
  if (/rate limit|too many|security purposes/i.test(msg)) {
    return "Too many links requested. Wait a minute, then try again.";
  }
  if (/provider is not enabled/i.test(msg)) {
    return "Google sign-in isn't switched on for this site yet. Use the email link instead.";
  }
  return msg || "Something went wrong. Please try again.";
}

export default function SignInPage({ mode = "signin" }) {
  const auth = useAuth();
  const copy = COPY[mode];
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (auth.ready && auth.user) navigate("/", { replace: true });
  }, [auth.ready, auth.user]);

  useEffect(() => {
    setError("");
    setSentTo("");
  }, [mode]);

  const google = async () => {
    setBusy("google");
    setError("");
    try {
      await auth.signInWithGoogle();
    } catch (err) {
      setError(friendlyError(err, mode));
      setBusy("");
    }
  };

  const magicLink = async (e) => {
    e.preventDefault();
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError("Enter a valid email address.");
      return;
    }
    setBusy("email");
    setError("");
    try {
      await auth.sendMagicLink(value, { createAccount: mode === "signup" });
      setSentTo(value);
    } catch (err) {
      setError(friendlyError(err, mode));
    } finally {
      setBusy("");
    }
  };

  return (
    <section className="auth-page">
      <div>
        <h1 className="auth-title">{copy.title}</h1>
        <p className="hero-sub">{copy.intro}</p>
      </div>

      <div className="box auth-box">
        {auth.ready && !auth.configured ? (
          <Alert tone="note">Sign-in isn't set up on this server yet.</Alert>
        ) : sentTo ? (
          <div className="block block-lime">
            <p className="card-title">Check your inbox.</p>
            <p className="mt-2">
              We sent a link to <strong>{sentTo}</strong>. Open it on this device to {mode === "signup" ? "finish signing up" : "sign in"}.
              It can take a minute; check spam if it doesn't arrive.
            </p>
            <button type="button" className="link-btn mt-3" onClick={() => setSentTo("")}>
              Use a different email
            </button>
          </div>
        ) : (
          <>
            <Button variant="secondary" block onClick={google} disabled={Boolean(busy)}>
              {busy === "google" ? "Opening Google…" : "Continue with Google"}
            </Button>

            <p className="auth-or">or</p>

            <form onSubmit={magicLink} noValidate>
              <label className="label" htmlFor="authEmail">
                Email
              </label>
              <input
                id="authEmail"
                className="input"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Button type="submit" block className="mt-2" disabled={Boolean(busy)}>
                {busy === "email" ? "Sending…" : copy.emailButton}
              </Button>
            </form>
          </>
        )}

        {error && <Alert>{error}</Alert>}

        <p className="auth-switch">
          {copy.switchText} <a {...linkProps(copy.switchPath)}>{copy.switchLink}</a>
        </p>
        <p className="small grey mt-2">
          By continuing you agree to our light-touch analytics, explained on the <a {...linkProps("/privacy")}>privacy page</a>.
        </p>
      </div>
    </section>
  );
}
