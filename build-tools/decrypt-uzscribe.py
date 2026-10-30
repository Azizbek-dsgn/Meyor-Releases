"""Only ciphertext is public; plaintext stays in the ephemeral runner directory.

The encrypted input is made on the maintainer's Mac by build-tools/release-uzscribe.sh.
"""
import hashlib, io, os, re, urllib.request, zipfile
from pathlib import Path
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

VERSION = os.environ['UZSCRIBE_VERSION']
EXPECTED = os.environ['INPUT_SHA256'].strip().lower()
if not re.fullmatch(r'\d+\.\d+\.\d+', VERSION) or not re.fullmatch(r'[0-9a-f]{64}', EXPECTED):
    raise SystemExit('Version yoki SHA-256 noto‘g‘ri.')
URL = f'https://github.com/Azizbek-dsgn/Meyor-Releases/releases/download/build-input-uzscribe-{VERSION}/uzscribe-{VERSION}.enc'
try:
    key = bytes.fromhex(os.environ['MEYOR_BUILD_KEY'])
    assert len(key) == 32
    local = Path(f'build-inputs/uzscribe-{VERSION}.enc')
    if local.is_file():
        packet = local.read_bytes()
    else:
        with urllib.request.urlopen(URL, timeout=120) as response:
            packet = response.read(32 * 1024**2)
    assert hashlib.sha256(packet).hexdigest() == EXPECTED
    plaintext = AESGCM(key).decrypt(packet[:12], packet[28:]+packet[12:28], None)
    destination = Path(os.environ['RUNNER_TEMP'])/'meyor-private-build'
    destination.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(io.BytesIO(plaintext)) as archive:
        assert sum(item.file_size for item in archive.infolist()) < 256*1024**2
        for item in archive.infolist():
            relative = Path(item.filename)
            assert not relative.is_absolute() and '..' not in relative.parts
            assert relative.parts[0] == 'uzscribe'
            assert (item.external_attr >> 16) & 0xf000 != 0xa000
        archive.extractall(destination)
    revision = (destination/'uzscribe'/'SOURCE_REVISION').read_text().strip()
    assert re.fullmatch(r'[0-9a-f]{40}', revision)
    with open(os.environ['GITHUB_ENV'], 'a', encoding='utf-8') as env:
        env.write(f'SOURCE_REVISION={revision}\n')
    print(f'Authenticated encrypted UzScribe {VERSION} input is ready (revision {revision[:7]}).')
except Exception:
    raise SystemExit('Build input authentication or decryption failed. No source or key is printed.')
