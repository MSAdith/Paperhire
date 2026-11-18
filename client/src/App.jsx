import React, { useEffect, useState } from "react";
import Header from "./components/Header.jsx";
import UploadView from "./components/UploadView.jsx";
import Workspace from "./components/Workspace.jsx";
import SignInPage from "./components/SignInPage.jsx";
import PrivacyPage from "./components/PrivacyPage.jsx";
import AdminPage from "./components/AdminPage.jsx";
import NotFound from "./components/NotFound.jsx";
import CookieNotice from "./components/CookieNotice.jsx";
import TrackerBoard from "./components/TrackerBoard.jsx";
import { useToast } from "./lib/toast.jsx";
import { useAuth } from "./lib/auth.jsx";
import { apiFetch } from "./lib/api.js";
import { linkProps, navigate, usePath } from "./lib/router.js";
import { trackPageView } from "./lib/analytics.js";

export default function App() {
  const toast = useToast();
  const auth = useAuth();
  const path = usePath();
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [jdText, setJdText] = useState("");
  const [selectedJob, setSelectedJob] = useState(null);

  useEffect(() => {
    trackPageView(path);
  }, [path]);

  // Signed out (or the session expired): drop the in-memory results too.
  useEffect(() => {
    if (auth.ready && !auth.user) {
      setResults(null);
      setSelectedJob(null);
    }
  }, [auth.ready, auth.user]);

  useEffect(() => {
    if (auth.expired) toast.error("Your session ended. Please sign in again.");
  }, [auth.expired, toast]);

  const handleAnalyze = async (file, jdText) => {
    setLoading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("resume", file);
      formData.append("jd", jdText);

      const response = await apiFetch("/api/analyze", {
        method: "POST",
        body: formData
      });

      const responseText = await response.text();
      let data = null;

      try {
        data = JSON.parse(responseText);
      } catch (jsonErr) {
        console.error("Non-JSON Response received from server:", responseText);
        throw new Error("The server had a problem analysing your resume. Please try again.");
      }

      if (!response.ok || !data) {
        throw new Error(data?.error || "The server had a problem analysing your resume. Please try again.");
      }

      setResults(data);
      setJdText(jdText);
      window.scrollTo({ top: 0 });
    } catch (err) {
      console.error("Analysis Error:", err);
      const message = err.message || "The server had a problem analysing your resume. Please try again.";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setResults(null);
    setError("");
    setJdText("");
    setSelectedJob(null);
    navigate("/");
    window.scrollTo({ top: 0 });
  };

  let page;
  if (path === "/signin" || path === "/signup") {
    page = <SignInPage mode={path === "/signup" ? "signup" : "signin"} />;
  } else if (path === "/privacy") {
    page = <PrivacyPage />;
  } else if (path === "/admin") {
    page = <AdminPage />;
  } else if (path === "/tracker") {
    page = auth.ready && !auth.user ? <SignInPage mode="signin" /> : <div className="workspace"><TrackerBoard /></div>;
  } else if (path === "/") {
    page =
      results && auth.user ? (
        <Workspace
          results={results}
          onReset={handleReset}
          jdText={jdText}
          setJdText={setJdText}
          selectedJob={selectedJob}
          setSelectedJob={setSelectedJob}
        />
      ) : (
        <UploadView onAnalyze={handleAnalyze} loading={loading} error={error} signedIn={Boolean(auth.user)} authReady={auth.ready} />
      );
  } else {
    page = <NotFound />;
  }

  return (
    <div className="app">
      <Header onReset={handleReset} hasResults={Boolean(results && auth.user && path === "/")} />
      <main className="site-main">
        <div className="container">{page}</div>
      </main>
      <footer className="site-footer">
        <div className="container footer-inner">
          <p>Paperhire · AI features are processed by a third-party AI provider.</p>
          <p>
            Resumes are read in memory and never stored. <a {...linkProps("/privacy")}>Privacy</a>
          </p>
        </div>
      </footer>
      <CookieNotice />
    </div>
  );
}
