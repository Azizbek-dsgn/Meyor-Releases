// The processor's logic, with no I/O: inbox records + admin commands in, new state + signed control +
// encrypted stats + skills to publish out. index.cjs does the GitHub reading and writing around it.
//
// Record (sealed to the admin box key, in a Meyor-Inbox issue body or comment):
//   { v:1, type:'account'|'delete'|'skill'|'report', account, device, devicePub, idToken?, at, sig, ... }
//   sig = device Ed25519 over the record without `sig`. A device is pinned to its account the first time a
//   valid Google id_token proves the account; afterwards only that device key is accepted for it.
// Admin command (sealed, and signed with the admin signing key): { v:1, type, seq, at, ..., adminSig }.
const crypto = require('node:crypto');
const c = require('./crypto.cjs');
const rules = require('./rules.cjs');
const { verifyIdToken } = require('./google.cjs');
const { checkSkillZip } = require('./zip.cjs');

const DAY = 864e5;
const PRODUCTS = new Set(['meyor', 'uzscribe', 'uzscribe-desktop', 'uzdictate', 'tempo']);
const VERSION = /^\d+\.\d+\.\d+$/;

function emptyState() { return { v: 1, seq: 0, adminSeq: 0, accounts: {}, usernames: {}, skills: {}, reports: [], support: [], updates: [], seen: {} }; }

function sanitizeApps(apps) {
  const out = {};
  for (const [k, v] of Object.entries(apps && typeof apps === 'object' ? apps : {})) if (/^[a-z-]{2,20}$/.test(k) && VERSION.test(String(v))) out[k] = String(v);
  return out;
}
const text = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

// One opened record → state change. Returns a short note (for the run log) — never the email.
function applyRecord(state, record, { keys, audience, now }) {
  if (!record || record.v !== 1 || !/^[a-f0-9]{40}$/.test(String(record.account)) || !/^[A-Za-z0-9_-]{8,64}$/.test(String(record.device))) return 'invalid';
  const { sig, ...body } = record;
  if (!c.verify(record.devicePub, body, sig)) return 'bad-signature';
  const at = Math.min(Number(record.at) || now, now);
  let acct = state.accounts[record.account];
  const pinned = acct?.devices?.[record.device]?.pub;
  if (pinned && pinned !== record.devicePub) return 'device-key-mismatch';
  if (!pinned) {
    // A new device needs Google's proof that it belongs to this account.
    let claims;
    try { claims = verifyIdToken(record.idToken, { keys, audience, now }); } catch (e) { return 'google:' + e.message; }
    if (c.accountHash(claims.sub) !== record.account) return 'account-mismatch';
    acct = state.accounts[record.account] ||= { created: at, devices: {}, username: null, usernameAt: 0, blocked: null };
    acct.email = text(claims.email, 200); acct.name = text(claims.name || claims.email, 120); acct.avatar = text(claims.picture, 500) || null;
    acct.devices[record.device] = { pub: record.devicePub, first: at };
  }
  if (record.type === 'delete') {
    if (acct.username && state.usernames[acct.username] === record.account) delete state.usernames[acct.username];
    delete state.accounts[record.account];
    for (const [key, s] of Object.entries(state.skills)) if (s.account === record.account) delete state.skills[key];
    return 'deleted';
  }
  const device = acct.devices[record.device];
  device.seen = Math.max(device.seen || 0, at); device.os = text(record.os, 40); device.apps = sanitizeApps(record.apps);
  acct.seen = Math.max(acct.seen || 0, at);
  if (record.type === 'account' && record.username !== undefined && record.username !== acct.username) {
    const check = rules.username(record.username);
    const owner = check.ok ? state.usernames[check.name] : null;
    if (!check.ok) acct.usernameError = check.reason;
    else if (owner && owner !== record.account) acct.usernameError = 'Bu username band.';
    else if (acct.username && now - acct.usernameAt < rules.RENAME_DAYS * DAY) acct.usernameError = `Username’ni ${rules.RENAME_DAYS} kunda bir marta o‘zgartirish mumkin.`;
    else {
      if (acct.username) delete state.usernames[acct.username];
      state.usernames[check.name] = record.account; acct.username = check.name; acct.usernameAt = now; delete acct.usernameError;
    }
  }
  if (record.type === 'skill') {
    if (acct.blocked) return 'blocked';
    if (!acct.username) return 'skill-needs-username';
    const meta = rules.skillMeta(record.skill);
    if (!meta.ok) { acct.lastSkillError = meta.reason; return 'skill-invalid'; }
    const zip = Buffer.from(String(record.zip || ''), 'base64');
    if (!zip.length || zip.length > rules.SKILL_MAX_BYTES) { acct.lastSkillError = 'Skill 1 MB dan oshmasin.'; return 'skill-size'; }
    try { checkSkillZip(zip); } catch (e) { acct.lastSkillError = e.message; return 'skill-files'; }
    const key = `${acct.username}/${meta.value.id}`;
    state.skills[key] = { ...meta.value, account: record.account, author: acct.username, status: 'pending', submitted: at,
      sha256: crypto.createHash('sha256').update(zip).digest('hex'), bytes: zip.length, zip: zip.toString('base64'),
      published: state.skills[key]?.published || null };
    return 'skill-pending';
  }
  if (record.type === 'support') {
    state.support ||= [];
    if (state.support.length < 1000) state.support.push({ account: record.account, kind: text(record.kind, 20), text: String(record.text ?? '').replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ').trim().slice(0, 2000), at });
    return 'support';
  }
  if (record.type === 'report') {
    if (state.reports.length < 500) state.reports.push({ account: record.account, skill: text(record.skill, 80), reason: text(record.reason, 300), at });
    return 'report';
  }
  return 'ok';
}

// Admin commands, verified with the admin signing key and applied once each (by seq).
function applyAdmin(state, cmd, { adminSignPublic, now }) {
  const { adminSig, ...body } = cmd || {};
  if (!c.verify(adminSignPublic, body, adminSig)) return 'bad-admin-signature';
  if (!Number.isInteger(body.seq) || body.seq <= state.adminSeq) return 'old-admin-command';
  state.adminSeq = body.seq;
  const acct = state.accounts[body.account];
  switch (body.type) {
    case 'block': if (!acct) return 'no-account'; acct.blocked = { reason: text(body.reason, 200) || 'Qoidalar buzilgan', at: now }; return 'blocked';
    case 'unblock': if (!acct) return 'no-account'; acct.blocked = null; return 'unblocked';
    case 'update': {
      if (!PRODUCTS.has(body.product) || !VERSION.test(String(body.min))) return 'bad-update';
      const targets = body.targets === 'all' ? 'all' : (Array.isArray(body.targets) ? body.targets.filter(t => /^[a-f0-9]{40}$/.test(t)).slice(0, 1000) : []);
      state.updates = state.updates.filter(u => u.product !== body.product || u.targets !== 'all' || targets !== 'all');
      state.updates.push({ id: 'u' + body.seq, product: body.product, min: body.min, targets, message: text(body.message, 300), at: now });
      state.updates = state.updates.slice(-50);
      return 'update';
    }
    case 'cancel-update': state.updates = state.updates.filter(u => u.id !== body.id); return 'update-cancelled';
    case 'approve': case 'reject': case 'unpublish': case 'remove-donate': {
      const skill = state.skills[body.skill];
      if (!skill) return 'no-skill';
      if (body.type === 'approve') { skill.status = 'approved'; skill.reason = null; }
      else if (body.type === 'reject') { skill.status = 'rejected'; skill.reason = text(body.reason, 300); }
      else if (body.type === 'unpublish') { skill.status = 'unpublished'; skill.reason = text(body.reason, 300); }
      else skill.donate = null;
      return body.type;
    }
    case 'clear-reports': state.reports = []; return 'reports-cleared';
    case 'clear-support': state.support = (state.support || []).filter(m => m.at > Number(body.before || 0)); return 'support-cleared';
    default: return 'unknown-admin-command';
  }
}

// What everyone may see, signed: blocks (by account hash), forced updates, usernames, skill statuses.
function control(state, { adminSignPrivate, now }) {
  const body = { v: 1, seq: state.seq + 1, issuedAt: new Date(now).toISOString(), telegram: '@Abdulaziz_kbv',
    blocked: Object.entries(state.accounts).filter(([, a]) => a.blocked).map(([account, a]) => ({ account, reason: a.blocked.reason })),
    updates: state.updates.map(({ id, product, min, targets, message }) => ({ id, product, min, targets, message })),
    usernames: { ...state.usernames },
    usernameErrors: Object.fromEntries(Object.entries(state.accounts).filter(([, a]) => a.usernameError).map(([k, a]) => [k, a.usernameError])),
    skills: Object.fromEntries(Object.entries(state.skills).map(([k, s]) => [k, { account: s.account, status: s.status, version: s.version, reason: s.reason || null }])) };
  state.seq = body.seq;
  return { ...body, sig: c.sign(adminSignPrivate, body) };
}

// For the admin panel only (sealed to the admin key): counts and the account list.
function stats(state, now) {
  const active = days => Object.values(state.accounts).filter(a => now - (a.seen || 0) < days * DAY).length;
  const versions = {};
  for (const a of Object.values(state.accounts)) for (const d of Object.values(a.devices)) for (const [app, v] of Object.entries(d.apps || {})) {
    versions[app] ||= {}; versions[app][v] = (versions[app][v] || 0) + 1;
  }
  return { generatedAt: new Date(now).toISOString(), total: Object.keys(state.accounts).length, active1: active(1), active7: active(7), active30: active(30),
    blocked: Object.values(state.accounts).filter(a => a.blocked).length, versions,
    accounts: Object.entries(state.accounts).map(([account, a]) => ({ account, email: a.email, name: a.name, avatar: a.avatar, username: a.username,
      created: a.created, seen: a.seen, blocked: a.blocked,
      devices: Object.entries(a.devices).map(([id, d]) => ({ id, os: d.os, apps: d.apps, seen: d.seen })) })),
    skills: Object.entries(state.skills).map(([key, s]) => ({ key, name: s.name, author: s.author, version: s.version, status: s.status, reason: s.reason || null,
      description: s.description, donate: s.donate, bytes: s.bytes, submitted: s.submitted })),
    reports: state.reports,
    support: (state.support || []).map(m => ({ ...m, email: state.accounts[m.account]?.email || null, name: state.accounts[m.account]?.name || null, username: state.accounts[m.account]?.username || null })) };
}

// The public market catalog (same shape Hustler's store reads, plus author and donate).
function catalog(state, baseUrl) {
  return { schema: 1, generated: new Date().toISOString(), skills: Object.entries(state.skills).filter(([, s]) => s.status === 'approved').map(([key, s]) => ({
    id: `${s.author}--${s.id}`, name: s.name, version: s.version, author: s.author, description: s.description, tags: s.tags,
    donate: s.donate || null, url: `${baseUrl}/skills/${key}/${s.version}.zip`, sha256: s.sha256, bytes: s.bytes })) };
}

module.exports = { emptyState, applyRecord, applyAdmin, control, stats, catalog, PRODUCTS };
