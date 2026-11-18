import React, { useEffect, useState } from "react";
import JobCard from "./JobCard.jsx";
import { apiFetch, postJSON } from "../lib/api.js";
import { useToast } from "../lib/toast.jsx";
import { Alert, Button, Checkbox, EmptyState, Loading, PanelIntro } from "./ui.jsx";

export default function JobSearchPanel({ resumeText, onTailorToJob }) {
  const toast = useToast();
  const [role, setRole] = useState("");
  const [location, setLocation] = useState("");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [fresherFriendly, setFresherFriendly] = useState(false);
  const [datePosted, setDatePosted] = useState("month");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notConfigured, setNotConfigured] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [searched, setSearched] = useState(false);
  const [trackedIds, setTrackedIds] = useState(() => new Set());

  // Pre-fill from the resume's header/summary only. Fields the resume doesn't
  // state clearly stay empty; fresher resumes get the entry-level filter ticked.
  // A field the user has already typed into is never overwritten.
  useEffect(() => {
    let cancelled = false;
    postJSON("/api/jobs/profile", { resumeText })
      .then((d) => {
        if (cancelled) return;
        setRole((r) => r || d.role || "");
        setLocation((l) => l || d.location || "");
        if (d.isFresher) setFresherFriendly(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [resumeText]);

  // One click from a job card into the tracker: job metadata only.
  const handleTrack = async (job) => {
    try {
      const data = await postJSON("/api/tracker", {
        title: job.title,
        company: job.company || "Unknown company",
        location: job.location || undefined,
        jobUrl: job.applyLink && /^https?:\/\//.test(job.applyLink) ? job.applyLink : undefined,
        externalId: job.id || undefined,
        status: "saved"
      });
      setTrackedIds((s) => new Set(s).add(job.id || job.applyLink || job.title));
      toast.success(data.duplicate ? "Already in your tracker" : "Added to your tracker");
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await apiFetch("/api/jobs/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeText, role, location, remoteOnly, fresherFriendly, datePosted })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Job search failed. Please try again.");
      }

      setNotConfigured(data.configured === false);
      setJobs(data.jobs || []);
      if (data.error) setError(data.error);
      else if (data.jobs && data.jobs.length > 0) toast.success(`${data.jobs.length} jobs, best match first`);
      setSearched(true);
    } catch (err) {
      const message = err.message || "Job search failed. Please try again.";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PanelIntro title={<>Jobs that <span className="serif">fit</span> your resume</>}>
        Live openings, each scored against your skills. Role and location come from your resume when it states them
        clearly; change them to anything you like.
      </PanelIntro>

      <form onSubmit={handleSearch} className="box mt-4">
        <div className="form-grid">
          <div>
            <label className="label" htmlFor="jobRole">Role</label>
            <input
              id="jobRole"
              className="input"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. Software Developer"
            />
          </div>
          <div>
            <label className="label" htmlFor="jobLocation">Location</label>
            <input
              id="jobLocation"
              className="input"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Bengaluru (blank = all of India)"
            />
          </div>
          <div>
            <label className="label" htmlFor="datePosted">Posted</label>
            <select
              id="datePosted"
              className="select"
              value={datePosted}
              onChange={(e) => setDatePosted(e.target.value)}
            >
              <option value="all">Any time</option>
              <option value="month">Past month</option>
              <option value="week">Past week</option>
              <option value="3days">Past 3 days</option>
              <option value="today">Today</option>
            </select>
          </div>
        </div>

        <div className="checks">
          <Checkbox checked={remoteOnly} onChange={setRemoteOnly}>Remote only</Checkbox>
          <Checkbox checked={fresherFriendly} onChange={setFresherFriendly}>Entry-level / fresher friendly</Checkbox>
        </div>

        {error && <Alert>{error}</Alert>}

        <div className="action-row">
          <Button type="submit" disabled={loading}>
            {loading ? "Searching…" : "Search jobs"}
          </Button>
        </div>
      </form>

      {loading && <Loading label="Looking for openings" lines={5} />}

      {!loading && notConfigured && (
        <EmptyState title="Job search isn't switched on yet.">
          Add JSEARCH_API_KEY to the server's .env file to enable live job matching. Everything else works without it.
        </EmptyState>
      )}

      {!loading && !notConfigured && !searched && (
        <EmptyState title="Search to see live openings, best match first.">
          Each job shows how much of it your resume already covers and which skills it asks for that you haven't listed.
        </EmptyState>
      )}

      {!loading && !notConfigured && searched && jobs.length === 0 && !error && (
        <EmptyState title="Nothing matched those filters.">
          Try a broader role, another city, or switch off a filter.
        </EmptyState>
      )}

      {!loading && jobs.length > 0 && (
        <div className="job-list">
          {jobs.map((job) => (
            <JobCard
              key={job.id || job.applyLink || job.title}
              job={job}
              onTailor={() => onTailorToJob(job)}
              onTrack={() => handleTrack(job)}
              tracked={trackedIds.has(job.id || job.applyLink || job.title)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
