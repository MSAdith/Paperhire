import React, { useEffect, useRef, useState } from "react";
import { LayoutGroup, motion } from "motion/react";
import ResultsView from "./ResultsView.jsx";
import JobSearchPanel from "./JobSearchPanel.jsx";
import TailorResumePanel from "./TailorResumePanel.jsx";
import CoverLetterPanel from "./CoverLetterPanel.jsx";
import InterviewPrepPanel from "./InterviewPrepPanel.jsx";
import SkillGapPanel from "./SkillGapPanel.jsx";
import ReachOutPanel from "./ReachOutPanel.jsx";
import TrackerBoard from "./TrackerBoard.jsx";
import { Button } from "./ui.jsx";

const TABS = [
  { id: "score", label: "ATS score" },
  { id: "jobs", label: "Job matches" },
  { id: "tailor", label: "Tailor resume" },
  { id: "cover", label: "Cover letter" },
  { id: "interview", label: "Interview prep" },
  { id: "gap", label: "Skill gap" },
  { id: "reach", label: "Reach out" },
  { id: "tracker", label: "Tracker" }
];

export default function Workspace({ results, onReset, jdText, setJdText, selectedJob, setSelectedJob }) {
  const [activeTab, setActiveTab] = useState("score");
  const tabRefs = useRef({});
  const tabsRef = useRef(null);

  // Keep the active tab visible when the bar scrolls sideways (mobile).
  useEffect(() => {
    const el = tabRefs.current[activeTab];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [activeTab]);

  const selectTab = (id) => {
    if (id === activeTab) return;
    setActiveTab(id);
    // If the user switched tabs from far down the page, bring the tab bar back.
    const bar = tabsRef.current;
    if (bar && bar.getBoundingClientRect().top <= 64 + 1) {
      const top = bar.offsetTop - 64;
      window.scrollTo({ top: Math.max(0, top) });
    }
  };

  const handleTailorToJob = (job) => {
    setSelectedJob({ title: job.title, company: job.company, description: job.description });
    setJdText(job.description || "");
    selectTab("tailor");
  };

  const jdProps = {
    resumeText: results.resumeText,
    jdText,
    setJdText,
    selectedJob,
    onClearSelectedJob: () => setSelectedJob(null)
  };

  const onTabKeyDown = (e, index) => {
    const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = TABS[(index + delta + TABS.length) % TABS.length];
    selectTab(next.id);
    tabRefs.current[next.id]?.focus();
  };

  return (
    <div className="workspace">
      <div className="ws-head">
        <div style={{ minWidth: 0 }}>
          <h1 className="ws-file">{results.filename}</h1>
          <p className="ws-meta">{(results.filesize / 1024).toFixed(1)} KB, read in memory and not stored.</p>
        </div>
        <div className="ws-actions no-print">
          {activeTab === "score" && (
            <Button variant="secondary" size="sm" onClick={() => window.print()}>
              Print report
            </Button>
          )}
        </div>
      </div>

      <LayoutGroup id="workspace-tabs">
        <div ref={tabsRef} className="tabs" role="tablist" aria-label="Workspace sections">
          {TABS.map((tab, i) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                ref={(el) => (tabRefs.current[tab.id] = el)}
                type="button"
                role="tab"
                id={`tab-${tab.id}`}
                aria-selected={active}
                aria-controls={`panel-${tab.id}`}
                tabIndex={active ? 0 : -1}
                className="tab"
                onClick={() => selectTab(tab.id)}
                onKeyDown={(e) => onTabKeyDown(e, i)}
              >
                {tab.label}
                {active && (
                  <motion.span layoutId="tab-underline" className="tab-underline" transition={{ type: "spring", stiffness: 500, damping: 40 }} />
                )}
              </button>
            );
          })}
        </div>
      </LayoutGroup>

      <div id={`panel-${activeTab}`} role="tabpanel" aria-labelledby={`tab-${activeTab}`} className="panel">
        {activeTab === "score" && <ResultsView results={results} />}

        {activeTab === "jobs" && (
          <JobSearchPanel resumeText={results.resumeText} onTailorToJob={handleTailorToJob} />
        )}

        {activeTab === "tailor" && <TailorResumePanel {...jdProps} />}

        {activeTab === "cover" && <CoverLetterPanel {...jdProps} />}

        {activeTab === "interview" && <InterviewPrepPanel {...jdProps} />}

        {activeTab === "gap" && <SkillGapPanel {...jdProps} />}

        {activeTab === "reach" && <ReachOutPanel {...jdProps} />}

        {activeTab === "tracker" && <TrackerBoard />}
      </div>
    </div>
  );
}
