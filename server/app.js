import express from "express";
import multer from "multer";
import cors from "cors";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.js";
import PDFParser from "pdf2json";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import mammoth from "mammoth";
import { analyzeResume } from "./scoring/index.js";
import jobsRouter from "./routes/jobs.js";
import tailorRouter from "./routes/tailor.js";
import coverLetterRouter from "./routes/coverLetter.js";
import interviewPrepRouter from "./routes/interviewPrep.js";
import skillGapRouter from "./routes/skillGap.js";
import platformRouter from "./routes/platform.js";
import { apiAuthGate } from "./middleware/auth.js";
import { createRateLimiter } from "./middleware/rateLimiter.js";
import { featureTracking } from "./middleware/featureTracking.js";
import { eventContextFrom } from "./lib/events.js";
import reachOutRouter from "./routes/reachOut.js";
import trackerRouter from "./routes/tracker.js";
import feedbackRouter from "./routes/feedback.js";

// The Express app, without listening. server/index.js loads .env and listens
// locally; api/*.js wraps it as Vercel functions; tests import it directly.
const app = express();

// One proxy hop (Vercel's edge) so req.ip is the real client IP for per-IP limits.
app.set("trust proxy", 1);
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Every /api route requires a verified Supabase session except a short public
// allowlist (see apiAuthGate). This runs before any router, so new endpoints
// are protected by default.
app.use(apiAuthGate);
app.use(featureTracking);

app.use("/api", platformRouter);
app.use("/api", jobsRouter);
app.use("/api", tailorRouter);
app.use("/api", coverLetterRouter);
app.use("/api", interviewPrepRouter);
app.use("/api", skillGapRouter);
app.use("/api", reachOutRouter);
app.use("/api", trackerRouter);
app.use("/api", feedbackRouter);

// 20 analyses per minute per user (per IP if somehow unauthenticated).
const rateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 20,
  message: "Too many requests. Rate limit exceeded (20 requests per minute). Please try again shortly."
});

// Memory storage for file uploads (max 5MB limit)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5 MB limit
});

// Multi-engine PDF parser
async function parsePdf(buffer) {
  // 1. Primary: Mozilla pdfjs-dist
  try {
    const uint8Data = new Uint8Array(buffer);
    const loadingTask = getDocument({ data: uint8Data, useSystemFonts: true });
    const pdfDocument = await loadingTask.promise;

    let fullText = "";
    for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum);
      const content = await page.getTextContent();

      // Reconstruct visual line breaks using each item's Y position, since
      // pdf.js returns a flat list of text fragments with no inherent newlines.
      let lastY = null;
      let pageText = "";
      for (const item of content.items) {
        const y = item.transform[5];
        if (lastY !== null && Math.abs(y - lastY) > 2) {
          pageText += "\n";
        } else if (pageText.length > 0) {
          pageText += " ";
        }
        pageText += item.str;
        lastY = y;
      }
      fullText += pageText + "\n";
    }

    if (fullText && fullText.trim().length > 20) {
      return fullText;
    }
  } catch (pdfjsErr) {
    console.warn("pdfjs-dist engine note:", pdfjsErr.message);
  }

  // 2. Secondary: pdf-parse (direct library import avoiding index.js readFileSync crash)
  try {
    const parseFn = typeof pdfParse === "function" ? pdfParse : pdfParse.default;
    const pdfData = await parseFn(buffer);
    if (pdfData && pdfData.text && pdfData.text.trim().length > 20) {
      return pdfData.text;
    }
  } catch (pdfParseErr) {
    console.warn("pdf-parse engine note:", pdfParseErr.message);
  }

  // 3. Tertiary: pdf2json fallback
  try {
    const text = await new Promise((resolve, reject) => {
      const parser = new PDFParser(null, 1);
      parser.on("pdfParser_dataError", err => reject(new Error(err.parserError)));
      parser.on("pdfParser_dataReady", () => {
        const raw = parser.getRawTextContent();
        try {
          resolve(decodeURIComponent(raw));
        } catch (e) {
          resolve(raw);
        }
      });
      parser.parseBuffer(buffer);
    });

    if (text && text.trim().length > 20) {
      return text;
    }
  } catch (pdf2jsonErr) {
    console.warn("pdf2json engine note:", pdf2jsonErr.message);
  }

  return "";
}

// GET /api/health
app.get(["/api/health", "/health"], (req, res) => {
  res.json({ ok: true, status: "ok", service: "Paperhire Backend" });
});

// POST /api/analyze
app.post(["/api/analyze", "/analyze"], rateLimiter, upload.single("resume"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Please upload a resume file (PDF or DOCX)." });
    }

    const { buffer, originalname, mimetype } = req.file;
    const jdText = req.body.jd || "";

    let extractedText = "";
    const filenameLower = originalname.toLowerCase();

    if (mimetype === "application/pdf" || filenameLower.endsWith(".pdf")) {
      try {
        extractedText = await parsePdf(buffer);
      } catch (pdfErr) {
        console.error("PDF parse error:", pdfErr);
        res.locals.errorType = "pdf_parse_failed";
        return res.status(422).json({
          error: "Failed to parse PDF document. Ensure the file is not password-protected or corrupted."
        });
      }
    } else if (
      mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      filenameLower.endsWith(".docx")
    ) {
      try {
        const docxResult = await mammoth.extractRawText({ buffer });
        extractedText = docxResult.value || "";
      } catch (docxErr) {
        console.error("DOCX parse error:", docxErr);
        res.locals.errorType = "docx_parse_failed";
        return res.status(422).json({
          error: "Failed to parse DOCX document. Ensure the file is a valid Word document."
        });
      }
    } else {
      return res.status(400).json({
        error: "Unsupported file format. Please upload a .pdf or .docx file (max 5 MB)."
      });
    }

    if (!extractedText || extractedText.trim().length === 0) {
      res.locals.errorType = "no_text_extracted";
      return res.status(422).json({
        error: "Could not extract readable text from document. If this is a scanned PDF, please re-save as a text-selectable PDF."
      });
    }

    // Run scoring engine
    const analysis = await analyzeResume(extractedText, jdText, { analytics: { context: eventContextFrom(req) } });

    return res.json({
      filename: originalname,
      filesize: req.file.size,
      resumeText: extractedText,
      ...analysis
    });

  } catch (err) {
    console.error("Error during analysis route:", err);
    res.locals.errorType = err.name || "Error";
    return res.status(500).json({
      error: err.message || "An unexpected error occurred during resume analysis. Please try again."
    });
  }
});

// Global multer & application error handler
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "File size exceeds the 5 MB limit. Please upload a smaller resume." });
    }
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  if (err) {
    // featureTracking records the error event after the response; only the
    // error's type is passed along, since the message can contain request content.
    res.locals.errorType = err.name || "Error";
    return res.status(err.status || 500).json({ error: err.message || "An unexpected server error occurred." });
  }
  next();
});

export default app;
