const JWT_SECRET = process.env.JWT_SECRET || (
  process.env.NODE_ENV === "production"
    ? (() => { throw new Error("JWT_SECRET required in production"); })()
    : "dev-secret-" + Math.random().toString(36).slice(2)
);

export { JWT_SECRET };
