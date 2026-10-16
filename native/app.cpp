#include "app.h"

#include <algorithm>
#include <cctype>
#include <climits>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iterator>
#include <shlobj.h>
#include <shellapi.h>
#include <vector>

#include <windows.h>

#include "include/cef_browser.h"
#include "include/cef_frame.h"
#include "include/cef_keyboard_handler.h"
#include "include/cef_life_span_handler.h"
#include "include/cef_load_handler.h"
#include "include/cef_process_message.h"
#include "include/cef_parser.h"
#include "include/cef_request.h"
#include "include/cef_request_handler.h"
#include "include/cef_values.h"
#include "include/cef_v8.h"
#include "include/cef_scheme.h"
#include "include/cef_response.h"
#include "include/cef_resource_handler.h"
#include "include/cef_callback.h"
#include "include/cef_version.h"

namespace {

constexpr char kCommandMessage[] = "nexora:command";

std::string MimeTypeForPath(const std::filesystem::path& path) {
  std::string extension = path.extension().string();
  std::transform(extension.begin(), extension.end(), extension.begin(),
                 [](unsigned char value) { return static_cast<char>(std::tolower(value)); });
  if (extension == ".html") return "text/html";
  if (extension == ".js" || extension == ".mjs") return "text/javascript";
  if (extension == ".css") return "text/css";
  if (extension == ".svg") return "image/svg+xml";
  if (extension == ".png") return "image/png";
  if (extension == ".jpg" || extension == ".jpeg") return "image/jpeg";
  if (extension == ".woff") return "font/woff";
  if (extension == ".woff2") return "font/woff2";
  if (extension == ".json") return "application/json";
  return "application/octet-stream";
}

class UiResourceHandler final : public CefResourceHandler {
 public:
  explicit UiResourceHandler(std::filesystem::path root)
      : root_(std::move(root)) {}

  bool Open(CefRefPtr<CefRequest> request,
            bool& handle_request,
            CefRefPtr<CefCallback>) override {
    handle_request = true;
    status_ = 404;
    mime_type_ = "text/plain";
    body_ = {'N', 'o', 't', ' ', 'f', 'o', 'u', 'n', 'd'};

    if (!request || (request->GetMethod() != "GET" && request->GetMethod() != "HEAD")) {
      status_ = 405;
      body_ = {'M', 'e', 't', 'h', 'o', 'd', ' ', 'n', 'o', 't', ' ', 'a', 'l', 'l', 'o', 'w', 'e', 'd'};
      return true;
    }

    CefURLParts url_parts;
    const CefString request_url = request->GetURL();
    if (!CefParseURL(request_url, url_parts) ||
        CefString(&url_parts.scheme) != "nexora" ||
        CefString(&url_parts.host) != "app") {
      return true;
    }
    const std::string encoded_path = CefString(&url_parts.path).ToString();
    const CefString decoded_path = CefURIDecode(
        encoded_path, true, UU_URL_SPECIAL_CHARS_EXCEPT_PATH_SEPARATORS);
    std::string relative_path = decoded_path.ToString();
    std::replace(relative_path.begin(), relative_path.end(), '\\', '/');
    if (relative_path.empty() || relative_path == "/") {
      relative_path = "/index.html";
    }
    if (relative_path.front() != '/' ||
        relative_path.find("/../") != std::string::npos ||
        relative_path.ends_with("/..") ||
        relative_path.find('\0') != std::string::npos) {
      return true;
    }

    std::error_code error;
    const std::filesystem::path root = std::filesystem::canonical(root_, error);
    if (error) {
      return false;
    }
    const std::filesystem::path file =
        std::filesystem::canonical(root / std::filesystem::u8path(relative_path.substr(1)), error);
    if (error || !std::filesystem::is_regular_file(file, error) || error) {
      return true;
    }
    auto root_part = root.begin();
    auto file_part = file.begin();
    for (; root_part != root.end() && file_part != file.end(); ++root_part, ++file_part) {
      if (*root_part != *file_part) {
        return true;
      }
    }
    if (root_part != root.end()) {
      return true;
    }

    std::ifstream stream(file, std::ios::binary);
    if (!stream) {
      return false;
    }
    body_.assign(std::istreambuf_iterator<char>(stream),
                 std::istreambuf_iterator<char>());
    status_ = 200;
    mime_type_ = MimeTypeForPath(file);
    head_only_ = request->GetMethod() == "HEAD";
    return true;
  }

  void GetResponseHeaders(CefRefPtr<CefResponse> response,
                          int64_t& response_length,
                          CefString&) override {
    response->SetStatus(status_);
    response->SetStatusText(status_ == 200 ? "OK" : status_ == 405 ? "Method Not Allowed" : "Not Found");
    response->SetMimeType(mime_type_);
    response->SetHeaderByName("X-Content-Type-Options", "nosniff", true);
    response->SetHeaderByName("Cache-Control", "no-store", true);
    response_length = static_cast<int64_t>(body_.size());
  }

  bool Read(void* data_out,
            int bytes_to_read,
            int& bytes_read,
            CefRefPtr<CefResourceReadCallback>) override {
    if (head_only_ || offset_ >= body_.size() || bytes_to_read <= 0) {
      bytes_read = 0;
      return false;
    }
    const size_t count = std::min(
        body_.size() - offset_, static_cast<size_t>(bytes_to_read));
    std::copy_n(body_.data() + offset_, count, static_cast<char*>(data_out));
    offset_ += count;
    bytes_read = static_cast<int>(count);
    return true;
  }

  void Cancel() override {}

 private:
  std::filesystem::path root_;
  std::vector<char> body_;
  std::string mime_type_;
  size_t offset_ = 0;
  int status_ = 404;
  bool head_only_ = false;

  IMPLEMENT_REFCOUNTING(UiResourceHandler);
  DISALLOW_COPY_AND_ASSIGN(UiResourceHandler);
};

class UiSchemeHandlerFactory final : public CefSchemeHandlerFactory {
 public:
  explicit UiSchemeHandlerFactory(std::filesystem::path root)
      : root_(std::move(root)) {}

  CefRefPtr<CefResourceHandler> Create(CefRefPtr<CefBrowser>,
                                       CefRefPtr<CefFrame>,
                                       const CefString&,
                                       CefRefPtr<CefRequest>) override {
    return new UiResourceHandler(root_);
  }

 private:
  std::filesystem::path root_;

  IMPLEMENT_REFCOUNTING(UiSchemeHandlerFactory);
  DISALLOW_COPY_AND_ASSIGN(UiSchemeHandlerFactory);
};

std::string SerializeDictionary(CefRefPtr<CefDictionaryValue> dictionary) {
  CefRefPtr<CefValue> value = CefValue::Create();
  value->SetDictionary(dictionary);
  return CefWriteJSON(value, JSON_WRITER_DEFAULT).ToString();
}

bool IsWebUrl(const std::string& url) {
  CefURLParts parts;
  if (!CefParseURL(url, parts)) {
    return false;
  }
  std::string scheme = CefString(&parts.scheme).ToString();
  std::transform(scheme.begin(), scheme.end(), scheme.begin(),
                 [](unsigned char value) { return static_cast<char>(std::tolower(value)); });
  return scheme == "http" || scheme == "https";
}

bool IsWithinDirectory(const std::filesystem::path& file,
                       const std::filesystem::path& directory) {
  std::error_code error;
  const auto canonical_file = std::filesystem::canonical(file, error);
  if (error) return false;
  const auto canonical_directory = std::filesystem::canonical(directory, error);
  if (error) return false;
  auto file_part = canonical_file.begin();
  auto directory_part = canonical_directory.begin();
  for (; directory_part != canonical_directory.end(); ++directory_part, ++file_part) {
    if (file_part == canonical_file.end() || *file_part != *directory_part) {
      return false;
    }
  }
  return true;
}

std::filesystem::path DefaultDownloadDirectory() {
  PWSTR known_folder = nullptr;
  if (SUCCEEDED(SHGetKnownFolderPath(FOLDERID_Downloads, KF_FLAG_CREATE,
                                    nullptr, &known_folder)) &&
      known_folder) {
    const std::filesystem::path result(known_folder);
    CoTaskMemFree(known_folder);
    return result;
  }
  if (known_folder) CoTaskMemFree(known_folder);
  return std::filesystem::path(GetExecutableDirectory()) / L"Downloads";
}

class BridgeFunction final : public CefV8Handler {
 public:
  BridgeFunction() = default;

  bool Execute(const CefString& name,
               CefRefPtr<CefV8Value>,
               const CefV8ValueList& arguments,
               CefRefPtr<CefV8Value>&,
               CefString&) override {
    if (arguments.size() > 6) {
      return true;
    }
    CefRefPtr<CefProcessMessage> message =
        CefProcessMessage::Create(kCommandMessage);
    CefRefPtr<CefListValue> values = message->GetArgumentList();
    values->SetString(0, name);
    for (size_t index = 0; index < arguments.size(); ++index) {
      const auto& value = arguments[index];
      const int argument_index = static_cast<int>(index) + 1;
      if (value->IsString()) {
        values->SetString(argument_index, value->GetStringValue());
      } else if (value->IsBool()) {
        values->SetBool(argument_index, value->GetBoolValue());
      } else if (value->IsInt() || value->IsUInt()) {
        values->SetInt(argument_index, value->GetIntValue());
      } else if (value->IsDouble()) {
        const double number = value->GetDoubleValue();
        if (!std::isfinite(number) || std::abs(number) > 100000) {
          return true;
        }
        values->SetDouble(argument_index, number);
      } else {
        return true;
      }
    }
    CefV8Context::GetCurrentContext()->GetBrowser()->GetMainFrame()->SendProcessMessage(
        PID_BROWSER, message);
    return true;
  }

 private:
  IMPLEMENT_REFCOUNTING(BridgeFunction);
  DISALLOW_COPY_AND_ASSIGN(BridgeFunction);
};

class BrowserClient final : public CefClient,
                            public CefDisplayHandler,
                            public CefLifeSpanHandler,
                            public CefLoadHandler,
                            public CefRequestHandler,
                            public CefKeyboardHandler,
                            public CefDownloadHandler {
 public:
  BrowserClient(NexoraApp* app, std::string tab_id, bool is_ui)
      : app_(app), tab_id_(std::move(tab_id)), is_ui_(is_ui) {}

  CefRefPtr<CefDisplayHandler> GetDisplayHandler() override { return this; }
  CefRefPtr<CefLifeSpanHandler> GetLifeSpanHandler() override { return this; }
  CefRefPtr<CefLoadHandler> GetLoadHandler() override { return this; }
  CefRefPtr<CefRequestHandler> GetRequestHandler() override { return this; }
  CefRefPtr<CefKeyboardHandler> GetKeyboardHandler() override { return this; }
  CefRefPtr<CefDownloadHandler> GetDownloadHandler() override { return this; }

  bool OnProcessMessageReceived(CefRefPtr<CefBrowser> browser,
                                CefRefPtr<CefFrame> frame,
                                CefProcessId source_process,
                                CefRefPtr<CefProcessMessage> message) override {
    if (is_ui_ && source_process == PID_RENDERER &&
        frame->IsMain() && frame->GetURL() == app_->ui_url()) {
      if (message->GetName() == kCommandMessage) {
        app_->HandleUiCommand(message->GetArgumentList());
        return true;
      }
    }
    return false;
  }

  bool OnBeforeBrowse(CefRefPtr<CefBrowser> browser,
                      CefRefPtr<CefFrame> frame,
                      CefRefPtr<CefRequest> request,
                      bool,
                      bool) override {
    return !app_->CanNavigate(browser, frame, request->GetURL().ToString(), is_ui_);
  }

  bool OnBeforePopup(CefRefPtr<CefBrowser>,
                     CefRefPtr<CefFrame>,
                     int,
                     const CefString& target_url,
                     const CefString&,
                     CefLifeSpanHandler::WindowOpenDisposition,
                     bool user_gesture,
                     const CefPopupFeatures&,
                     CefWindowInfo&,
                     CefRefPtr<CefClient>&,
                     CefBrowserSettings&,
                     CefRefPtr<CefDictionaryValue>&,
                     bool*) override {
    if (!is_ui_ && user_gesture && IsWebUrl(target_url.ToString())) {
      app_->SendPopupEvent(target_url.ToString());
    }
    return true;
  }

  void OnAfterCreated(CefRefPtr<CefBrowser> browser) override {
    app_->OnBrowserCreated(tab_id_, is_ui_, browser);
  }

  void OnBeforeClose(CefRefPtr<CefBrowser> browser) override {
    app_->OnBrowserClosed(tab_id_, is_ui_, browser);
  }

  void OnAddressChange(CefRefPtr<CefBrowser> browser,
                       CefRefPtr<CefFrame> frame,
                       const CefString& url) override {
    if (!is_ui_ && frame->IsMain()) {
      app_->SendPageEvent(browser, "navigation", tab_id_, url.ToString());
    }
  }

  void OnTitleChange(CefRefPtr<CefBrowser> browser,
                     const CefString& title) override {
    if (!is_ui_) {
      app_->SendPageEvent(browser, "title", tab_id_, {}, title.ToString());
    }
  }

  void OnLoadingStateChange(CefRefPtr<CefBrowser> browser,
                            bool is_loading,
                            bool can_go_back,
                            bool can_go_forward) override {
    if (!is_ui_) {
      app_->SendPageEvent(browser, "loading", tab_id_, {}, {},
                          is_loading, can_go_back, can_go_forward);
    }
  }

  void OnLoadEnd(CefRefPtr<CefBrowser> browser,
                 CefRefPtr<CefFrame> frame,
                 int) override {
    if (!is_ui_ && frame->IsMain()) {
      app_->SendPageEvent(browser, "loaded", tab_id_,
                          frame->GetURL().ToString());
    }
  }

  void OnLoadError(CefRefPtr<CefBrowser> browser,
                   CefRefPtr<CefFrame> frame,
                   ErrorCode error_code,
                   const CefString& error_text,
                   const CefString& failed_url) override {
    if (!is_ui_ && frame->IsMain() && error_code != ERR_ABORTED) {
      app_->SendPageEvent(browser, "error", tab_id_,
                          failed_url.ToString(), error_text.ToString());
    }
  }

  bool OnBeforeDownload(CefRefPtr<CefBrowser> browser,
                        CefRefPtr<CefDownloadItem> download_item,
                        const CefString& suggested_name,
                        CefRefPtr<CefBeforeDownloadCallback> callback) override {
    if (is_ui_ || !download_item || !callback) return false;
    app_->BeforeDownload(browser, tab_id_, download_item, suggested_name,
                         callback);
    return true;
  }

  void OnDownloadUpdated(CefRefPtr<CefBrowser> browser,
                         CefRefPtr<CefDownloadItem> download_item,
                         CefRefPtr<CefDownloadItemCallback> callback) override {
    if (!is_ui_ && download_item) {
      app_->DownloadUpdated(browser, tab_id_, download_item, callback);
    }
  }

  bool OnPreKeyEvent(CefRefPtr<CefBrowser>,
                     const CefKeyEvent& event,
                     CefEventHandle,
                     bool*) override {
    if (is_ui_ || event.type != KEYEVENT_RAWKEYDOWN) {
      return false;
    }
    const bool control = (event.modifiers & EVENTFLAG_CONTROL_DOWN) != 0;
    const bool shift = (event.modifiers & EVENTFLAG_SHIFT_DOWN) != 0;
    const bool alt = (event.modifiers & EVENTFLAG_ALT_DOWN) != 0;
    const int key = event.windows_key_code;
    const bool browser_shortcut =
        (control && (key == 'L' || key == 'T' || key == 'W' || key == 'R' ||
                     key == VK_TAB)) ||
        (control && shift && key == 'T') || (alt && shift && (key == 'B' || key == 'C'));
    if (browser_shortcut) {
      app_->SendShortcut(event);
      return true;
    }
    return false;
  }

 private:
  NexoraApp* app_;
  std::string tab_id_;
  bool is_ui_;

  IMPLEMENT_REFCOUNTING(BrowserClient);
  DISALLOW_COPY_AND_ASSIGN(BrowserClient);
};

}  // namespace

NexoraApp::NexoraApp(std::string ui_url) : ui_url_(std::move(ui_url)) {
  download_directory_ = DefaultDownloadDirectory();
  download_roots_.push_back(download_directory_);
}

CefRefPtr<CefRenderProcessHandler> NexoraApp::GetRenderProcessHandler() {
  return this;
}

void NexoraApp::OnRegisterCustomSchemes(CefRawPtr<CefSchemeRegistrar> registrar) {
  registrar->AddCustomScheme(
      "nexora",
      CEF_SCHEME_OPTION_STANDARD | CEF_SCHEME_OPTION_SECURE |
          CEF_SCHEME_OPTION_DISPLAY_ISOLATED | CEF_SCHEME_OPTION_CORS_ENABLED |
          CEF_SCHEME_OPTION_FETCH_ENABLED);
}

void NexoraApp::OnContextCreated(CefRefPtr<CefBrowser> browser,
                                 CefRefPtr<CefFrame> frame,
                                 CefRefPtr<CefV8Context> context) {
  if (!frame->IsMain() || frame->GetURL() != ui_url_) {
    return;
  }

  CefRefPtr<CefV8Value> bridge = CefV8Value::CreateObject(nullptr, nullptr);
  CefRefPtr<CefV8Value> native_value = CefV8Value::CreateBool(true);
  bridge->SetValue("isNative", native_value, V8_PROPERTY_ATTRIBUTE_READONLY);
  CefRefPtr<CefV8Value> version_value =
      CefV8Value::CreateString(CEF_VERSION);
  bridge->SetValue("cefVersion", version_value, V8_PROPERTY_ATTRIBUTE_READONLY);
  CefRefPtr<BridgeFunction> handler = new BridgeFunction();
  const std::vector<std::string> functions = {
      "navigate", "activate", "closeTab", "back", "forward",
      "reload", "stop", "setViewport", "windowAction",
      "setDownloadDirectory", "chooseDownloadDirectory", "cancelDownload",
      "retryDownload", "openDownload", "showDownloadInFolder"};
  for (const auto& name : functions) {
    CefRefPtr<CefV8Value> function =
        CefV8Value::CreateFunction(name, handler);
    bridge->SetValue(name, function, V8_PROPERTY_ATTRIBUTE_READONLY);
  }
  context->GetGlobal()->SetValue("nexora", bridge, V8_PROPERTY_ATTRIBUTE_READONLY);
}

void NexoraApp::SetWindow(HWND window) {
  window_ = window;
}

bool NexoraApp::RegisterUiSchemeHandler() {
  const std::filesystem::path web_root =
      std::filesystem::path(GetExecutableDirectory()) / L"web";
  return CefRegisterSchemeHandlerFactory(
      "nexora", "app", new UiSchemeHandlerFactory(web_root));
}

void NexoraApp::CreateUiBrowser() {
  CefWindowInfo window_info;
  RECT bounds{};
  GetClientRect(window_, &bounds);
  window_info.SetAsChild(window_, CefRect(bounds.left, bounds.top,
                                          bounds.right - bounds.left,
                                          bounds.bottom - bounds.top));
  CefBrowserSettings browser_settings;
  ui_client_ = new BrowserClient(this, {}, true);
  CefBrowserHost::CreateBrowser(window_info, ui_client_, ui_url_,
                                browser_settings, nullptr, nullptr);
}

void NexoraApp::HandleUiCommand(CefRefPtr<CefListValue> args) {
  if (!args || args->GetSize() < 1 || args->GetType(0) != VTYPE_STRING) {
    return;
  }
  const std::string command = args->GetString(0).ToString();
  const auto string_arg = [&args](size_t index) {
    return index < args->GetSize() && args->GetType(index) == VTYPE_STRING
               ? args->GetString(index).ToString()
               : std::string{};
  };

  if (command == "navigate" && args->GetSize() == 3) {
    NavigateTab(string_arg(1), string_arg(2));
  } else if (command == "activate" && args->GetSize() == 3) {
    ActivateTab(string_arg(1), string_arg(2));
  } else if (command == "closeTab" && args->GetSize() == 2) {
    CloseTab(string_arg(1));
  } else if ((command == "back" || command == "forward" ||
              command == "reload" || command == "stop") &&
             args->GetSize() == 2) {
    const auto found = site_browsers_.find(string_arg(1));
    if (found == site_browsers_.end()) {
      return;
    }
    if (command == "back" && found->second->CanGoBack()) {
      found->second->GoBack();
    } else if (command == "forward" && found->second->CanGoForward()) {
      found->second->GoForward();
    } else if (command == "reload") {
      found->second->Reload();
    } else if (command == "stop") {
      found->second->StopLoad();
    }
  } else if (command == "setViewport" && args->GetSize() == 7) {
    const auto number_arg = [&args](size_t index, double& output) {
      if (args->GetType(index) == VTYPE_DOUBLE) {
        output = args->GetDouble(index);
        return true;
      }
      if (args->GetType(index) == VTYPE_INT) {
        output = args->GetInt(index);
        return true;
      }
      return false;
    };
    double x = 0;
    double y = 0;
    double width = 0;
    double height = 0;
    if (!number_arg(2, x) || !number_arg(3, y) ||
        !number_arg(4, width) || !number_arg(5, height) ||
        args->GetType(6) != VTYPE_BOOL) {
      return;
    }
    UpdateViewport(string_arg(1), static_cast<int>(x), static_cast<int>(y),
                   static_cast<int>(width), static_cast<int>(height),
                   args->GetBool(6));
  } else if (command == "windowAction" && args->GetSize() == 2) {
    WindowAction(string_arg(1));
  } else if (command == "setDownloadDirectory" && args->GetSize() == 2) {
    SetDownloadDirectory(string_arg(1));
  } else if (command == "chooseDownloadDirectory" && args->GetSize() == 1) {
    ChooseDownloadDirectory();
  } else if (command == "cancelDownload" && args->GetSize() == 2) {
    CancelDownload(string_arg(1));
  } else if (command == "retryDownload" && args->GetSize() == 3) {
    RetryDownload(string_arg(1), string_arg(2));
  } else if ((command == "openDownload" ||
              command == "showDownloadInFolder") &&
             args->GetSize() == 3) {
    if (args->GetType(2) == VTYPE_STRING) {
      OpenDownload(string_arg(2), command == "showDownloadInFolder");
    }
  }
}

void NexoraApp::OnBrowserCreated(const std::string& tab_id,
                                 bool is_ui,
                                 CefRefPtr<CefBrowser> browser) {
  if (is_ui) {
    ui_browser_ = browser;
    ResizeUiBrowser();
    return;
  }
  site_browsers_[tab_id] = browser;
  UpdateSiteVisibility();
  const auto pending = pending_urls_.find(tab_id);
  if (pending != pending_urls_.end()) {
    browser->GetMainFrame()->LoadURL(pending->second);
    pending_urls_.erase(pending);
  }
}

void NexoraApp::OnBrowserClosed(const std::string& tab_id,
                                bool is_ui,
                                CefRefPtr<CefBrowser>) {
  if (is_ui) {
    ui_browser_ = nullptr;
    if (window_) {
      DestroyWindow(window_);
    }
    return;
  }
  site_browsers_.erase(tab_id);
  site_clients_.erase(tab_id);
  if (closing_ && site_browsers_.empty()) {
    CloseUiBrowser();
  }
}

bool NexoraApp::CanNavigate(CefRefPtr<CefBrowser> browser,
                            CefRefPtr<CefFrame> frame,
                            const std::string& url,
                            bool is_ui) const {
  if (!browser || !frame || !frame->IsMain()) {
    return true;
  }
  if (is_ui) {
    const std::filesystem::path app_directory =
        std::filesystem::path(GetExecutableDirectory()) / L"web";
    std::error_code error;
    if (!std::filesystem::is_directory(app_directory, error) || error) {
      return false;
    }
    return url.rfind("nexora://app/", 0) == 0;
  }
  return IsWebUrl(url);
}

void NexoraApp::SendPageEvent(CefRefPtr<CefBrowser> browser,
                              const std::string& type,
                              const std::string& tab_id,
                              const std::string& url,
                              const std::string& title,
                              bool loading,
                              bool can_go_back,
                              bool can_go_forward) {
  if (!ui_browser_ || !ui_browser_->GetMainFrame() || !browser) {
    return;
  }
  CefRefPtr<CefDictionaryValue> event = CefDictionaryValue::Create();
  event->SetString("type", type);
  event->SetString("tabId", tab_id);
  if (!url.empty()) {
    event->SetString("url", url);
  }
  if (!title.empty()) {
    event->SetString("title", title);
  }
  if (type == "loading") {
    event->SetBool("isLoading", loading);
    event->SetBool("canGoBack", can_go_back);
    event->SetBool("canGoForward", can_go_forward);
  }
  const std::string script =
      "window.dispatchEvent(new CustomEvent('nexora-native',{detail:" +
      SerializeDictionary(event) + "}));";
  ui_browser_->GetMainFrame()->ExecuteJavaScript(script, ui_url_, 0);
}

void NexoraApp::SendPopupEvent(const std::string& url) {
  if (!ui_browser_ || !IsWebUrl(url)) {
    return;
  }
  CefRefPtr<CefDictionaryValue> event = CefDictionaryValue::Create();
  event->SetString("type", "popup");
  event->SetString("url", url);
  const std::string script =
      "window.dispatchEvent(new CustomEvent('nexora-native',{detail:" +
      SerializeDictionary(event) + "}));";
  ui_browser_->GetMainFrame()->ExecuteJavaScript(script, ui_url_, 0);
}

void NexoraApp::SendShortcut(const CefKeyEvent& event) {
  if (!ui_browser_ || !ui_browser_->GetMainFrame()) {
    return;
  }
  const bool control = (event.modifiers & EVENTFLAG_CONTROL_DOWN) != 0;
  const bool shift = (event.modifiers & EVENTFLAG_SHIFT_DOWN) != 0;
  const bool alt = (event.modifiers & EVENTFLAG_ALT_DOWN) != 0;
  const int key_code = event.windows_key_code;
  std::string key;
  if (key_code == VK_TAB) {
    key = "Tab";
  } else {
    key.push_back(static_cast<char>(std::tolower(key_code)));
  }
  const std::string script =
      "window.dispatchEvent(new KeyboardEvent('keydown',{key:'" + key +
      "',ctrlKey:" + (control ? "true" : "false") +
      ",shiftKey:" + (shift ? "true" : "false") +
      ",altKey:" + (alt ? "true" : "false") + ",bubbles:true}));";
  ui_browser_->GetMainFrame()->ExecuteJavaScript(script, ui_url_, 0);
}

void NexoraApp::ResizeUiBrowser() {
  if (!ui_browser_ || !window_) {
    return;
  }
  RECT bounds{};
  GetClientRect(window_, &bounds);
  SetWindowPos(ui_browser_->GetHost()->GetWindowHandle(), HWND_BOTTOM,
               0, 0, bounds.right - bounds.left, bounds.bottom - bounds.top,
               SWP_NOACTIVATE);
  UpdateSiteVisibility();
}

void NexoraApp::CloseAllSiteBrowsers() {
  if (closing_) {
    return;
  }
  closing_ = true;
  if (site_browsers_.empty()) {
    CloseUiBrowser();
    return;
  }
  for (const auto& [tab_id, browser] : site_browsers_) {
    browser->GetHost()->CloseBrowser(true);
  }
}

void NexoraApp::WindowAction(const std::string& action) {
  if (!window_) {
    return;
  }
  if (action == "minimize") {
    ShowWindow(window_, SW_MINIMIZE);
  } else if (action == "maximize") {
    ShowWindow(window_, SW_MAXIMIZE);
  } else if (action == "restore") {
    ShowWindow(window_, SW_RESTORE);
  } else if (action == "toggleMaximize") {
    ShowWindow(window_, IsZoomed(window_) ? SW_RESTORE : SW_MAXIMIZE);
  } else if (action == "close") {
    PostMessageW(window_, WM_CLOSE, 0, 0);
  } else if (action == "drag") {
    ReleaseCapture();
    SendMessageW(window_, WM_NCLBUTTONDOWN, HTCAPTION, 0);
  }
}

void NexoraApp::BeforeDownload(
    CefRefPtr<CefBrowser>,
    const std::string& tab_id,
    CefRefPtr<CefDownloadItem> item,
    const CefString& suggested_name,
    CefRefPtr<CefBeforeDownloadCallback> callback) {
  if (!item || !callback) return;
  const uint32_t id = item->GetId();
  download_urls_[id] = item->GetURL().ToString();
  download_tabs_[id] = tab_id;

  std::string name = suggested_name.ToString();
  std::replace_if(name.begin(), name.end(),
                  [](unsigned char value) {
                    return value < 32 || value == '<' || value == '>' ||
                           value == ':' || value == '"' || value == '/' ||
                           value == '\\' || value == '|' || value == '?' ||
                           value == '*';
                  },
                  '_');
  while (!name.empty() && (name.back() == '.' || name.back() == ' ')) {
    name.pop_back();
  }
  if (name.empty() || name == "." || name == "..") name = "download";

  std::error_code error;
  std::filesystem::create_directories(download_directory_, error);
  if (error) {
    callback->Continue(CefString(), true);
    return;
  }
  std::filesystem::path file_path = download_directory_ /
                                    std::filesystem::u8path(name).filename();
  const std::filesystem::path original_path = file_path;
  for (unsigned int suffix = 1;
       std::filesystem::exists(file_path, error) && !error; ++suffix) {
    file_path = original_path.parent_path() /
                (original_path.stem().wstring() + L" (" +
                 std::to_wstring(suffix) + L")" +
                 original_path.extension().wstring());
  }
  if (error || !IsWithinDirectory(download_directory_ / L".", download_directory_)) {
    callback->Continue(CefString(), true);
    return;
  }
  callback->Continue(CefString(file_path.wstring()), false);
}

void NexoraApp::DownloadUpdated(
    CefRefPtr<CefBrowser>,
    const std::string& tab_id,
    CefRefPtr<CefDownloadItem> item,
    CefRefPtr<CefDownloadItemCallback> callback) {
  if (!item) return;
  const uint32_t id = item->GetId();
  if (!download_urls_.contains(id)) {
    download_urls_[id] = item->GetURL().ToString();
    download_tabs_[id] = tab_id;
  }
  if (callback && item->IsInProgress()) {
    download_callbacks_[id] = callback;
  } else {
    download_callbacks_.erase(id);
  }

  const std::string status = item->IsComplete() ? "completed"
                            : item->IsCanceled() ? "cancelled"
                            : item->IsInterrupted() ? "failed"
                            : "in-progress";
  CefRefPtr<CefDictionaryValue> event = CefDictionaryValue::Create();
  event->SetString("type", "download");
  event->SetString("id", std::to_string(id));
  event->SetString("url", item->GetURL());
  event->SetString("path", item->GetFullPath());
  CefString file_name = item->GetSuggestedFileName();
  if (file_name.empty() && !item->GetFullPath().empty()) {
    file_name = CefString(
        std::filesystem::u8path(item->GetFullPath().ToString())
            .filename()
            .wstring());
  }
  event->SetString("fileName", file_name);
  event->SetString("status", status);
  event->SetInt("receivedBytes", static_cast<int>(std::min<int64_t>(
                                    item->GetReceivedBytes(), INT_MAX)));
  event->SetInt("totalBytes", static_cast<int>(std::min<int64_t>(
                                  item->GetTotalBytes(), INT_MAX)));
  event->SetInt("progress", item->GetPercentComplete());
  if (ui_browser_ && ui_browser_->GetMainFrame()) {
    const std::string script =
        "window.dispatchEvent(new CustomEvent('nexora-native',{detail:" +
        SerializeDictionary(event) + "}));";
    ui_browser_->GetMainFrame()->ExecuteJavaScript(script, ui_url_, 0);
  }
}

void NexoraApp::SetDownloadDirectory(const std::string& path) {
  std::filesystem::path directory =
      path.empty() ? DefaultDownloadDirectory() : std::filesystem::u8path(path);
  std::error_code error;
  if (!directory.is_absolute()) {
    SendDownloadDirectory("Choose a valid absolute folder path.");
    return;
  }
  std::filesystem::create_directories(directory, error);
  if (error || !std::filesystem::is_directory(directory, error) || error) {
    SendDownloadDirectory("Nexora could not use that download folder.");
    return;
  }
  download_directory_ = std::filesystem::canonical(directory, error);
  if (error) {
    SendDownloadDirectory("Nexora could not access that download folder.");
    return;
  }
  if (std::find(download_roots_.begin(), download_roots_.end(),
                download_directory_) == download_roots_.end()) {
    download_roots_.push_back(download_directory_);
  }
  SendDownloadDirectory();
}

void NexoraApp::ChooseDownloadDirectory() {
  BROWSEINFOW browse{};
  browse.hwndOwner = window_;
  browse.lpszTitle = L"Choose Nexora's download folder";
  browse.ulFlags = BIF_RETURNONLYFSDIRS | BIF_NEWDIALOGSTYLE;
  PIDLIST_ABSOLUTE selection = SHBrowseForFolderW(&browse);
  if (!selection) return;
  wchar_t path[MAX_PATH]{};
  if (SHGetPathFromIDListW(selection, path)) {
    SetDownloadDirectory(CefString(path).ToString());
  }
  CoTaskMemFree(selection);
}

void NexoraApp::CancelDownload(const std::string& id_text) {
  char* end = nullptr;
  const unsigned long id = std::strtoul(id_text.c_str(), &end, 10);
  if (end == id_text.c_str() || *end != '\0' || id > UINT32_MAX) return;
  const auto found = download_callbacks_.find(static_cast<uint32_t>(id));
  if (found != download_callbacks_.end()) found->second->Cancel();
}

void NexoraApp::RetryDownload(const std::string& id_text,
                              const std::string& requested_url) {
  char* end = nullptr;
  const unsigned long id = std::strtoul(id_text.c_str(), &end, 10);
  if (end == id_text.c_str() || *end != '\0' || id > UINT32_MAX) return;
  const auto prior_url = download_urls_.find(static_cast<uint32_t>(id));
  const std::string url = prior_url == download_urls_.end()
                              ? requested_url
                              : prior_url->second;
  if (!IsWebUrl(url)) return;
  auto browser = site_browsers_.find(download_tabs_[static_cast<uint32_t>(id)]);
  if (browser == site_browsers_.end() && !site_browsers_.empty()) {
    browser = site_browsers_.find(active_tab_id_);
  }
  if (browser != site_browsers_.end()) {
    browser->second->GetMainFrame()->LoadURL(url);
  }
}

void NexoraApp::OpenDownload(const std::string& path,
                             bool show_in_folder) {
  const std::filesystem::path requested = std::filesystem::u8path(path);
  for (const auto& root : download_roots_) {
    if (!IsWithinDirectory(requested, root)) continue;
    std::error_code error;
    const std::filesystem::path file = std::filesystem::canonical(requested, error);
    if (error || !std::filesystem::is_regular_file(file, error) || error) return;
    if (show_in_folder) {
      const std::wstring arguments = L"/select,\"" + file.wstring() + L"\"";
      ShellExecuteW(window_, L"open", L"explorer.exe", arguments.c_str(),
                    nullptr, SW_SHOWNORMAL);
    } else {
      ShellExecuteW(window_, L"open", file.c_str(), nullptr, nullptr,
                    SW_SHOWNORMAL);
    }
    return;
  }
}

void NexoraApp::SendDownloadDirectory(const std::string& error) {
  if (!ui_browser_ || !ui_browser_->GetMainFrame()) return;
  CefRefPtr<CefDictionaryValue> event = CefDictionaryValue::Create();
  event->SetString("type", "downloadDirectory");
  event->SetString("path", CefString(download_directory_.wstring()));
  if (!error.empty()) event->SetString("error", error);
  const std::string script =
      "window.dispatchEvent(new CustomEvent('nexora-native',{detail:" +
      SerializeDictionary(event) + "}));";
  ui_browser_->GetMainFrame()->ExecuteJavaScript(script, ui_url_, 0);
}

void NexoraApp::ActivateTab(const std::string& tab_id, const std::string& url) {
  if (tab_id.empty()) {
    return;
  }
  active_tab_id_ = tab_id;
  if (site_browsers_.find(tab_id) == site_browsers_.end() && IsWebUrl(url)) {
    CefWindowInfo window_info;
    RECT bounds = viewport_;
    if (bounds.right <= bounds.left || bounds.bottom <= bounds.top) {
      bounds = RECT{0, 0, 1, 1};
    }
    window_info.SetAsChild(window_, CefRect(bounds.left, bounds.top,
                                            bounds.right - bounds.left,
                                            bounds.bottom - bounds.top));
    CefBrowserSettings browser_settings;
    CefRefPtr<BrowserClient> client = new BrowserClient(this, tab_id, false);
    site_clients_[tab_id] = client;
    const auto pending = pending_urls_.find(tab_id);
    const std::string initial_url = pending == pending_urls_.end() ? url : pending->second;
    pending_urls_.erase(tab_id);
    CefBrowserHost::CreateBrowser(window_info, client, initial_url, browser_settings,
                                  nullptr, nullptr);
  }
  UpdateSiteVisibility();
}

void NexoraApp::NavigateTab(const std::string& tab_id, const std::string& url) {
  if (tab_id.empty()) {
    return;
  }
  if (url == "nexora://newtab") {
    active_tab_id_ = tab_id;
    UpdateSiteVisibility();
    return;
  }
  if (!IsWebUrl(url)) {
    return;
  }
  const auto found = site_browsers_.find(tab_id);
  if (found == site_browsers_.end()) {
    pending_urls_[tab_id] = url;
    if (tab_id == active_tab_id_) {
      ActivateTab(tab_id, url);
    }
    return;
  }
  found->second->GetMainFrame()->LoadURL(url);
}

void NexoraApp::UpdateViewport(const std::string& tab_id,
                               int x,
                               int y,
                               int width,
                               int height,
                               bool visible) {
  if (tab_id.empty() || x < 0 || y < 0 || width < 0 || height < 0 ||
      x > 10000 || y > 10000 || width > 10000 || height > 10000) {
    return;
  }
  if (tab_id != active_tab_id_) {
    return;
  }
  viewport_ = RECT{x, y, x + width, y + height};
  viewport_visible_ = visible && width > 0 && height > 0;
  UpdateSiteVisibility();
}

void NexoraApp::CloseTab(const std::string& tab_id) {
  const auto found = site_browsers_.find(tab_id);
  if (found != site_browsers_.end()) {
    found->second->GetHost()->CloseBrowser(true);
  }
  pending_urls_.erase(tab_id);
  if (tab_id == active_tab_id_) {
    active_tab_id_.clear();
  }
  UpdateSiteVisibility();
}

void NexoraApp::UpdateSiteVisibility() {
  for (const auto& [tab_id, browser] : site_browsers_) {
    const bool visible = tab_id == active_tab_id_ && viewport_visible_ && !closing_;
    CefRefPtr<CefBrowserHost> host = browser->GetHost();
    host->WasHidden(!visible);
    const HWND browser_window = host->GetWindowHandle();
    if (visible) {
      SetWindowPos(browser_window, HWND_TOP, viewport_.left, viewport_.top,
                   viewport_.right - viewport_.left,
                   viewport_.bottom - viewport_.top,
                   SWP_NOACTIVATE | SWP_SHOWWINDOW);
      SetFocus(browser_window);
    } else {
      ShowWindow(browser_window, SW_HIDE);
    }
  }
}

void NexoraApp::CloseUiBrowser() {
  if (ui_browser_) {
    ui_browser_->GetHost()->CloseBrowser(true);
  } else if (window_) {
    DestroyWindow(window_);
  }
}

std::string GetExecutableDirectory() {
  std::wstring path(32768, L'\0');
  const DWORD length = GetModuleFileNameW(nullptr, path.data(),
                                         static_cast<DWORD>(path.size()));
  path.resize(length);
  return std::filesystem::path(path).parent_path().string();
}

std::string GetApplicationUiUrl() {
  return "nexora://app/index.html";
}
