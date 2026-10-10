"""Only ciphertext is public; plaintext stays in the ephemeral runner directory."""
import hashlib, io, os, urllib.request, zipfile
from pathlib import Path
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

URL = 'https://github.com/Azizbek-dsgn/Meyor-Releases/releases/download/build-input-0.3.1-0.8.5/meyor-build-0.3.1-uzscribe-0.8.5.enc'
SHA256 = 'e651ef3f1854dff994993c7e6671658cb66e7a6d931db174dc553cc4acce4d2d'
try:
    key = bytes.fromhex(os.environ['MEYOR_BUILD_KEY'])
    assert len(key) == 32
    with urllib.request.urlopen(URL, timeout=120) as response:
        packet = response.read(32*1024**2)
    assert hashlib.sha256(packet).hexdigest() == SHA256
    plaintext = AESGCM(key).decrypt(packet[:12], packet[28:]+packet[12:28], None)
    destination = Path(os.environ['RUNNER_TEMP'])/'meyor-private-build'
    destination.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(io.BytesIO(plaintext)) as archive:
        assert sum(item.file_size for item in archive.infolist()) < 256*1024**2
        for item in archive.infolist():
            relative = Path(item.filename)
            assert not relative.is_absolute() and '..' not in relative.parts
            assert (item.external_attr >> 16) & 0xf000 != 0xa000
        archive.extractall(destination)
    print('Authenticated encrypted build input is ready.')
except Exception:
    raise SystemExit('Build input authentication or decryption failed. No source or key is printed.')
