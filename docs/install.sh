#!/bin/bash
# Hustler — Mac installer without the "Apple could not verify" prompt.
# curl downloads the app itself (no quarantine flag), the DMG is checked with the SHA-256 from the
# official catalog, Hustler.app goes to Applications and opens.
#   curl -fsSL https://azizbek-dsgn.github.io/Meyor-Releases/install.sh | bash
set -euo pipefail
[[ $(uname -s) == Darwin ]] || { echo "Bu buyruq Mac uchun. Windows: irm https://azizbek-dsgn.github.io/Meyor-Releases/install.ps1 | iex"; exit 1; }
key=mac-x64
[[ $(/usr/sbin/sysctl -n hw.optional.arm64 2>/dev/null || echo 0) == 1 ]] && key=mac-arm64
work=$(mktemp -d)
cleanup() { /usr/bin/hdiutil detach "$work/mount" -quiet 2>/dev/null || true; rm -rf "$work"; }
trap cleanup EXIT
/usr/bin/curl -fsSL "https://raw.githubusercontent.com/Azizbek-dsgn/Meyor-Releases/main/catalog.json" -o "$work/catalog.json"
get() { /usr/bin/plutil -extract "meyor.$1" raw -o - "$work/catalog.json"; }
version=$(get version); url=$(get "assets.$key.url"); sha=$(get "assets.$key.sha256")
echo "Hustler $version yuklanmoqda ($key)…"
/usr/bin/curl -fL --progress-bar "$url" -o "$work/hustler.dmg"
[[ $(/usr/bin/shasum -a 256 "$work/hustler.dmg" | awk '{print $1}') == "$sha" ]] || { echo "Yuklangan fayl tekshiruvdan o‘tmadi. Qayta urinib ko‘ring."; exit 1; }
/usr/bin/pkill -x Hustler 2>/dev/null || true
mkdir "$work/mount"
/usr/bin/hdiutil attach -readonly -nobrowse -quiet -mountpoint "$work/mount" "$work/hustler.dmg"
dest=/Applications
[[ -w $dest ]] || { dest="$HOME/Applications"; mkdir -p "$dest"; }
rm -rf "$dest/Hustler.app"
/usr/bin/ditto "$work/mount/Hustler.app" "$dest/Hustler.app"
/usr/bin/xattr -dr com.apple.quarantine "$dest/Hustler.app" 2>/dev/null || true
/usr/bin/open "$dest/Hustler.app"
echo "Tayyor: Hustler $dest papkasiga o‘rnatildi va ochildi."
