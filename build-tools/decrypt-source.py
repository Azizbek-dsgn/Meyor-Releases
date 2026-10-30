"""Authenticate and open a product build input on the ephemeral runner. Never prints source or key."""
import hashlib, io, json, os, re, urllib.request, zipfile
from pathlib import Path
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

PRODUCT, VERSION = os.environ['PRODUCT'], os.environ['PRODUCT_VERSION']
EXPECTED = os.environ['INPUT_SHA256'].strip().lower()
if not re.fullmatch(r'[a-z0-9][a-z0-9-]{1,40}', PRODUCT) or not re.fullmatch(r'\d+\.\d+\.\d+', VERSION) or not re.fullmatch(r'[0-9a-f]{64}', EXPECTED):
    raise SystemExit('Mahsulot, versiya yoki SHA-256 noto‘g‘ri.')
URL = f'https://github.com/Azizbek-dsgn/Meyor-Releases/releases/download/build-input-{PRODUCT}-{VERSION}/{PRODUCT}-{VERSION}.enc'
try:
    key = bytes.fromhex(os.environ['MEYOR_BUILD_KEY']); assert len(key) == 32
    local = Path(f'build-inputs/{PRODUCT}-{VERSION}.enc')
    if local.is_file():
        packet = local.read_bytes()
    else:
        with urllib.request.urlopen(URL, timeout=120) as response:
            packet = response.read(32 * 1024**2)
    assert hashlib.sha256(packet).hexdigest() == EXPECTED
    plaintext = AESGCM(key).decrypt(packet[:12], packet[28:] + packet[12:28], None)
    destination = Path(os.environ['RUNNER_TEMP']) / 'meyor-private-build'
    destination.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(io.BytesIO(plaintext)) as archive:
        assert sum(i.file_size for i in archive.infolist()) < 256 * 1024**2
        for item in archive.infolist():
            relative = Path(item.filename)
            assert not relative.is_absolute() and '..' not in relative.parts and relative.parts[0] == PRODUCT
            assert (item.external_attr >> 16) & 0xf000 != 0xa000
        archive.extractall(destination)
    root = destination / PRODUCT
    revision = (root / 'SOURCE_REVISION').read_text().strip()
    assert re.fullmatch(r'[0-9a-f]{40}', revision)
    meta = json.loads((root / 'meyor.json').read_text(encoding='utf-8'))
    assert meta.get('id') == PRODUCT and (root / 'meyor-build.sh').is_file()
    tools = meta.get('toolchains', {})
    with open(os.environ['GITHUB_OUTPUT'], 'a', encoding='utf-8') as out:
        out.write(f"node={tools.get('node', '')}\npnpm={tools.get('pnpm', '')}\npython={tools.get('python', '')}\nrust={'1' if tools.get('rust') else ''}\n")
    with open(os.environ['GITHUB_ENV'], 'a', encoding='utf-8') as env:
        env.write(f'SOURCE_REVISION={revision}\nSOURCE_DIR={root}\n')
    print(f'Authenticated {PRODUCT} {VERSION} input is ready (revision {revision[:7]}).')
except Exception:
    raise SystemExit('Build input authentication or decryption failed. No source or key is printed.')
