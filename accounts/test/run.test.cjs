const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const c = require('../lib/crypto.cjs');

test('a full run reads the inbox, writes encrypted state and a signed control file', async () => {
  const box = c.generateKeys('box'), signKey = c.generateKeys('sign');
  process.env.ADMIN_BOX_PRIVATE = box.private; process.env.ADMIN_SIGN_PRIVATE = signKey.private;
  const written = {};
  const gh = async (method, url, body) => {
    if (method === 'GET' && url.includes('/Meyor-Inbox/issues?')) return url.includes('page=1') ? [{ number: 1, state: 'open', labels: [], comments: 0, body: c.seal(box.public, '{"v":1,"type":"account"}'), user: { login: 'x' } }, { number: 2, state: 'open', labels: [], comments: 0, body: 'spam', user: { login: 'x' } }] : [];
    if (method === 'GET') return null;
    if (method === 'PUT') { written[url] = Buffer.from(body.content, 'base64').toString('utf8'); return {}; }
    return {};
  };
  try {
    const { run } = require('../index.cjs');
    const result = await run({ gh, fetchJson: async () => ({ keys: [] }) });
    assert.equal(result.tally.invalid, 1); assert.equal(result.tally.unreadable, 1);
    const control = JSON.parse(written['/repos/Azizbek-dsgn/Meyor-Releases/contents/control/control.json']);
    const { sig, ...body } = control; assert(c.verify(signKey.public, body, sig));
    const state = JSON.parse(c.open(box.private, written['/repos/Azizbek-dsgn/Meyor-Control/contents/state/state.enc'].trim()));
    assert(c.open(box.private, written['/repos/Azizbek-dsgn/Meyor-Control/contents/state/stats.enc'].trim()));
    assert.equal(state.v, 1); assert(state.lastRun);
    assert(JSON.parse(written['/repos/Azizbek-dsgn/Swible-Skills/contents/catalog.json']).skills);
  } finally {}
});
