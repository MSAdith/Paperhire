import React, { useEffect, useRef, useState } from "react";
import { Alert, Button } from "./ui.jsx";
import { linkProps } from "../lib/router.js";
import { useAuth } from "../lib/auth.jsx";

const SCAN_STEPS = ["Reading your resume", "Checking layout and sections", "Matching keywords", "Scoring 8 categories"];

function Scanning() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setStep((s) => Math.min(s + 1, SCAN_STEPS.length - 1)), 1300);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="scan" role="status" aria-live="polite">
      <p className="scan-status">{SCAN_STEPS[step]}…</p>
      <div className="scan-track" aria-hidden="true">
        <div className="scan-fill" />
      </div>
    </div>
  );
}

// Product shot: a resume page with the kind of notes Paperhire gives back.
function ResumeShot() {
  return (
    <figure className="shot" aria-label="Example: an annotated resume with a score of 86">
      <div className="page" aria-hidden="true">
        <p className="page-name">Priya Sharma</p>
        <p className="page-role">Frontend Developer · Bengaluru · priya@mail.com</p>

        <p className="page-h">Experience</p>
        <p className="page-text">
          <span className="page-mark-bad">Responsible for</span> building a <span className="page-mark">React</span> dashboard used by
          4,000 sellers
        </p>
        <div className="page-line" style={{ width: "86%" }} />
        <div className="page-line" style={{ width: "72%" }} />

        <p className="page-h">Projects</p>
        <div className="page-line" style={{ width: "90%" }} />
        <div className="page-line" style={{ width: "64%" }} />
        <div className="page-line" style={{ width: "78%" }} />

        <p className="page-h">Skills</p>
        <p className="page-text">
          <span className="page-mark">JavaScript</span>, <span className="page-mark">TypeScript</span>, HTML, CSS, Git
        </p>

        <p className="page-h">Education</p>
        <div className="page-line" style={{ width: "70%" }} />
      </div>

      <div className="sticker sticker-score">
        <strong>86</strong>
        ATS score
      </div>
      <div className="sticker sticker-missing">
        Missing: Node.js, SQL
      </div>
      <div className="sticker sticker-verb">
        "Responsible for" → "Built"
      </div>
    </figure>
  );
}

// Shown in place of the upload box when signed out: the hero stays public,
// every feature needs an account.
function SignInCallToAction({ authReady }) {
  const auth = useAuth();
  if (authReady && !auth.configured) {
    return (
      <div className="upload-panel">
        <Alert tone="note">Sign-in isn't set up on this server yet, so resume checks are switched off.</Alert>
      </div>
    );
  }
  return (
    <div className="upload-panel">
      <div className="cta-box">
        <p className="cta-title">Free, with a Google account or just your email.</p>
        <p className="dropzone-hint">No password. Your resume is read in memory and never stored.</p>
        <div className="upload-row" style={{ marginTop: "var(--s3)" }}>
          <a className="btn btn-primary" {...linkProps("/signin")}>
            Sign in to check your resume
          </a>
          <a className="link-btn" {...linkProps("/signup")}>
            New here? Create an account
          </a>
        </div>
      </div>
    </div>
  );
}

export default function UploadView({ onAnalyze, loading, error, signedIn = true, authReady = true }) {
  const [file, setFile] = useState(null);
  const [jdText, setJdText] = useState("");
  const [showJd, setShowJd] = useState(false);
  const [validationError, setValidationError] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const validateAndSetFile = (selectedFile) => {
    setValidationError("");
    if (!selectedFile) return;

    const validExtensions = [".pdf", ".docx"];
    const validMimes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ];

    const fileName = selectedFile.name.toLowerCase();
    const isValidExt = validExtensions.some(ext => fileName.endsWith(ext));
    const isValidMime = validMimes.includes(selectedFile.type);

    if (!isValidExt && !isValidMime) {
      setValidationError("Invalid file format. Please upload a .pdf or .docx resume file.");
      setFile(null);
      return;
    }

    if (selectedFile.size > 5 * 1024 * 1024) {
      setValidationError("File size exceeds 5 MB limit. Please select a smaller resume.");
      setFile(null);
      return;
    }

    setFile(selectedFile);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (loading) return;
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    if (!loading) setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
    e.target.value = "";
  };

  const openPicker = () => {
    if (!loading && fileInputRef.current) fileInputRef.current.click();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!file) {
      setValidationError("Please select or drop a PDF/DOCX resume file before submitting.");
      return;
    }
    onAnalyze(file, jdText);
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <section className="hero">
      <div>
        <h1 className="hero-title">
          Your resume,
          <span className="serif">read like a recruiter would.</span>
        </h1>
        <p className="hero-sub">
          Upload it and see what applicant tracking software picks up, what it misses, and which lines to rewrite. Then
          find live jobs, tailor it to one, and prep for the interview.
        </p>

        {!signedIn ? (
          <SignInCallToAction authReady={authReady} />
        ) : (
        <form className="upload-panel" onSubmit={handleSubmit} noValidate>
          <div
            className={`dropzone ${isDragOver ? "is-dragover" : ""}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={openPicker}
            tabIndex={0}
            role="button"
            aria-label="Upload resume file"
            aria-busy={loading}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openPicker();
              }
            }}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              style={{ display: "none" }}
            />
            <span className="dropzone-mark" aria-hidden="true">
              {file ? (file.name.toLowerCase().endsWith(".docx") ? "DOCX" : "PDF") : "CV"}
            </span>
            <div style={{ minWidth: 0 }}>
              <p className="dropzone-title">
                {isDragOver ? "Let go to upload" : file ? "Ready when you are" : "Drop your resume here"}
              </p>
              {file ? (
                <p className="file-chip" onClick={(e) => e.stopPropagation()}>
                  <span className="file-chip-name">{file.name}</span>
                  <span className="grey">{formatSize(file.size)}</span>
                  <button type="button" className="x-btn" onClick={() => setFile(null)} aria-label="Remove selected file" disabled={loading}>
                    ×
                  </button>
                </p>
              ) : (
                <p className="dropzone-hint">or click to choose a file. PDF or DOCX, up to 5 MB.</p>
              )}
            </div>

            {loading && <Scanning />}
          </div>

          <div className="mt-3">
            <button type="button" className="link-btn" aria-expanded={showJd} aria-controls="jdPanel" onClick={() => setShowJd((v) => !v)}>
              {showJd ? "Hide the job description" : "Got a job in mind? Add its description"}
            </button>

            {showJd && (
              <div id="jdPanel" className="field mt-2">
                <label htmlFor="jdInput" className="visually-hidden">Target job description</label>
                <textarea
                  id="jdInput"
                  className="textarea"
                  placeholder="Paste the job description. We'll compare its keywords with yours."
                  value={jdText}
                  onChange={(e) => setJdText(e.target.value)}
                />
              </div>
            )}
          </div>

          {(validationError || error) && <Alert>{validationError || error}</Alert>}

          <div className="upload-row">
            <Button type="submit" disabled={loading}>
              {loading ? "Checking…" : "Check my resume"}
            </Button>
            <p className="privacy">
              Read in memory and never stored. AI features are processed by a third-party AI provider.
            </p>
          </div>
        </form>
        )}
      </div>

      <ResumeShot />
    </section>
  );
}
