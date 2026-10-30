# Yangi mahsulotni Meyor'ga chiqarish

Meyor 0.5.0 va undan keyingi versiyalar `catalog.json` → `products` bo‘limidagi har qanday ilovani o‘zi o‘rnatadi. Bu yerdagi workflow yopiq repodagi loyihani yig‘ib, shu bo‘limga yozadi.

## Loyiha reposida kerak bo‘ladigan ikki fayl

`meyor.json`:

```json
{
  "id": "notes",
  "name": "Notes",
  "detail": "Meyor kutubxonasida ko‘rinadigan qisqa tavsif",
  "host": "Mustaqil ilova",
  "mac": { "app": "Notes.app", "bundleId": "com.meyorvision.notes" },
  "win": { "exe": "Notes.exe" },
  "toolchains": { "node": "24", "pnpm": "11.25.0", "python": "3.12", "rust": true }
}
```

`meyor-build.sh` — `bash` bilan Mac va Windows (Git Bash) runnerlarida ishga tushadi. Muhit: `PLATFORM` (`mac-arm64`, `mac-x64`, `win-x64`), `VERSION`, `REVISION`, `OUT_DIR`. Skript `OUT_DIR` ga bitta paket qo‘yadi:

- Mac: `.dmg` yoki `.zip`, ichida `mac.app`;
- Windows: portativ `.zip` (ildizida `win.exe`) yoki `.exe` installer.

Testlarni shu skript ichida ishga tushiring: xato bo‘lsa reliz chiqmaydi.

## Chiqarish

1. Manbani shifrlash (kalit faqat maintainer kompyuterida yoki Claude muhitida):

   ```bash
   MEYOR_BUILD_KEY=… python3 build-tools/encrypt-source.py <loyiha-papkasi> notes 1.0.0
   ```

2. `notes-1.0.0.enc` ni `build-input-notes-1.0.0` tegli pre-release'ga yuklash.
3. Actions → **Build and publish product** → `product`, `version`, `input_sha256`.

Uchala platforma o‘tsa, reliz chiqadi va `catalog.json` yangilanadi; Meyor keyingi tekshiruvda yangilanishni ko‘rsatadi.
