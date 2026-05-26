const SENSITIVE_USER_FIELDS = new Set([
  "Password",
  "password",
  "Answer",
  "answer",
]);

const sanitizeUserForResponse = (user) => {
  if (!user || typeof user !== "object") return user;

  return Object.fromEntries(
    Object.entries(user).filter(([key]) => !SENSITIVE_USER_FIELDS.has(key))
  );
};

module.exports = {
  sanitizeUserForResponse,
};
