// Shared rules for usernames, skills and donation links (Hustler checks the same before sending).
const USERNAME = /^[a-z0-9](?:[a-z0-9-]{1,18}[a-z0-9])$/;
const RESERVED = new Set(['admin', 'administrator', 'meyor', 'meyorvision', 'hustler', 'swible', 'voxly', 'tempass', 'tempo',
  'support', 'help', 'official', 'moderator', 'root', 'system', 'abdulaziz-kbv', 'telegram', 'google', 'null', 'undefined']);
const RENAME_DAYS = 30;
const SKILL_ID = /^[a-z0-9][a-z0-9-]{1,40}$/;
const SKILL_MAX_BYTES = 1024 * 1024;  // compressed zip; skills are mostly text
// Donation links: https only, known donation platforms only (no look-alike or phishing domains).
const DONATE_HOSTS = ['taps.uz', 'tirikchilik.uz', 'payme.uz', 'click.uz', 't.me', 'buymeacoffee.com', 'ko-fi.com', 'patreon.com', 'boosty.to', 'paypal.me'];

function username(value) {
  const name = String(value || '').trim().toLowerCase();
  if (!USERNAME.test(name) || name.includes('--')) return { ok: false, reason: 'Username 3–20 belgi: kichik lotin harflari, raqam va “-”.' };
  if (RESERVED.has(name)) return { ok: false, reason: 'Bu username band qilingan.' };
  return { ok: true, name };
}
function donateLink(value) {
  if (value === undefined || value === null || value === '') return { ok: true, url: null };
  let url;
  try { url = new URL(String(value).trim()); } catch { return { ok: false, reason: 'Donat havolasi noto‘g‘ri.' }; }
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return { ok: false, reason: 'Donat havolasi https:// bilan boshlansin.' };
  if (!DONATE_HOSTS.includes(host)) return { ok: false, reason: 'Faqat ma’lum donat saytlari: ' + DONATE_HOSTS.join(', ') + '.' };
  if (host === 't.me' && !/^\/tribute(\/|$)/i.test(url.pathname)) return { ok: false, reason: 'Telegram’da faqat Tribute donat havolasi (t.me/tribute/…).' };
  if (url.href.length > 300) return { ok: false, reason: 'Donat havolasi juda uzun.' };
  return { ok: true, url: url.href, host };
}
function skillMeta(meta) {
  const id = String(meta?.id || '');
  if (!SKILL_ID.test(id)) return { ok: false, reason: 'Skill id noto‘g‘ri.' };
  const name = String(meta?.name || '').trim();
  if (name.length < 2 || name.length > 80) return { ok: false, reason: 'Skill nomi 2–80 belgi.' };
  if (!/^\d+\.\d+\.\d+$/.test(String(meta?.version || ''))) return { ok: false, reason: 'Versiya 1.0.0 ko‘rinishida.' };
  const donate = donateLink(meta?.donate);
  if (!donate.ok) return donate;
  return { ok: true, value: { id, name, version: meta.version, description: String(meta.description || '').slice(0, 400),
    tags: (Array.isArray(meta.tags) ? meta.tags : []).slice(0, 8).map(t => String(t).slice(0, 30)), donate: donate.url } };
}

module.exports = { USERNAME, RESERVED, RENAME_DAYS, SKILL_ID, SKILL_MAX_BYTES, DONATE_HOSTS, username, donateLink, skillMeta };
