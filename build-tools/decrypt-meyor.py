"""Only ciphertext is public; plaintext stays in the ephemeral runner directory.

The input is made with build-tools/encrypt-source.py <meyor-repo> meyor <version>.
"""
import hashlib, io, os, re, urllib.request, zipfile
from pathlib import Path
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

VERSION, EXPECTED = os.environ['PRODUCT_VERSION'], os.environ['INPUT_SHA256'].strip().lower()
if not re.fullmatch(r'\d+\.\d+\.\d+', VERSION) or not re.fullmatch(r'[0-9a-f]{64}', EXPECTED):
    raise SystemExit('Versiya yoki SHA-256 noto‘g‘ri.')
URL = f'https://github.com/Azizbek-dsgn/Meyor-Releases/releases/download/build-input-meyor-{VERSION}/meyor-{VERSION}.enc'
try:
    key = bytes.fromhex(os.environ['MEYOR_BUILD_KEY'])
    assert len(key) == 32
    local = Path(f'build-inputs/meyor-{VERSION}.enc')
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
            assert not relative.is_absolute() and '..' not in relative.parts and relative.parts[0] == 'meyor'
            assert (item.external_attr >> 16) & 0xf000 != 0xa000
        archive.extractall(destination)
    import json
    assert json.loads((destination/'meyor'/'package.json').read_text())['version'] == VERSION
    print('Authenticated encrypted build input is ready.')
except Exception:
    raise SystemExit('Build input authentication or decryption failed. No source or key is printed.')
