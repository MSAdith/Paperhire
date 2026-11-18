import { Document, Packer, Paragraph } from "docx";
import PDFDocument from "pdfkit";

function splitParagraphs(letter) {
  return String(letter || "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function countWords(text) {
  const trimmed = String(text || "").trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export async function buildCoverLetterDocx(letter) {
  const children = splitParagraphs(letter).map(
    (p) => new Paragraph({ text: p, spacing: { after: 200 } })
  );
  const doc = new Document({ sections: [{ properties: {}, children }] });
  return Packer.toBuffer(doc);
}

export function buildCoverLetterPdf(letter) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 60 });
    const buffers = [];
    doc.on("data", (chunk) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    doc.fontSize(11).font("Helvetica");
    for (const paragraph of splitParagraphs(letter)) {
      doc.text(paragraph, { align: "left", lineGap: 2 });
      doc.moveDown(0.8);
    }
    doc.end();
  });
}
