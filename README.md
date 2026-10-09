# Meyor — downloads and update catalog

[Download Meyor 0.2.1 for Apple Silicon Mac, Intel Mac and Windows x64](https://github.com/Azizbek-dsgn/Meyor-Releases/releases/tag/v0.2.1).

This repository distributes compiled installers, protected plugin packages and the public update catalog. Editable product source repositories (Meyor, UzScribe and Tempo) are private. No GitHub credentials are embedded in the user application.

macOS 13+ / Windows 10 and 11 x64. Native installation, reinstallation and installed-app launch were verified on macOS 15 ARM64, macOS 15 Intel and Windows Server 2022; ARM64 was also verified on the developer's Mac. Windows uninstall was verified. These checks do not guarantee operation on every device or automatic Gatekeeper / SmartScreen acceptance.

For the free Mac terminal installation, download the matching DMG, `Install-Meyor-mac.sh` and `SHA256SUMS` from the release into one folder, then run `bash Install-Meyor-mac.sh` there. The installer verifies SHA-256, architecture, app identity and ad-hoc signature, then installs into `~/Applications/Meyor.app` without sudo. It does not alter system security settings.

Mac builds are ad-hoc signed and not Apple notarized. Windows builds are unsigned. First-open security prompts may appear. See [Apple's per-app Open Anyway instructions](https://support.apple.com/en-us/102445) and [Microsoft's SmartScreen explanation](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation).

The GitHub-generated “Source code” archives on this distribution repository contain this repository's public catalog and packaged distribution files, not editable product source. Obfuscation and native compilation do not prevent all reverse engineering. Original product code © Meyor Vision; free distribution does not grant an open-source license. Third-party components retain their own licenses.
