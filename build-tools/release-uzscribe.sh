#!/bin/bash
# Maintainer Mac only: encrypt a private UzScribe commit and upload it as build input.
# The key never leaves this computer; only ciphertext is uploaded.
#   bash release-uzscribe.sh 0.9.0 [branch-or-commit]
set -euo pipefail
VERSION="${1:?Versiya kerak, masalan: bash release-uzscribe.sh 0.9.0}"
REF="${2:-main}"
KEY_FILE="${MEYOR_KEY_FILE:-$HOME/.meyor/build-key.txt}"
REPO_SOURCE="https://github.com/Azizbek-dsgn/uzscribe"
REPO_RELEASES="Azizbek-dsgn/Meyor-Releases"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Versiya 0.9.0 ko‘rinishida bo‘lsin."; exit 1; }
[[ -f "$KEY_FILE" ]] || { echo "Kalit topilmadi: $KEY_FILE"; exit 1; }
python3 -c "import cryptography" 2>/dev/null || python3 -m pip install --user cryptography

work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
echo "1/4 UzScribe kodi olinmoqda ($REF)…"
git clone -q "$REPO_SOURCE" "$work/src"
git -C "$work/src" checkout -q "$REF"
revision="$(git -C "$work/src" rev-parse HEAD)"
git -C "$work/src" archive --format=zip --prefix=uzscribe/ -o "$work/source.zip" HEAD

out="$HOME/Desktop/uzscribe-$VERSION.enc"
echo "2/4 Shifrlanmoqda…"
python3 - "$KEY_FILE" "$work/source.zip" "$out" "$revision" <<'PY'
import os, sys, zipfile
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
key_file, source, out, revision = sys.argv[1:]
raw = open(key_file).read().strip().split('=')[-1].strip().strip('"\'')
key = bytes.fromhex(raw); assert len(key) == 32, 'Kalit 64 belgili hex emas'
with zipfile.ZipFile(source, 'a') as archive:
    archive.writestr('uzscribe/SOURCE_REVISION', revision + '\n')
data = open(source, 'rb').read()
assert len(data) < 32 * 1024**2, 'Arxiv 32 MB dan katta'
nonce = os.urandom(12)
sealed = AESGCM(key).encrypt(nonce, data, None)
# Same layout the build-tools decrypt scripts expect: nonce | tag | ciphertext.
open(out, 'wb').write(nonce + sealed[-16:] + sealed[:-16])
PY
sha="$(shasum -a 256 "$out" | cut -d' ' -f1)"

tag="build-input-uzscribe-$VERSION"
echo "3/4 GitHub’ga yuklanmoqda…"
if command -v gh >/dev/null && gh auth status >/dev/null 2>&1; then
  gh release view "$tag" --repo "$REPO_RELEASES" >/dev/null 2>&1 || \
    gh release create "$tag" --repo "$REPO_RELEASES" --prerelease --latest=false \
      --title "Encrypted build input: UzScribe $VERSION" --notes "AES-256-GCM encrypted source. Not an installer."
  gh release upload "$tag" "$out" --repo "$REPO_RELEASES" --clobber
  uploaded=1
else
  uploaded=0
fi

echo
echo "4/4 Tayyor."
echo "   Versiya:  $VERSION"
echo "   Commit:   $revision"
echo "   SHA-256:  $sha"
echo "   Fayl:     $out"
if [[ $uploaded == 0 ]]; then
  echo
  echo "gh topilmadi. Faylni brauzer orqali yuklang:"
  echo "   https://github.com/$REPO_RELEASES/releases/new?tag=$tag"
  echo "   Tag: $tag, faylni sudrab tashlang, 'Set as a pre-release' belgilang, Publish."
fi
echo
echo "Keyin: https://github.com/$REPO_RELEASES/actions/workflows/uzscribe-build.yml"
echo "   'Run workflow' → version: $VERSION, input_sha256: $sha"
