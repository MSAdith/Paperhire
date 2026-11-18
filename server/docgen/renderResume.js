import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import PDFDocument from "pdfkit";
import { splitHeaderAndSummary } from "../scoring/resumeProfile.js";

// Cheap deterministic guardrail: strips any skill the AI listed that does not
// literally appear anywhere in the original resume text, moving it to
// gapsNotAdded instead. This does not catch invented employers/dates/metrics
// (that needs the prompt-level no-fabrication rule) but it's a free, reliable
// backstop against hallucinated skills specifically.
export function stripHallucinatedSkills(tailored, resumeText) {
  const resumeLower = (resumeText || "").toLowerCase();
  const gaps = new Set(tailored.gapsNotAdded || []);
  const cleanedSkills = {};

  for (const [category, skills] of Object.entries(tailored.skills || {})) {
    const kept = [];
    for (const skill of skills) {
      if (resumeLower.includes(String(skill).toLowerCase())) {
        kept.push(skill);
      } else {
        gaps.add(skill);
      }
    }
    if (kept.length > 0) cleanedSkills[category] = kept;
  }

  return { ...tailored, skills: cleanedSkills, gapsNotAdded: Array.from(gaps) };
}

// The name/contact block from the original resume (lines before the first
// section heading). It's copied verbatim into the tailored resume by code, not
// by the AI, so contact details can never be lost or altered.
export function extractContactLines(resumeText) {
  return splitHeaderAndSummary(resumeText)
    .header.split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

const SUMMARY_OR_SKILLS_HEADING = /^(professional\s+|career\s+)?(summary|profile|objective)$|skills/i;

// Converts the older flat { heading, items } shape to { heading, entries }, and
// drops summary/skills sections the AI put in "sections" (they have their own fields).
export function normalizeTailoredSections(tailored) {
  const sections = (tailored.sections || [])
    .filter((s) => !SUMMARY_OR_SKILLS_HEADING.test(s.heading.trim()))
    .map((s) =>
      Array.isArray(s.entries)
        ? { heading: s.heading, entries: s.entries.map((e) => ({ header: e.header || "", bullets: [...e.bullets] })) }
        : { heading: s.heading, entries: [{ header: "", bullets: [...(s.items || [])] }] }
    );
  return { ...tailored, sections };
}

const DATE_LIKE = /\b(19|20)\d{2}\b|\bpresent\b/i;

// Removes a repeated entry header from the start of a bullet, e.g.
// "Senior Software Engineer | Apex Technologies (Jan 2021 – Present): Architected ..."
// -> "Architected ...". A "Label: text" prefix is only stripped when it looks
// like a header (has "|" or a date, or contains the entry's title), so
// "ResumeLens: Built ..." in a projects section is left alone.
export function stripRepeatedHeader(bullet, header = "") {
  let text = String(bullet).trim().replace(/^[-•*–]\s+/, "");
  const headerNorm = header.replace(/\s+/g, " ").trim().toLowerCase();
  const title = headerNorm.split("|")[0].trim();

  if (headerNorm && text.toLowerCase().startsWith(headerNorm)) {
    text = text.slice(headerNorm.length).replace(/^[\s:|,–—-]+/, "");
  }

  const m = text.match(/^([^:]{3,160}):\s+(.+)$/s);
  if (m) {
    const prefix = m[1].toLowerCase();
    if (prefix.includes("|") || DATE_LIKE.test(prefix) || (title.length >= 3 && prefix.includes(title))) {
      text = m[2].trim();
    }
  }

  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function stripRepeatedHeaders(tailored) {
  return {
    ...tailored,
    sections: tailored.sections.map((s) => ({
      ...s,
      entries: s.entries.map((e) => ({ ...e, bullets: e.bullets.map((b) => stripRepeatedHeader(b, e.header)).filter(Boolean) }))
    }))
  };
}

const sectionEntries = (section) =>
  Array.isArray(section.entries) ? section.entries : [{ header: "", bullets: section.items || [] }];

export function renderTailoredToPlainText(tailored) {
  const parts = [...(tailored.contactLines || [])];

  if (tailored.summary) {
    parts.push("Professional Summary", tailored.summary);
  }

  for (const section of tailored.sections || []) {
    parts.push(section.heading);
    for (const entry of sectionEntries(section)) {
      if (entry.header) parts.push(entry.header);
      for (const bullet of entry.bullets || []) {
        parts.push(`- ${bullet}`);
      }
    }
  }

  if (tailored.skills && Object.keys(tailored.skills).length > 0) {
    parts.push("Skills");
    for (const [category, skills] of Object.entries(tailored.skills)) {
      parts.push(`${category}: ${skills.join(", ")}`);
    }
  }

  return parts.join("\n");
}

// Contact lines minus the line that is just the candidate's name.
const contactDetails = (tailored, candidateName) =>
  (tailored.contactLines || []).filter((l) => l.trim().toLowerCase() !== String(candidateName).trim().toLowerCase());

export async function buildTailoredResumeDocx(tailored, candidateName = "Candidate") {
  const children = [new Paragraph({ text: candidateName, heading: HeadingLevel.HEADING_1 })];

  for (const line of contactDetails(tailored, candidateName)) {
    children.push(new Paragraph({ text: line }));
  }

  children.push(
    new Paragraph({ text: "Professional Summary", heading: HeadingLevel.HEADING_2 }),
    new Paragraph({ text: tailored.summary || "" })
  );

  for (const section of tailored.sections || []) {
    children.push(new Paragraph({ text: section.heading, heading: HeadingLevel.HEADING_2 }));
    for (const entry of sectionEntries(section)) {
      if (entry.header) children.push(new Paragraph({ children: [new TextRun({ text: entry.header, bold: true })] }));
      for (const bullet of entry.bullets || []) {
        children.push(new Paragraph({ text: `• ${bullet}` }));
      }
    }
  }

  if (tailored.skills && Object.keys(tailored.skills).length > 0) {
    children.push(new Paragraph({ text: "Skills", heading: HeadingLevel.HEADING_2 }));
    for (const [category, skills] of Object.entries(tailored.skills)) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${category}: `, bold: true }),
            new TextRun(skills.join(", "))
          ]
        })
      );
    }
  }

  const doc = new Document({ sections: [{ properties: {}, children }] });
  return Packer.toBuffer(doc);
}

export function buildTailoredResumePdf(tailored, candidateName = "Candidate") {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const buffers = [];
    doc.on("data", (chunk) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    doc.fontSize(20).font("Helvetica-Bold").text(candidateName);
    doc.fontSize(10).font("Helvetica");
    for (const line of contactDetails(tailored, candidateName)) {
      doc.text(line);
    }
    doc.moveDown(0.5);

    doc.fontSize(14).font("Helvetica-Bold").text("Professional Summary");
    doc.fontSize(11).font("Helvetica").text(tailored.summary || "");
    doc.moveDown(0.5);

    for (const section of tailored.sections || []) {
      doc.fontSize(14).font("Helvetica-Bold").text(section.heading);
      for (const entry of sectionEntries(section)) {
        if (entry.header) doc.fontSize(11).font("Helvetica-Bold").text(entry.header);
        doc.fontSize(11).font("Helvetica");
        for (const bullet of entry.bullets || []) {
          doc.text(`• ${bullet}`);
        }
      }
      doc.moveDown(0.5);
    }

    if (tailored.skills && Object.keys(tailored.skills).length > 0) {
      doc.fontSize(14).font("Helvetica-Bold").text("Skills");
      doc.fontSize(11).font("Helvetica");
      for (const [category, skills] of Object.entries(tailored.skills)) {
        doc.text(`${category}: ${skills.join(", ")}`);
      }
    }

    doc.end();
  });
}
