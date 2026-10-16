# Nexora Browser: Architecture and Implementation Audit

Audit date: 2026-10-16

This document records the existing implementation before larger architectural changes. It intentionally describes the repository as it exists today; requested future features are not represented as implemented.

## Current architecture

### Frontend

- `src/main.jsx` mounts a single React application.
- `src/App.jsx` currently owns the browser shell, tab and workspace state, navigation, local persistence, native event handling, downloads, and internal pages. It is the primary frontend implementation file and is over 1,300 lines.
- `src/styles.css` contains the design tokens and all browser/internal-page styles in one stylesheet. It contains repeated overrides from earlier visual passes.
- `src/storage.js` wraps JSON reads and writes to `localStorage`. Its values are not versioned, and storage failures are logged to the browser console.
- `src/services/browser/addressService.js` now contains the pure URL normalization and title-formatting helpers, with focused tests using Node's built-in test runner.
- `package.json` has Vite build/dev scripts, the Windows native build/launch scripts, and `npm test`. There is no frontend test dependency.

The latest UI pass is part of the current application: the sidebar identity is compact, the new-tab page has no second search input or recent-history list, the width slider is in Appearance settings rather than the sidebar footer, and the History utility opens the dedicated history page. The toolbar address input remains authoritative for URL entry and search.

### Native host and CEF

- `native/main.cpp` initializes CEF, registers a custom window class, creates the main Win32 window, and runs the CEF message loop.
- `native/app.cpp` contains the application object, CEF handlers, trusted UI scheme/resource handler, native bridge, site browser lifecycle, viewport placement, popup routing, and download actions.
- `native/app.h` holds the main application type and its browser/download state.
- `CMakeLists.txt` builds the CEF wrapper and the `nexora` executable, copies CEF runtime/resources, and packages the Vite output into the executable's `web` directory.
- `scripts/build-windows.ps1` builds the Vite interface, configures CMake against an externally supplied CEF distribution, builds the executable, and optionally launches it.

The browser chrome is a CEF child window loading `nexora://app/index.html`. Website tabs use separate native CEF browser windows positioned over the React content viewport. The UI reports viewport coordinates and dimensions to the host; the host hides inactive views and resizes the active one.

### Native bridge and navigation boundary

- The render-process handler adds `window.nexora` only to the main frame whose URL exactly matches the packaged UI URL.
- The browser-process handler accepts bridge messages only from the UI browser's renderer, main frame, and expected URL.
- Native navigation permits HTTP and HTTPS for website main frames. The UI browser is restricted to the `nexora://app/` route; web content does not get the Nexora bridge.
- C++ checks command names, argument counts, CEF value types, URL schemes, and viewport bounds, but the command contract is embedded in `app.cpp`. Several invalid commands are silently ignored, and identifiers and strings do not have a common, explicit validation policy.
- A loopback remote-debugging port can be enabled by `NEXORA_DEVTOOLS_PORT`; it should remain unset during ordinary use.

These checks provide useful origin separation, but they are not a substitute for a documented, centralized bridge contract and independent validation of every native command.

## Feature status

| Area | Status in current code | Important gap |
|---|---|---|
| CEF website rendering | Implemented in the native build | Sandbox is disabled; runtime lifecycle/layering still needs broader testing |
| Navigation | HTTP/HTTPS navigation, back/forward, reload/stop, titles and loading events | No automated navigation/lifecycle tests; native focus behavior needs investigation |
| Tabs | Native browser view per tab when activated; close, switch, pin, reorder, duplicate, restore recently closed | Tabs and session state are not persisted; browser focus is assigned during each visibility update |
| Workspaces | Create, rename, remove, switch, and persist workspace definitions | The tab collection is not restored, and workspace ordering is not implemented |
| Address/search | URL/domain normalization, selected search engine, local bookmark/history suggestions, Ctrl+L focus | Pure address helper is tested; UI/autocomplete/native navigation integration remains untested |
| Bookmarks | Add/remove/edit, duplicate handling, bar, import/export, local persistence | No folders or storage migrations |
| History | Successful native page loads are recorded; filter, group, delete, clear | Stored in UI local storage; clear does not clear website data |
| Downloads | CEF callbacks, progress, cancel/retry, configured folder, open/reveal actions | No automated tests; files remain untrusted; records are UI-local data |
| Settings | Theme, accent, density, search engine, startup/home, download location, sidebar and privacy labels | Some listed controls/features remain unavailable; no schema versioning |
| Popups | User-initiated HTTP/HTTPS popups are routed to tabs | Needs native integration coverage |
| New-tab page | Nexora identity and bookmark shortcut entry points; toolbar is the sole search field | Shortcut storage is coupled to bookmarks rather than a separate shortcut model |
| Private browsing | Not implemented | Do not label tabs private or imply isolation |
| Site permissions | Not implemented | Camera, microphone, location, notifications and related requests need explicit decisions |
| Ad blocking | Not implemented | No request filter engine or maintained filter-list pipeline |
| Find in page | Not implemented | No CEF find-controller UI or command |
| Extensions, sync, installer, updates | Not implemented | CEF support and packaging/security requirements must be investigated first |
| Tests | Node built-in tests cover URL normalization and page-title formatting | Tab/workspace/storage/bridge/download logic and native lifecycle have no automated coverage |

## Verified build and runtime context

- The Windows build uses React/Vite, CMake, Visual Studio C++ tools, and an external CEF 154 x64 distribution under `F:\Nexora-CEF`.
- The CEF distribution is deliberately not checked into this repository. A Chromium source checkout is unnecessary for ordinary application features.
- Previous development work verified real CEF navigation and a local attachment download. The latest UI changes were built successfully with `npm.cmd run build:windows`.
- `npm.cmd test` covers the extracted address service; no third-party test dependency was added.
- The CEF runtime artifacts inspected in the configured extraction did not reveal a sandbox-named library. This observation alone does not establish every upstream sandbox packaging requirement; it does establish that Nexora must not claim sandboxing is enabled.
- The checked-in README previously contained merge-conflict markers. They have been removed and the capability/limitation claims reconciled with the source.

## Security and reliability blockers

1. **Chromium sandbox disabled.** `native/main.cpp` sets `CefSettings.no_sandbox = true`. Determine the supported sandbox configuration for this exact CEF package and Windows toolchain, then implement and test it. Do not simply flip the setting unless the required CEF sandbox artifacts and startup configuration are present.
2. **Profile location is build-relative.** The cache/profile currently lives next to the executable in `build\windows\Release\profile`; a proper per-user application-data directory and migration plan are needed before installation/upgrades.
3. **Native views and focus.** `UpdateSiteVisibility()` calls `SetFocus` on visible browser windows while updating visibility. Audit focus stealing and input behavior, and test resizing, hidden tabs, menus, dialogs, window activation, and DPI changes before changing the lifecycle.
4. **No site-permission policy.** Implement explicit, safe defaults and prompts using the CEF APIs for this version. Never auto-grant sensitive permissions.
5. **Native bridge contract is monolithic.** Document and centralize commands/events, impose bounded input validation, and keep renderer-origin restrictions enforced in C++.
6. **Persistence is partial.** Settings/bookmarks/history/workspaces/download records use UI local storage, but the tab collection is not serialized. Add versioned migration and crash-safe validation without discarding current user data.
7. **Release hardening is absent.** There is no installer, signing, update channel, or packaged clean-machine acceptance suite. Current release status must remain development-only.

## Recommended implementation order

1. **Stabilize and verify:** keep the README accurate, maintain the focused new-tab/sidebar corrections, establish a reproducible Windows build and a manual CEF smoke checklist.
2. **Add targeted tests:** extract URL normalization and pure state/storage logic first; add frontend tests only with a focused dependency and clear coverage. Add native tests around bridge validation and path/navigation policies where they can run reliably.
3. **Separate frontend by responsibility:** extract the address/search helper, persistence and validation, bridge adapter, and independent internal pages in small buildable changes. Keep `App.jsx` as the composition root until each extraction has regression coverage.
4. **Stabilize native browser lifecycle:** isolate browser/tab ownership and viewport/focus behavior, then test create/switch/close, resize, minimize/maximize, and popup flows with actual CEF views.
5. **Resolve security fundamentals:** investigate supported sandbox packaging; establish a stable profile directory; formalize navigation, download, and permission policies; document bridge messages and reject invalid inputs explicitly.
6. **Complete persistence and core UX:** restore sessions according to settings; verify bookmarks/history/download behavior against actual CEF events; preserve data using versioned migrations.
7. **Evaluate optional features:** investigate find-in-page, off-the-record contexts, request filtering, extensions, and split view against CEF 154 APIs before exposing user-facing controls.
8. **Release only after evidence:** clean Windows build, real-browser acceptance checklist, runtime packaging validation, installer/uninstaller, license notices, signing, and honest release notes.

## Structural decisions

The proposed directory tree in the product brief is a target, not a requirement to create empty modules. Begin with narrowly scoped extractions from the existing three-file frontend/native implementation and add folders only when they contain working behavior. Keep the existing CEF child-window architecture until lifecycle tests demonstrate a safe alternative.
