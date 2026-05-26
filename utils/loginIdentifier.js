const LOGIN_IDENTIFIER_KEYS = [
  "login",
  "identifier",
  "username",
  "UserName",
  "email",
  "Email",
  "mobile",
  "Mobile",
  "phone",
  "Phone",
];

const resolveLoginIdentifier = (body = {}) => {
  for (const key of LOGIN_IDENTIFIER_KEYS) {
    const value = body[key];
    if (value != null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
};

const getPhoneDigits = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 8 ? digits : null;
};

module.exports = {
  LOGIN_IDENTIFIER_KEYS,
  resolveLoginIdentifier,
  getPhoneDigits,
};
