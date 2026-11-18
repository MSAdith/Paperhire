const MAX_RESUME_LENGTH = 20000;
const MAX_JD_LENGTH = 8000;
const MAX_SHORT_FIELD_LENGTH = 200;

export function validateTextFields(fields) {
  const errors = [];

  const resumeText = fields.resumeText;
  if (typeof resumeText !== "string" || resumeText.trim().length === 0) {
    errors.push("resumeText is required.");
  } else if (resumeText.length > MAX_RESUME_LENGTH) {
    errors.push(`resumeText exceeds maximum length of ${MAX_RESUME_LENGTH} characters.`);
  }

  if ("jdText" in fields && fields.jdText) {
    if (typeof fields.jdText !== "string") {
      errors.push("jdText must be a string.");
    } else if (fields.jdText.length > MAX_JD_LENGTH) {
      errors.push(`jdText exceeds maximum length of ${MAX_JD_LENGTH} characters.`);
    }
  }

  for (const key of ["role", "location", "companyName", "roleTitle", "tone", "recipientName", "recipientRole", "messageType"]) {
    if (key in fields && fields[key]) {
      if (typeof fields[key] !== "string") {
        errors.push(`${key} must be a string.`);
      } else if (fields[key].length > MAX_SHORT_FIELD_LENGTH) {
        errors.push(`${key} exceeds maximum length of ${MAX_SHORT_FIELD_LENGTH} characters.`);
      }
    }
  }

  return errors;
}

export function validateBody(req, res, next) {
  const errors = validateTextFields(req.body || {});
  if (errors.length > 0) {
    return res.status(400).json({ error: errors[0], details: errors });
  }
  next();
}

export { MAX_RESUME_LENGTH, MAX_JD_LENGTH, MAX_SHORT_FIELD_LENGTH };
