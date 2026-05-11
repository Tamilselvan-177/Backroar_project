export function csrfOk(req) {
  const header = req.headers["x-csrf-token"];
  const token = Array.isArray(header) ? header[0] : header;
  if (!token || !req.sessionData?.csrfToken) return false;
  return token === req.sessionData.csrfToken;
}
