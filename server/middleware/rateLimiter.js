// Simple in-memory sliding window rate limiter factory. Limits are per signed-in
// user when req.user is set (by the auth gate), otherwise per IP.
export function rateLimitKey(req) {
  if (req.user && req.user.id) return `user:${req.user.id}`;
  return `ip:${req.ip || req.headers["x-forwarded-for"] || "127.0.0.1"}`;
}

export function createRateLimiter({ windowMs, max, message }) {
  const hits = new Map();

  return (req, res, next) => {
    const key = rateLimitKey(req);
    const now = Date.now();
    const record = hits.get(key) || { count: 0, resetTime: now + windowMs };

    if (now > record.resetTime) {
      record.count = 1;
      record.resetTime = now + windowMs;
    } else {
      record.count++;
    }

    hits.set(key, record);

    if (record.count > max) {
      return res.status(429).json({
        error: message || "Too many requests. Please try again shortly."
      });
    }

    next();
  };
}
