# Nexora Browser Architecture Audit

Audit date: 2026-10-16

## Scope and status

This document records the repository state before the planned modular refactors. Nexora is a native Windows C++20 application hosting a CEF browser for its local React/Vite interface and separate CEF browser instances for website tabs. It is not an Electron application, and the Vite development server is only an interface preview.

The project is an active development build. A successful frontend build does not establish that the CEF runtime, native lifecycle, security configuration, or packaged application is production-ready.

## Current architecture

### Frontend

- `src/main.jsx` mounts the React application and global stylesheet.
- `src/App.jsx` contains the browser shell, tab/workspace state, toolbar, address suggestions, settings, internal panels, menus, and event handling in one large component module.
- `src/styles.css` contains the complete interface style system and layout rules in one large stylesheet. It has repeated/overriding rules for layout elements such as the sidebar and address field, as well as repeated responsive breakpoints.
- `src/services/browser/addressService.js` normalizes addresses and builds search URLs.
- `src/storage.js` wraps browser `localStorage` access with error logging.
- Vite builds the frontend into `dist`; CMake copies the generated UI into the native executable's `web` directory.

The React UI runs inside a privileged `nexora://app/` CEF browser. In the native host, the bridge is exposed only to the main frame whose URL exactly matches the configured UI URL. Bridge commands are sent to the browser process as CEF process messages. The plain Vite preview has no native bridge and cannot render actual browser tabs.

### Native host and website views

- `native/main.cpp` initializes CEF, creates the Win32 top-level window, and runs the CEF message loop.
- `native/app.cpp` currently owns the custom `nexora` scheme handler, bridge registration and command dispatch, browser clients, navigation policy, tab/browser lifecycle, popup routing, viewport positioning, keyboard forwarding, and download handling.
- `native/app.h` declares the application state, including one UI browser and a map of website browsers keyed by tab ID.
- The website browsers are native child windows positioned over the viewport reported by the React UI. The UI browser occupies the main client area behind them.
- CEF is supplied externally; the repository build expects a compatible Windows x64 CEF package and does not build Chromium.

### Build and tests

- `package.json` defines the Vite build, Node test suite, and Windows CMake build/launch scripts.
- `CMakeLists.txt` builds the native executable and copies CEF runtime/resources and the generated UI.
- `scripts/build-windows.ps1` locates CEF and Visual Studio, runs the Vite build, then configures and builds the Windows executable.
- `tests/addressService.test.js` covers address normalization and page-title formatting. There are no native CEF integration tests in the current test suite.

## Verified feature inventory

| Area | Current status |
| --- | --- |
| Website rendering | Implemented through real CEF website browser instances in the native Windows host. Not available in Vite-only preview. |
| Navigation | Native HTTP/HTTPS navigation, back/forward, reload/stop, page title/loading events, and address normalization are implemented. |
| Tabs | Multiple in-memory tabs, activation, closing, reopening recently closed tabs, pinning, reordering, and popup-to-tab routing are present. Tab/session restoration after restart is not implemented. |
| Workspaces | Workspace definitions and active workspace are stored in local storage; tabs are associated with workspaces in memory. Tab collections do not survive restart. |
| Bookmarks | Local-storage-backed bookmark management and toolbar/new-tab shortcuts are present. Bookmark folders and import/export are not implemented. |
| History | Successful native page loads are recorded in local storage. Clearing the list does not clear the CEF profile's cookies or cache. |
| Downloads | Native CEF downloads support progress events, cancellation/retry, configurable location, and open/show-in-folder actions. |
| Internal pages | Bookmarks, history, downloads, settings, and about panels are implemented in the React UI. |
| Search/address | The toolbar supports URL normalization, configured search engines, and local bookmark/history suggestions. Remote search suggestions are not implemented. |
| Keyboard shortcuts | The native browser forwards supported shortcuts to the UI; the UI handles tab and navigation shortcuts. |
| Private browsing | Not implemented. |
| Site permissions | Not implemented. |
| Extension installation | Not implemented. |
| Ad blocking | Not implemented. |
| Split view | Not implemented. |
| Sync and updater | Not implemented. |
| Installer/signing | Not implemented or verified. |

The README contains no merge-conflict markers in the audited worktree. It already documents the existing architecture, available features, and limitations; it now links to this audit.

The highest-impact maintainability issue is concentrated ownership: the UI state/components/styles are monolithic, while native initialization, browser lifecycles, bridge, navigation, and downloads are similarly concentrated in `native/app.cpp`. Refactor these boundaries incrementally; avoid changing the CEF lifecycle and frontend component structure in the same step.

## Security and release blockers

1. **CEF sandbox is explicitly disabled.** `native/main.cpp` sets `CefSettings::no_sandbox = true`. This is a release blocker for an ordinary-user browser. The repository includes the CEF sandbox header but does not currently initialize the sandbox with an inspected, verified CEF distribution. Do not remove the setting or claim sandboxing without implementing and building the supported CEF Windows sandbox setup.
2. **Profile storage is adjacent to the executable.** `cache_path` points to a `profile` directory under the executable directory. This is unsuitable for a normal per-user install and may fail under protected install locations. Move it to a deliberate per-user application-data location with a migration/compatibility plan.
3. **Privacy controls are incomplete.** Clearing the displayed visit list does not clear Chromium cookies/cache; private profiles and site-permission prompts are absent.
4. **Bridge and navigation policy require targeted adversarial validation.** The bridge is gated to the UI main frame and website main-frame navigation is restricted to HTTP/HTTPS, which are useful boundaries. The policy, redirects, popup behavior, local custom scheme, message argument validation, and download path handling still need systematic tests before release.
5. **Native integration lacks automated coverage.** The CEF host, child-window z-order, focus, high-DPI geometry, browser shutdown, and download callbacks have no automated integration suite in the repository.

Do not describe the current build as secure or production-ready until the sandbox, profile placement, permission/privacy behavior, and release packaging have been resolved and verified.

## Implementation plan

1. **Audit and stabilize:** Keep the existing CEF architecture; repair any documentation discrepancies, establish passing frontend tests/build, and capture native build/runtime prerequisites and security blockers.
2. **Modularize the frontend:** Extract app providers/state, window frame, sidebar/workspaces/tabs, toolbar/address bar, panels, and overlays in small behavior-preserving steps. Split styles by feature while keeping shared design tokens centralized.
3. **Modularize native CEF ownership:** Separate initialization, browser lifecycle, navigation/viewport, bridge commands/events, popup handling, and downloads. Preserve the current protocol and validate after each extraction.
4. **Complete core browser behavior:** Add resilient tab/session persistence and startup restore, improve navigation/suggestion behavior, and complete browser settings without silently discarding existing local data.
5. **Polish the interface:** Refine hierarchy, typography, sidebar behavior, animation and native viewport layering; retain the toolbar as the single address/search field and keep the default new-tab page sparse.
6. **Address security and privacy:** Establish supported CEF sandboxing, move profile data to a stable user location, test bridge/navigation/download boundaries, and implement privacy and permissions only with correct native profile semantics.
7. **Evaluate advanced features:** Implement find-in-page and assess ad blocking, extensions, and split view against CEF capabilities. Clearly label unsupported features rather than presenting placeholders as functional.
8. **Release preparation:** Run the complete test suite, perform a clean Windows build with the external CEF distribution, exercise the packaged app, document remaining limitations, and prepare installer/signing work separately.

## Validation status

Validated on 2026-10-16:

- `npm.cmd test`: passed, 7 tests.
- `npm.cmd run build`: passed.
- `npm.cmd run build:windows`: passed and produced `build\windows\Release\nexora.exe` using the external CEF 154 distribution.
- CMake emitted a warning that ATL is not supported by the installed Visual C++ toolchain. It did not prevent this build.

The Windows executable was compiled but not launched or exercised against live sites in this audit. The successful native build does not resolve the sandbox/profile blockers or establish release readiness.
