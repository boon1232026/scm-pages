# Windows Build Guide — SocialCommerceManager-Setup.exe

Build happens on GitHub Actions `windows-latest` (Tauri NSIS bundling requires Windows). macOS is for development only.

## Workflow: `.github/workflows/windows-build.yml`

```yaml
on: { workflow_dispatch: {}, push: { tags: ['v*'] } }
jobs:
  build:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4        # version from packageManager
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - uses: dtolnay/rust-toolchain@stable
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @scm/contracts --filter @scm/sdk build
      - run: pnpm --filter @scm/desktop build
        env: { VITE_API_BASE_URL: ${{ vars.API_BASE_URL }} }
      - uses: tauri-apps/tauri-action@v0
        with: { projectPath: apps/desktop, tagName: ${{ github.ref_name }} }
```

## Installer details

- Tauri `bundle.targets: ["nsis"]` → `apps/desktop/src-tauri/target/release/bundle/nsis/SocialCommerceManager-Setup.exe`
- NSIS handles WebView2: `webviewInstallMode: { type: "downloadBootstrapper" }` — no admin pre-req beyond standard install.
- Icon: `apps/desktop/src-tauri/icons/icon.ico`; code signing cert via `TAURI_SIGNING_*` secrets (Phase 7).
- App does NOT bundle Node/Rust/Postgres — thin client to HTTPS API only.

## Smoke test checklist (clean Windows 10/11 VM)

1. Run Setup.exe → install completes, WebView2 bootstrapper runs if needed.
2. Launch → login screen → sign in against production API.
3. Connect Facebook (dev-mode app) → pages appear → enable 2 pages.
4. Compose text post → publish → verify on Facebook + status green in app.
5. Scheduled post 5 min out → fires on time (Asia/Bangkok).
6. Close/reopen → session persists (keychain), history visible.
