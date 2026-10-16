#pragma once

#include <filesystem>
#include <map>
#include <string>
#include <vector>

#include <windows.h>

#include "include/cef_app.h"
#include "include/cef_client.h"
#include "include/cef_download_handler.h"
#include "include/cef_download_item.h"
#include "include/cef_keyboard_handler.h"
#include "include/cef_render_process_handler.h"
#include "include/cef_values.h"

class NexoraApp final : public CefApp, public CefRenderProcessHandler {
 public:
  explicit NexoraApp(std::string ui_url);
  const std::string& ui_url() const { return ui_url_; }

  CefRefPtr<CefRenderProcessHandler> GetRenderProcessHandler() override;
  void OnRegisterCustomSchemes(CefRawPtr<CefSchemeRegistrar> registrar) override;
  void OnContextCreated(CefRefPtr<CefBrowser> browser,
                        CefRefPtr<CefFrame> frame,
                        CefRefPtr<CefV8Context> context) override;

  void SetWindow(HWND window);
  bool RegisterUiSchemeHandler();
  void CreateUiBrowser();
  void HandleUiCommand(CefRefPtr<CefListValue> args);
  void OnBrowserCreated(const std::string& tab_id,
                        bool is_ui,
                        CefRefPtr<CefBrowser> browser);
  void OnBrowserClosed(const std::string& tab_id,
                       bool is_ui,
                       CefRefPtr<CefBrowser> browser);
  bool CanNavigate(CefRefPtr<CefBrowser> browser,
                   CefRefPtr<CefFrame> frame,
                   const std::string& url,
                   bool is_ui) const;
  void SendPageEvent(CefRefPtr<CefBrowser> browser,
                     const std::string& type,
                     const std::string& tab_id,
                     const std::string& url = {},
                     const std::string& title = {},
                     bool loading = false,
                     bool can_go_back = false,
                     bool can_go_forward = false);
  void SendPopupEvent(const std::string& url);
  void SendShortcut(const CefKeyEvent& event);
  void ResizeUiBrowser();
  void CloseAllSiteBrowsers();
  void WindowAction(const std::string& action);
  void BeforeDownload(CefRefPtr<CefBrowser> browser,
                      const std::string& tab_id,
                      CefRefPtr<CefDownloadItem> item,
                      const CefString& suggested_name,
                      CefRefPtr<CefBeforeDownloadCallback> callback);
  void DownloadUpdated(CefRefPtr<CefBrowser> browser,
                       const std::string& tab_id,
                       CefRefPtr<CefDownloadItem> item,
                       CefRefPtr<CefDownloadItemCallback> callback);

 private:
  void ActivateTab(const std::string& tab_id, const std::string& url);
  void NavigateTab(const std::string& tab_id, const std::string& url);
  void UpdateViewport(const std::string& tab_id,
                      int x,
                      int y,
                      int width,
                      int height,
                      bool visible);
  void CloseTab(const std::string& tab_id);
  void SetDownloadDirectory(const std::string& path);
  void ChooseDownloadDirectory();
  void CancelDownload(const std::string& id);
  void RetryDownload(const std::string& id, const std::string& url);
  void OpenDownload(const std::string& path, bool show_in_folder);
  void SendDownloadDirectory(const std::string& error = {});
  void UpdateSiteVisibility();
  void CloseUiBrowser();
  HWND window_ = nullptr;
  std::string ui_url_;
  std::string active_tab_id_;
  std::map<std::string, CefRefPtr<CefBrowser>> site_browsers_;
  std::map<std::string, CefRefPtr<CefClient>> site_clients_;
  std::map<std::string, std::string> pending_urls_;
  std::map<uint32_t, CefRefPtr<CefDownloadItemCallback>> download_callbacks_;
  std::map<uint32_t, std::string> download_urls_;
  std::map<uint32_t, std::string> download_tabs_;
  std::filesystem::path download_directory_;
  std::vector<std::filesystem::path> download_roots_;
  CefRefPtr<CefBrowser> ui_browser_;
  CefRefPtr<CefClient> ui_client_;
  RECT viewport_{};
  bool viewport_visible_ = false;
  bool closing_ = false;

  IMPLEMENT_REFCOUNTING(NexoraApp);
  DISALLOW_COPY_AND_ASSIGN(NexoraApp);
};

std::string GetExecutableDirectory();
std::string GetApplicationUiUrl();
