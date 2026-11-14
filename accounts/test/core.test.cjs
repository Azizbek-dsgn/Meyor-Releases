const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const c = require('../lib/crypto.cjs');
const core = require('../lib/core.cjs');
const rules = require('../lib/rules.cjs');
const { checkSkillZip } = require('../lib/zip.cjs');

const AUD = 'test-client';
const google = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const keys = { k1: google.publicKey };
const now = Date.UTC(2026, 10, 14, 12);
function idToken(claims, key = google.privateKey) {
  const enc = v => Buffer.from(JSON.stringify(v)).toString('base64url');
  const head = enc({ alg: 'RS256', kid: 'k1' }), body = enc({ iss: 'https://accounts.google.com', aud: AUD, email_verified: true, iat: now / 1000 - 60, ...claims });
  return head + '.' + body + '.' + crypto.sign('RSA-SHA256', Buffer.from(head + '.' + body), key).toString('base64url');
}
function device() { const k = c.generateKeys('sign'); return { ...k, id: crypto.randomBytes(8).toString('hex') }; }
function record(dev, sub, extra = {}, withToken = true) {
  const body = { v: 1, type: 'account', account: c.accountHash(sub), device: dev.id, devicePub: dev.public, at: now - 1000,
    os: 'mac-arm64', apps: { meyor: '0.8.3', uzscribe: '1.4.1' }, ...(withToken ? { idToken: idToken({ sub, email: sub + '@example.com', name: 'Siz' }) } : {}), ...extra };
  return { ...body, sig: c.sign(dev.private, body) };
}
const ctx = { keys, audience: AUD, now };

test('a device is pinned by Google proof; a forged or foreign record is ignored', () => {
  const s = core.emptyState(), d = device();
  assert.equal(core.applyRecord(s, record(d, 'u1', { username: 'aziz' }), ctx), 'ok');
  const a = s.accounts[c.accountHash('u1')];
  assert.equal(a.email, 'u1@example.com'); assert.equal(a.username, 'aziz'); assert.equal(s.usernames.aziz, c.accountHash('u1'));
  // heartbeat from the pinned device needs no token
  assert.equal(core.applyRecord(s, record(d, 'u1', { at: now }, false), ctx), 'ok');
  // another key for the same device id is refused
  const evil = { ...device(), id: d.id };
  assert.equal(core.applyRecord(s, record(evil, 'u1', {}, false), ctx), 'device-key-mismatch');
  // a new device without Google proof is refused; with a token for another account too
  assert.match(core.applyRecord(s, record(device(), 'u1', {}, false), ctx), /^google:/);
  const wrong = record(device(), 'u2'); wrong.account = c.accountHash('u1');
  const { sig, ...body } = wrong; const d2 = device(); Object.assign(wrong, { devicePub: d2.public, device: d2.id }); wrong.sig = c.sign(d2.private, { ...body, devicePub: d2.public, device: d2.id });
  assert.equal(core.applyRecord(s, wrong, ctx), 'account-mismatch');
  // a token signed by someone else is refused
  const fake = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const d3 = device(), r = record(d3, 'u3', {}, false); const { sig: _s, ...b3 } = r;
  const forged = { ...b3, idToken: idToken({ sub: 'u3', email: 'x@example.com' }, fake.privateKey) };
  assert.equal(core.applyRecord(s, { ...forged, sig: c.sign(d3.private, forged) }, ctx), 'google:id_token signature');
  // a tampered record fails its device signature
  const t = record(d, 'u1', {}, false); t.os = 'changed';
  assert.equal(core.applyRecord(s, t, ctx), 'bad-signature');
});

test('usernames: first claim wins, rules apply, rename at most every 30 days', () => {
  const s = core.emptyState(), d1 = device(), d2 = device();
  core.applyRecord(s, record(d1, 'a', { username: 'montajchi' }), ctx);
  core.applyRecord(s, record(d2, 'b', { username: 'montajchi' }), ctx);
  assert.equal(s.usernames.montajchi, c.accountHash('a'));
  assert.equal(s.accounts[c.accountHash('b')].usernameError, 'Bu username band.');
  core.applyRecord(s, record(d2, 'b', { username: 'admin' }, false), ctx);
  assert.match(s.accounts[c.accountHash('b')].usernameError, /band qilingan/);
  core.applyRecord(s, record(d1, 'a', { username: 'yangi-nom' }, false), ctx);
  assert.match(s.accounts[c.accountHash('a')].usernameError, /30 kunda/);
  assert.equal(rules.username('Ab').ok, false); assert.equal(rules.username('a--b').ok, false); assert.equal(rules.username('aziz-01').ok, true);
});

test('admin commands need the admin signature and run once; control is signed', () => {
  const s = core.emptyState(), d = device(), admin = c.generateKeys('sign');
  core.applyRecord(s, record(d, 'u1'), ctx);
  const acct = c.accountHash('u1');
  const cmd = body => ({ ...body, adminSig: c.sign(admin.private, body) });
  assert.equal(core.applyAdmin(s, { type: 'block', account: acct, seq: 1, adminSig: c.sign(c.generateKeys('sign').private, { type: 'block', account: acct, seq: 1 }) }, { adminSignPublic: admin.public, now }), 'bad-admin-signature');
  assert.equal(core.applyAdmin(s, cmd({ v: 1, type: 'block', account: acct, reason: 'spam', seq: 1 }), { adminSignPublic: admin.public, now }), 'blocked');
  assert.equal(core.applyAdmin(s, cmd({ v: 1, type: 'unblock', account: acct, seq: 1 }), { adminSignPublic: admin.public, now }), 'old-admin-command');
  assert.equal(core.applyAdmin(s, cmd({ v: 1, type: 'update', product: 'tempo', min: '0.3.2', targets: 'all', message: 'Muhim', seq: 2 }), { adminSignPublic: admin.public, now }), 'update');
  const control = core.control(s, { adminSignPrivate: admin.private, now });
  const { sig, ...body } = control;
  assert(c.verify(admin.public, body, sig));
  assert.deepEqual(control.blocked, [{ account: acct, reason: 'spam' }]);
  assert.equal(control.updates[0].product, 'tempo');
  assert(!JSON.stringify(control).includes('@example.com'), 'no emails in the public control file');
  const st = core.stats(s, now);
  assert.equal(st.total, 1); assert.equal(st.active1, 1); assert.equal(st.versions.uzscribe['1.4.1'], 1);
});

function zip(files) {
  // minimal stored zip writer for tests
  const locals = [], centrals = []; let offset = 0;
  for (const [name, data, mode = 0o100644] of files) {
    const n = Buffer.from(name), d = Buffer.from(data), crc = 0;
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt32LE(crc, 14); local.writeUInt32LE(d.length, 18); local.writeUInt32LE(d.length, 22); local.writeUInt16LE(n.length, 26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt32LE(d.length, 20); central.writeUInt32LE(d.length, 24); central.writeUInt16LE(n.length, 28); central.writeUInt32LE((mode << 16) >>> 0, 38); central.writeUInt32LE(offset, 42);
    locals.push(local, n, d); centrals.push(central, n); offset += 30 + n.length + d.length;
  }
  const cd = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

test('skills: checked, pending until approved, published under the username with a safe donate link', () => {
  const s = core.emptyState(), d = device(), admin = c.generateKeys('sign');
  core.applyRecord(s, record(d, 'u1', { username: 'aziz' }), ctx);
  const good = zip([['hook/SKILL.md', '---\nname: Hook\n---\n'], ['hook/ref.md', 'x']]);
  const skillRec = extra => { const body = { v: 1, type: 'skill', account: c.accountHash('u1'), device: d.id, devicePub: d.public, at: now,
    skill: { id: 'hook', name: 'Hook', version: '1.0.0', donate: 'https://taps.uz/aziz', ...extra }, zip: good.toString('base64') }; return { ...body, sig: c.sign(d.private, body) }; };
  assert.equal(core.applyRecord(s, skillRec({ donate: 'https://evil.example/pay' }), ctx), 'skill-invalid');
  assert.equal(core.applyRecord(s, skillRec(), ctx), 'skill-pending');
  assert.equal(core.catalog(s, 'B').skills.length, 0);
  core.applyAdmin(s, (b => ({ ...b, adminSig: c.sign(admin.private, b) }))({ v: 1, type: 'approve', skill: 'aziz/hook', seq: 1 }), { adminSignPublic: admin.public, now });
  const cat = core.catalog(s, 'B').skills;
  assert.equal(cat[0].id, 'aziz--hook'); assert.equal(cat[0].author, 'aziz'); assert.equal(cat[0].donate, 'https://taps.uz/aziz');
  assert.equal(cat[0].url, 'B/skills/aziz/hook/1.0.0.zip');
  assert.throws(() => checkSkillZip(zip([['SKILL.md', 'x'], ['run.exe', 'x']])), /Ruxsat etilmagan/);
  assert.throws(() => checkSkillZip(zip([['SKILL.md', 'x'], ['link.md', '/etc/passwd', 0o120777]])), /link/);
  assert.throws(() => checkSkillZip(zip([['a/../../x.md', 'x'], ['SKILL.md', 'x']])), /yo‘li/);
  assert.throws(() => checkSkillZip(zip([['notes.md', 'x']])), /SKILL\.md/);
  for (const bad of ['http://taps.uz/a', 'https://taps.uz.evil.com/a', 'https://t.me/someone', 'javascript:alert(1)']) assert.equal(rules.donateLink(bad).ok, false, bad);
  for (const ok of ['https://tirikchilik.uz/aziz', 'https://www.buymeacoffee.com/aziz', 'https://t.me/tribute/app?startapp=x']) assert.equal(rules.donateLink(ok).ok, true, ok);
});

test('deleting an account frees its username and removes its data', () => {
  const s = core.emptyState(), d = device();
  core.applyRecord(s, record(d, 'u1', { username: 'aziz' }), ctx);
  const body = { v: 1, type: 'delete', account: c.accountHash('u1'), device: d.id, devicePub: d.public, at: now };
  assert.equal(core.applyRecord(s, { ...body, sig: c.sign(d.private, body) }, ctx), 'deleted');
  assert.deepEqual(s.accounts, {}); assert.deepEqual(s.usernames, {});
});
