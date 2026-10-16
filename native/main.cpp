#include "app.h"

#include <filesystem>
#include <string>
#include <cwchar>

#include <windows.h>
#include <windowsx.h>

#include "include/cef_app.h"
#include "include/cef_command_line.h"
#include "include/cef_sandbox_win.h"

namespace {

constexpr wchar_t kWindowClass[] = L"NexoraBrowserWindow";
constexpr UINT kResizeUiMessage = WM_APP + 1;

CefRefPtr<NexoraApp> g_app;
HWND g_window = nullptr;

LRESULT CALLBACK WindowProc(HWND window,
                            UINT message,
                            WPARAM wparam,
                            LPARAM lparam) {
  switch (message) {
    case WM_SIZE:
      if (g_app) {
        g_app->ResizeUiBrowser();
      }
      return 0;
    case WM_CLOSE:
      if (g_app) {
        g_app->CloseAllSiteBrowsers();
        return 0;
      }
      DestroyWindow(window);
      return 0;
    case WM_DESTROY:
      g_window = nullptr;
      PostQuitMessage(0);
      return 0;
    case kResizeUiMessage:
      if (g_app) {
        g_app->ResizeUiBrowser();
      }
      return 0;
    case WM_NCHITTEST: {
      const LRESULT hit = DefWindowProcW(window, message, wparam, lparam);
      if (hit != HTCLIENT) {
        return hit;
      }
      POINT point{GET_X_LPARAM(lparam), GET_Y_LPARAM(lparam)};
      ScreenToClient(window, &point);
      if (point.y >= 0 && point.y < 7) {
        return HTTOP;
      }
      if (point.y >= 7 && point.y < 14) {
        return HTCAPTION;
      }
      return HTCLIENT;
    }
    default:
      return DefWindowProcW(window, message, wparam, lparam);
  }
}

bool CreateMainWindow(HINSTANCE instance) {
  WNDCLASSEXW window_class{};
  window_class.cbSize = sizeof(window_class);
  window_class.hInstance = instance;
  window_class.lpfnWndProc = WindowProc;
  window_class.lpszClassName = kWindowClass;
  window_class.hCursor = LoadCursorW(nullptr, IDC_ARROW);
  window_class.hIcon = LoadIconW(nullptr, IDI_APPLICATION);
  window_class.hbrBackground = static_cast<HBRUSH>(GetStockObject(BLACK_BRUSH));

  if (!RegisterClassExW(&window_class) && GetLastError() != ERROR_CLASS_ALREADY_EXISTS) {
    return false;
  }

  constexpr DWORD style = WS_POPUP | WS_THICKFRAME | WS_MINIMIZEBOX |
                          WS_MAXIMIZEBOX | WS_SYSMENU;
  RECT bounds{0, 0, 1280, 820};
  AdjustWindowRectEx(&bounds, style, FALSE, 0);
  const int width = bounds.right - bounds.left;
  const int height = bounds.bottom - bounds.top;
  const int x = (GetSystemMetrics(SM_CXSCREEN) - width) / 2;
  const int y = (GetSystemMetrics(SM_CYSCREEN) - height) / 2;

  g_window = CreateWindowExW(0, kWindowClass, L"Nexora Browser", style,
                             x, y, width, height, nullptr, nullptr, instance, nullptr);
  if (!g_window) {
    return false;
  }
  g_app->SetWindow(g_window);
  ShowWindow(g_window, SW_SHOW);
  UpdateWindow(g_window);
  g_app->CreateUiBrowser();
  return true;
}

}  // namespace

int APIENTRY wWinMain(HINSTANCE instance,
                      HINSTANCE,
                      wchar_t*,
                      int) {
  SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
  CefMainArgs main_args(instance);
  g_app = new NexoraApp(GetApplicationUiUrl());

  const int subprocess_exit_code = CefExecuteProcess(main_args, g_app, nullptr);
  if (subprocess_exit_code >= 0) {
    return subprocess_exit_code;
  }

  CefSettings settings;
  settings.no_sandbox = true;
  settings.windowless_rendering_enabled = false;
  settings.log_severity = LOGSEVERITY_WARNING;
  wchar_t devtools_port[8]{};
  const DWORD devtools_port_length =
      GetEnvironmentVariableW(L"NEXORA_DEVTOOLS_PORT", devtools_port,
                              static_cast<DWORD>(std::size(devtools_port)));
  if (devtools_port_length > 0 && devtools_port_length < std::size(devtools_port)) {
    wchar_t* end = nullptr;
    const long port = std::wcstol(devtools_port, &end, 10);
    if (end != devtools_port && *end == L'\0' && port >= 1024 && port <= 65535) {
      settings.remote_debugging_port = static_cast<int>(port);
    }
  }
  CefString(&settings.browser_subprocess_path) =
      (std::filesystem::path(GetExecutableDirectory()) / L"nexora.exe").wstring();
  CefString(&settings.resources_dir_path) = GetExecutableDirectory();
  CefString(&settings.locales_dir_path) =
      (std::filesystem::path(GetExecutableDirectory()) / L"locales").wstring();
  CefString(&settings.cache_path) =
      (std::filesystem::path(GetExecutableDirectory()) / L"profile").wstring();

  if (!CefInitialize(main_args, settings, g_app, nullptr)) {
    return EXIT_FAILURE;
  }

  if (!g_app->RegisterUiSchemeHandler()) {
    CefShutdown();
    return EXIT_FAILURE;
  }

  if (!CreateMainWindow(instance)) {
    CefShutdown();
    return EXIT_FAILURE;
  }

  CefRunMessageLoop();
  CefShutdown();
  return EXIT_SUCCESS;
}
