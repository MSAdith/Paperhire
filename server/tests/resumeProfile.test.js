import { describe, it, expect } from "vitest";
import { extractResumeProfile, splitHeaderAndSummary } from "../scoring/resumeProfile.js";
import { jobSearchDefaults } from "../routes/jobs.js";

// Mirrors the real resume that produced Role "Product Manager" and
// Location "if a crash is detected": both came from project text.
const CRASH_APP_RESUME = `Arjun Nair
arjun.nair@example.com | +91 98450 12345 | Bengaluru, Karnataka | github.com/arjun

Career Objective
Aspiring Software Developer eager to build reliable backend systems.

Projects
Crash Alert App | Kotlin, Firebase
- Android app that sends the rider's location if a crash is detected.
- Gathered requirements with a product manager from a local startup.

Education
B.E. Computer Science | RV College of Engineering | 2021 – 2025

Skills
Kotlin, Java, Firebase, Git`;

describe("role/location extraction only uses the header and summary", () => {
  const profile = extractResumeProfile(CRASH_APP_RESUME);

  it("takes the location from a city name in the contact header", () => {
    expect(profile.location).toBe("Bengaluru");
  });

  it("takes the role from the objective, ignoring job titles in project descriptions", () => {
    expect(profile.roleTitles).toEqual(["Software Developer"]);
    expect(profile.roleTitles).not.toContain("Product Manager");
  });

  it("never treats the word 'location' in body text as a location", () => {
    const noCity = CRASH_APP_RESUME.replace("Bengaluru, Karnataka | ", "");
    expect(extractResumeProfile(noCity).location).toBeNull();
  });

  it("ignores cities that only appear in the body (e.g. a college or company address)", () => {
    const resume = `Meera Iyer
meera@example.com | +91 90000 00000

Education
B.Tech | NIT Tiruchirappalli | 2020 – 2024

Experience
Intern | Acme Labs, Pune | Jun 2023 – Aug 2023`;
    expect(extractResumeProfile(resume).location).toBeNull();
  });

  it("matches whole city names only", () => {
    const resume = `Kiran Rao\nkiran@example.com | Looking for an opportune role\n\nSkills\nPython`;
    expect(extractResumeProfile(resume).location).toBeNull();
  });

  it("returns no role when neither the header nor the summary names a known title", () => {
    const resume = `Neha Gupta
neha@example.com | Hyderabad

Summary
Final-year student who enjoys solving problems and learning new tools.

Experience
Software Engineer Intern | Infosys | 2024 – 2024`;
    const p = extractResumeProfile(resume);
    expect(p.roleTitles).toEqual([]);
    expect(p.location).toBe("Hyderabad");
  });

  it("reads a title line under the name and inline 'Objective:' headings", () => {
    const titled = extractResumeProfile(`Rahul Verma\nData Analyst\nrahul@example.com | Pune\n\nSkills\nSQL, Excel`);
    expect(titled.roleTitles[0]).toBe("Data Analyst");
    expect(titled.location).toBe("Pune");

    const inline = extractResumeProfile(`Sana Khan\nsana@example.com\nObjective: To join a team as a Frontend Developer.\nSkills\nReact`);
    expect(inline.roleTitles[0]).toBe("Frontend Developer");
  });

  it("treats a leading 'Contact' section as header and prefers 'New Delhi' over 'Delhi'", () => {
    const resume = `Contact\nphone: +91 99999 99999\nNew Delhi, India\n\nProfile\nBackend Developer with Node.js experience.\n\nProjects\n- Hackathon in Mumbai`;
    const p = extractResumeProfile(resume);
    expect(p.location).toBe("New Delhi");
    expect(p.roleTitles[0]).toBe("Backend Developer");
  });

  it("splits header and summary text", () => {
    const { header, summary } = splitHeaderAndSummary(CRASH_APP_RESUME);
    expect(header).toMatch(/Bengaluru/);
    expect(header).not.toMatch(/crash/);
    expect(summary).toMatch(/Aspiring Software Developer/);
  });
});

describe("job search form defaults", () => {
  it("pre-fills role and location and ticks entry-level for a fresher", () => {
    expect(jobSearchDefaults(CRASH_APP_RESUME)).toEqual({ role: "Software Developer", location: "Bengaluru", isFresher: true });
  });

  it("leaves fields empty when unsure and doesn't flag experienced candidates as freshers", () => {
    const experienced = `Vikram Singh
vikram@example.com

Work Experience
Engineer | Tata Consultancy Services | 2019 – Present
- Worked closely with the project manager in Chennai.`;
    expect(jobSearchDefaults(experienced)).toEqual({ role: "", location: "", isFresher: false });
  });
});
