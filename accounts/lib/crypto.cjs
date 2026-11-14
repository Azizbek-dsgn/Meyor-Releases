// Meyor cloud crypto — no server: records are sealed to the admin's key and stored on GitHub; what the
// admin publishes is signed. The same file runs in Hustler and in the Meyor-Control GitHub Action.
//   seal / open      X25519 (ephemeral) → HKDF-SHA256 → AES-256-GCM. Only the admin key opens it.
//   sign / verify    Ed25519 over canonical JSON (sorted keys), so the same data always signs the same.
// Keys are exchanged as base64url raw 32-byte values (public) or PKCS#8 base64 (private).
const crypto = require('node:crypto');

const b64u = buf => Buffer.from(buf).toString('base64url');
const unb64u = text => Buffer.from(String(text), 'base64url');

function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).filter(k => value[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
}

function rawPublic(keyObject) { return unb64u(keyObject.export({ format: 'jwk' }).x); }
function publicFromRaw(raw, crv) {
  return crypto.createPublicKey({ key: { kty: 'OKP', crv, x: b64u(raw) }, format: 'jwk' });
}
function privateFrom(pkcs8b64) { return crypto.createPrivateKey({ key: Buffer.from(String(pkcs8b64).trim(), 'base64'), format: 'der', type: 'pkcs8' }); }

// One keypair of each kind. `private` values go only to the admin's backup file and the Action secrets.
function generateKeys(kind) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync(kind === 'sign' ? 'ed25519' : 'x25519');
  return { public: b64u(rawPublic(publicKey)), private: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64') };
}

const SEAL_INFO = Buffer.from('meyor-seal-v1');
function sealKey(shared, ephemeral, recipient) {
  return Buffer.from(crypto.hkdfSync('sha256', shared, Buffer.concat([ephemeral, recipient]), SEAL_INFO, 32));
}
// Text out: "m1." + base64url(ephemeral 32 | nonce 12 | tag 16 | ciphertext).
function seal(recipientPublic, data) {
  const recipient = unb64u(recipientPublic);
  if (recipient.length !== 32) throw new Error('Admin kaliti noto‘g‘ri.');
  const eph = crypto.generateKeyPairSync('x25519'), ephRaw = rawPublic(eph.publicKey);
  const shared = crypto.diffieHellman({ privateKey: eph.privateKey, publicKey: publicFromRaw(recipient, 'X25519') });
  const nonce = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', sealKey(shared, ephRaw, recipient), nonce);
  const body = Buffer.concat([cipher.update(Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8')), cipher.final()]);
  return 'm1.' + b64u(Buffer.concat([ephRaw, nonce, cipher.getAuthTag(), body]));
}
function open(recipientPrivatePkcs8, text) {
  if (!/^m1\.[A-Za-z0-9_-]+$/.test(String(text))) throw new Error('Shifrlangan yozuv formati noto‘g‘ri.');
  const blob = unb64u(String(text).slice(3));
  if (blob.length < 60) throw new Error('Shifrlangan yozuv juda qisqa.');
  const priv = privateFrom(recipientPrivatePkcs8), recipient = rawPublic(crypto.createPublicKey(priv));
  const ephRaw = blob.subarray(0, 32), nonce = blob.subarray(32, 44), tag = blob.subarray(44, 60), body = blob.subarray(60);
  const shared = crypto.diffieHellman({ privateKey: priv, publicKey: publicFromRaw(ephRaw, 'X25519') });
  const decipher = crypto.createDecipheriv('aes-256-gcm', sealKey(shared, ephRaw, recipient), nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]);
}

function sign(privatePkcs8, value) { return b64u(crypto.sign(null, Buffer.from(canonical(value)), privateFrom(privatePkcs8))); }
function verify(publicRaw, value, signature) {
  try {
    const raw = unb64u(publicRaw);
    return raw.length === 32 && crypto.verify(null, Buffer.from(canonical(value)), publicFromRaw(raw, 'Ed25519'), unb64u(signature));
  } catch { return false; }
}
// A device key is an Ed25519 pair kept on the computer; the public half is pinned to the account.
function publicOf(privatePkcs8) { return b64u(rawPublic(crypto.createPublicKey(privateFrom(privatePkcs8)))); }

// Pseudonymous account id: never the email. Public on purpose (the username registry uses it).
function accountHash(googleSub) { return crypto.createHash('sha256').update('meyor-account-v1:' + String(googleSub)).digest('hex').slice(0, 40); }
function emailHash(email) { return crypto.createHash('sha256').update('meyor-email-v1:' + String(email).trim().toLowerCase()).digest('hex'); }

module.exports = { canonical, generateKeys, seal, open, sign, verify, publicOf, accountHash, emailHash, b64u, unb64u };
