# Nexora Browser

Nexora is a Windows x64 desktop browser built with a React/Vite interface and a native C++ host using the Chromium Embedded Framework (CEF). Website content is rendered by real CEF browser instances; the Vite-only development server is an interface preview and does not provide Chromium website rendering.

This repository is an active development build, not a signed installer or a production-ready secure browser. See the [architecture audit](docs/ARCHITECTURE.md) for verified capabilities, known limitations, and the recommended implementation order.

## Requirements

- Windows 10/11 x64
- Node.js and npm
- Visual Studio 2026 with the Desktop development with C++ workload and Windows SDK
- CMake installed with Visual Studio
- A compatible CEF 154 Windows x64 binary distribution

The build script searches `F:\Nexora-CEF` by default. To use a different extracted CEF distribution, set `CEF_ROOT` or pass `-CefRoot` to the PowerShell build script. The script does not download CEF or install system tools.

## CEF package

The external CEF distribution provides the public API headers, C++ wrapper implementation, runtime, resources, and upstream samples used to build Nexora. A separate Chromium source checkout is not required for ordinary browser features; changing Chromium itself would require the complete, coordinated Chromium source tree and its build environment. Keep the CEF package external to this repository.

## Build and run

From PowerShell in the project directory:

```powershell
npm.cmd run build:windows
```

Build and launch:

```powershell
npm.cmd run start:windows
```

The executable and packaged CEF files are produced under `build\windows\Release`. For a non-default CEF location:

```powershell
$env:CEF_ROOT = 'F:\path\to\cef_binary_windows64'
npm.cmd run start:windows
```

To run only the React interface preview:

```powershell
npm.cmd run dev
```

The Vite preview is not connected to CEF and cannot render external websites as browser tabs.

Run the current Node.js unit tests:

```powershell
npm.cmd test
```

The current automated suite covers URL normalization and page-title formatting only. It does not replace native CEF integration testing.

## Implemented capabilities

- Real HTTP/HTTPS rendering through CEF in the native Windows application
- Multiple browser tabs with navigation, back/forward, reload/stop, loading and title events
- Address/search bar, configured search engine, and local bookmark/history suggestions
- Workspaces, vertical tabs, pinning, reordering, context menus, and keyboard shortcuts
- Persistent bookmarks, settings, workspaces, history, and download records in the trusted UI's local storage
- Native CEF downloads with progress, cancel/retry, a configurable folder, and open/show-in-folder actions
- Popup routing into browser tabs
- Local internal pages for bookmarks, history, downloads, settings, and browser information
- A sparse new-tab page with Nexora identity and bookmark shortcuts; the toolbar remains the only address/search field

## Security and known limitations

- **Not production-ready:** `native/main.cpp` explicitly sets `no_sandbox = true`. The external CEF runtime inspected for this build does not include an obvious sandbox library. Do not distribute this build as a secure everyday browser; verify and implement a supported CEF sandbox configuration first.
- Site permission prompts and stored permission decisions are not implemented.
- Private browsing, extension installation, sync, update delivery, and ad blocking are not implemented.
- Tabs and tab navigation state are not restored after restart. Workspace definitions persist, but the tab collection is currently in memory.
- History records successful Nexora page loads. Clearing that list does not clear cookies, cache, or other CEF profile data.
- The browser profile currently resides beside the executable in the build output, not in a stable per-user application-data location.
- The native browser UI and bridge are implemented in a small number of large files; automated unit/integration tests and a signed installer are not yet present.
- The native window uses a separate child CEF view for website content. Focus, layering, resize, and high-DPI behavior need further native integration testing.
- The CEF runtime is supplied separately and is not committed to this repository.

Do not interpret a successful frontend or native build as proof that these release blockers have been resolved. Consult the [architecture audit](docs/ARCHITECTURE.md) before taking on larger refactors.
