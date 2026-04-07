// IMPORTANT: Set a strong, unique JWT_SECRET in production.
// The .env default "dev-secret-change-in-production" is NOT safe for production use.
const JWT_SECRET = process.env.JWT_SECRET || (
  process.env.NODE_ENV === "production"
    ? (() => { throw new Error("JWT_SECRET required in production"); })()
    : "dev-secret-" + Math.random().toString(36).slice(2)
);

if (
  process.env.NODE_ENV !== "production" &&
  process.env.JWT_SECRET === "dev-secret-change-in-production"
) {
  console.warn(
    "[security] JWT_SECRET is set to the default weak value. " +
    "Change it before deploying to production."
  );
}

export { JWT_SECRET };
