"""Encrypt a private product source tree into a Meyor build input (maintainer or Claude session).

    MEYOR_BUILD_KEY=<hex> python3 build-tools/encrypt-source.py <source-git-dir> <product> <version> [out.enc]

Only committed files (git archive HEAD) are included, under <product>/, plus SOURCE_REVISION.
Prints the SHA-256 the product-release workflow asks for. Never prints the key.
"""
import hashlib, io, os, pathlib, re, subprocess, sys, zipfile
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

def load_key():
    raw = os.environ.get('MEYOR_BUILD_KEY', '').strip()
    if not raw and os.environ.get('MEYOR_KEY_FILE'):
        raw = pathlib.Path(os.environ['MEYOR_KEY_FILE']).read_text().strip().split('=')[-1].strip().strip('"\'')
    key = bytes.fromhex(raw)
    if len(key) != 32:
        raise ValueError
    return key

def main():
    source, product, version = sys.argv[1:4]
    if not re.fullmatch(r'[a-z0-9][a-z0-9-]{1,40}', product) or not re.fullmatch(r'\d+\.\d+\.\d+', version):
        raise SystemExit('Mahsulot nomi yoki versiya noto‘g‘ri.')
    out = pathlib.Path(sys.argv[4] if len(sys.argv) > 4 else f'{product}-{version}.enc')
    try:
        key = load_key()
    except Exception:
        raise SystemExit('MEYOR_BUILD_KEY topilmadi yoki 64 belgili hex emas.')
    revision = subprocess.check_output(['git', '-C', source, 'rev-parse', 'HEAD'], text=True).strip()
    archive = subprocess.check_output(['git', '-C', source, 'archive', '--format=zip', f'--prefix={product}/', 'HEAD'])
    buffer = io.BytesIO(archive)
    with zipfile.ZipFile(buffer, 'a') as z:
        z.writestr(f'{product}/SOURCE_REVISION', revision + '\n')
    data = buffer.getvalue()
    if len(data) >= 32 * 1024**2:
        raise SystemExit('Manba 32 MB dan katta; katta fayllarni build vaqtida yuklang.')
    nonce = os.urandom(12)
    sealed = AESGCM(key).encrypt(nonce, data, None)
    packet = nonce + sealed[-16:] + sealed[:-16]  # nonce | tag | ciphertext
    out.write_bytes(packet)
    print(f'product={product}\nversion={version}\nrevision={revision}\nsha256={hashlib.sha256(packet).hexdigest()}\nfile={out}')

if __name__ == '__main__':
    main()
