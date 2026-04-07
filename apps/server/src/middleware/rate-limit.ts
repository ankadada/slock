import rateLimit from "express-rate-limit";

/**
 * Rate limiter for auth endpoints (login, register).
 * 5 attempts per IP per 15-minute window.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts, please try again later" },
});

/**
 * Lighter rate limiter for general API endpoints.
 * 100 requests per IP per minute.
 */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});
