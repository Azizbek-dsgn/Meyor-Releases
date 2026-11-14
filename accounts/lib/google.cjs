// Checks a Google ID token (RS256) against Google's published keys: proves which Google account a
// record comes from, so nobody can claim someone else's account or username.
const crypto = require('node:crypto');

const ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
const CERTS = 'https://www.googleapis.com/oauth2/v3/certs';

async function googleKeys(fetchJson) {
  const data = await fetchJson(CERTS);
  return Object.fromEntries((data.keys || []).filter(k => k.kty === 'RSA' && k.kid).map(k => [k.kid, crypto.createPublicKey({ key: k, format: 'jwk' })]));
}

// Returns the claims, or throws. `maxAgeDays`: an older token no longer proves a new device.
function verifyIdToken(token, { keys, audience, now = Date.now(), maxAgeDays = 7 }) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('id_token format');
  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  if (header.alg !== 'RS256' || !keys[header.kid]) throw new Error('id_token key');
  const ok = crypto.verify('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]), keys[header.kid], Buffer.from(parts[2], 'base64url'));
  if (!ok) throw new Error('id_token signature');
  if (!ISSUERS.has(claims.iss)) throw new Error('id_token issuer');
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(audience)) throw new Error('id_token audience');
  if (!claims.sub || !claims.email || claims.email_verified === false) throw new Error('id_token email');
  if (!Number.isFinite(claims.iat) || claims.iat * 1000 > now + 5 * 60e3 || now - claims.iat * 1000 > maxAgeDays * 864e5) throw new Error('id_token age');
  return claims;
}

module.exports = { googleKeys, verifyIdToken, CERTS };
