import React from "react";
import { Button, LinkButton, toneBlock, toneFor } from "./ui.jsx";

export default function JobCard({ job, onTailor, onTrack, tracked }) {
  const { title, company, location, postedAt, applyLink, isRemote, matchPercent, missingSkills = [] } = job;

  let postedLabel = "Recently posted";
  if (postedAt) {
    const parsed = new Date(postedAt);
    if (!isNaN(parsed.getTime())) postedLabel = `Posted ${parsed.toLocaleDateString()}`;
  }

  return (
    <article className="box job">
      <div className="job-top">
        <div style={{ minWidth: 0 }}>
          <h3 className="job-title">{title}</h3>
          {company && <p className="job-company">{company}</p>}
          <p className="job-meta">
            {[location, isRemote ? "Remote" : null, postedLabel].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className={`match ${toneBlock[toneFor(matchPercent)]}`} aria-label={`${matchPercent}% match`}>
          <strong>{matchPercent}%</strong>
          <span>match</span>
        </div>
      </div>

      {missingSkills.length > 0 && (
        <div className="job-gaps">
          <p className="job-gaps-label">Not on your resume</p>
          <div className="chips">
            {missingSkills.map((skill, i) => (
              <span key={i} className="chip chip-missing">{skill}</span>
            ))}
          </div>
        </div>
      )}

      <div className="job-actions">
        <Button size="sm" onClick={onTailor}>
          Tailor my resume to this job
        </Button>
        {onTrack && (
          <Button variant="secondary" size="sm" onClick={onTrack} disabled={tracked}>
            {tracked ? "Tracked" : "Track this job"}
          </Button>
        )}
        {applyLink && (
          <LinkButton href={applyLink} target="_blank" rel="noopener noreferrer" size="sm">
            Apply ↗
          </LinkButton>
        )}
      </div>
    </article>
  );
}
