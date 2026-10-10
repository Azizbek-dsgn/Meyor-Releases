"""Encrypt private compiler diagnostics before any artifact upload."""
import io, os, zipfile
from pathlib import Path
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

root = Path(os.environ['RUNNER_TEMP'])
stream = io.BytesIO()
with zipfile.ZipFile(stream, 'w', zipfile.ZIP_DEFLATED) as archive:
    for source in root.glob('*private*.log'):
        archive.writestr(source.name, source.read_bytes())
nonce = os.urandom(12)
packet = AESGCM(bytes.fromhex(os.environ['MEYOR_BUILD_KEY'])).encrypt(nonce, stream.getvalue(), None)
destination = root/'encrypted-diagnostics'
destination.mkdir(exist_ok=True)
(destination/'diagnostics.enc').write_bytes(nonce + packet[-16:] + packet[:-16])
print('Only authenticated encrypted diagnostics will be uploaded.')
