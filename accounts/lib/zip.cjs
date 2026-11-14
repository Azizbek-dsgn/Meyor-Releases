// Reads a zip's central directory (no extraction, no dependencies) to check a skill before it is
// published: only text and media files, no links, no paths outside the folder, SKILL.md present.
const FILES = /\.(md|markdown|txt|json|jsx|js|ts|tsx|mjs|cjs|py|csv|ya?ml|xml|png|jpe?g|webp|svg)$/i;

function entries(buf) {
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new Error('Zip emas.');
  const count = buf.readUInt16LE(end + 10), size = buf.readUInt32LE(end + 12), offset = buf.readUInt32LE(end + 16);
  if (offset + size > buf.length || count > 2000) throw new Error('Zip buzilgan yoki juda ko‘p fayl.');
  const list = [];
  for (let p = offset, n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Zip buzilgan.');
    const unpacked = buf.readUInt32LE(p + 24), nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const attrs = buf.readUInt32LE(p + 38), name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    list.push({ name, unpacked, link: ((attrs >>> 16) & 0xf000) === 0xa000 });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return list;
}

function checkSkillZip(buf) {
  const list = entries(buf);
  let total = 0, main = false;
  for (const e of list) {
    if (e.name.endsWith('/')) continue;
    if (e.link) throw new Error('Skill ichida link bo‘lishi mumkin emas.');
    if (e.name.startsWith('/') || e.name.includes('\\') || e.name.split('/').some(part => part === '..' || part === '')) throw new Error('Skill ichidagi fayl yo‘li noto‘g‘ri.');
    if (!FILES.test(e.name)) throw new Error('Ruxsat etilmagan fayl: ' + e.name.split('/').pop());
    if ((total += e.unpacked) > 16 * 1024 ** 2) throw new Error('Skill ochilganda 16 MB dan oshmasin.');
    if (/^([^/]+\/)?SKILL\.md$/i.test(e.name)) main = true;
  }
  if (!main) throw new Error('Skill ichida SKILL.md yo‘q.');
  return { files: list.filter(e => !e.name.endsWith('/')).length, unpacked: total };
}

module.exports = { entries, checkSkillZip };
