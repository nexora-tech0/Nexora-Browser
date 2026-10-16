<<<<<<< HEAD
# Nexora-Browser
A Browser with good appearance and customization with built in Ad-Blocker (Prototype)
=======
# Nexora Browser

Nexora is a Windows x64 desktop browser prototype. Its React interface is hosted by a native C++ application and real websites are rendered by the Chromium Embedded Framework (CEF). The checked-in project does not contain the CEF distribution; the build uses the compatible CEF package already extracted on this development machine.

## Requirements

- Windows 10/11 x64
- Node.js and npm
- Visual Studio 2026 with the Desktop development with C++ workload and Windows SDK
- CMake installed with Visual Studio
- CEF 154 Windows x64 binary distribution

The build script looks for CEF under `F:\Nexora-CEF`. To use another extraction, set `CEF_ROOT` or pass `-CefRoot` to the PowerShell script. It does not download CEF or install system tools.

## CEF source and examples

The extracted CEF 154 package already includes the source needed to build a CEF
application: public API headers in `include`, the C++ wrapper implementation in
`libcef_dll`, and upstream sample applications in `tests\cefsimple` and
`tests\cefclient`. The Nexora build uses the headers and wrapper directly, and
its Windows manifest is based on the bundled `cefsimple` sample. These files
are available under
`F:\Nexora-CEF\cef_binary_154.0.32+g682c378+chromium-154.0.8037.58_windows64`.

CEF is the prebuilt Chromium engine and its supported embedding API; a separate
Chromium source checkout is not required to build or extend Nexora's browser
features. Chromium source is only needed for changes inside the engine itself,
and cannot be usefully assembled from a few standalone files because it has a
large, coordinated source tree and build dependency set. Keep the CEF package
external to this repository and use its samples as implementation references
rather than copying the sample applications wholesale.

## Build and launch the native browser

From PowerShell in the project directory:

```powershell
npm.cmd run build:windows
```

To build and launch:

```powershell
npm.cmd run start:windows
```

The browser executable and required CEF runtime files are placed in `build\windows\Release`. The CEF profile is kept beside the executable in `build\windows\Release\profile`. For a custom CEF location:

```powershell
$env:CEF_ROOT = 'F:\path\to\cef_binary_windows64'
npm.cmd run start:windows
```

The UI-only Vite prototype can still be run separately:

```powershell
npm.cmd run dev
```

## Browser capabilities

- Chromium-backed website rendering and URL/search navigation
- Multiple live CEF browser instances managed as Nexora tabs
- Back, forward, reload, stop, page titles, loading state, and browser keyboard shortcuts
- Pop-ups routed into Nexora tabs
- Local bookmarks and settings stored by the app UI
- Visit records captured after successful page loads in Nexora
- Real CEF downloads with progress, cancel, retry, open-file, and show-in-folder actions
- A configurable download folder and persistent download records in the CEF profile
- Local internal pages for bookmarks, recent activity, downloads, and settings

The native bridge is injected only into Nexora's packaged local UI page. Download file actions are limited to files within folders explicitly configured for downloads. Website renderers do not receive the bridge or arbitrary filesystem/process access, and Chromium web security remains enabled.

## Known limitations

- This is a development build, not a signed or packaged installer.
- The current CEF setup runs without the Chromium sandbox because the extracted binary distribution does not include the sandbox library. Do not distribute it as a production browser; sandbox support and installer hardening are required first.
- Browser history shown in Nexora records successful navigations made in this app; it is separate from Chrome/other browsers and clearing this list does not erase cookies or cache.
- Site permission prompts, extension installation, sync, and update delivery are not implemented.
- The CEF runtime is provided separately and is not committed to the repository.
>>>>>>> 73cb182 (Initial Nexora Browser commit)
