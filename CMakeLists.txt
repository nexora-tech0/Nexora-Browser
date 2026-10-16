cmake_minimum_required(VERSION 3.21)
project(NexoraBrowser LANGUAGES C CXX)

if(NOT DEFINED CEF_ROOT)
  message(FATAL_ERROR "Set CEF_ROOT to the extracted CEF Windows x64 distribution.")
endif()

file(TO_CMAKE_PATH "${CEF_ROOT}" CEF_ROOT)
set(CMAKE_MODULE_PATH "${CMAKE_MODULE_PATH}" "${CEF_ROOT}/cmake")
find_package(CEF REQUIRED)

add_subdirectory("${CEF_LIBCEF_DLL_WRAPPER_PATH}" "${CMAKE_BINARY_DIR}/libcef_dll_wrapper")
ADD_LOGICAL_TARGET("libcef_lib" "${CEF_LIB_DEBUG}" "${CEF_LIB_RELEASE}")
SET_CEF_TARGET_OUT_DIR()

if(NOT USE_SANDBOX)
  message(FATAL_ERROR "Nexora requires the CEF bootstrap sandbox. Do not build with USE_SANDBOX=OFF.")
endif()

add_library(nexora SHARED
  native/main.cpp
  native/app.cpp
  native/app.h
)
target_compile_features(nexora PRIVATE cxx_std_20)
target_include_directories(nexora PRIVATE "${CEF_ROOT}" "${CEF_ROOT}/include")
SET_LIBRARY_TARGET_PROPERTIES(nexora)
add_dependencies(nexora libcef_dll_wrapper)
target_link_libraries(nexora PRIVATE libcef_lib libcef_dll_wrapper ${CEF_STANDARD_LIBS})

COPY_SINGLE_FILE(nexora "${CEF_BINARY_DIR}/bootstrap.exe" "${CEF_TARGET_OUT_DIR}/nexora.exe")
COPY_FILES(nexora "${CEF_BINARY_FILES}" "${CEF_BINARY_DIR}" "${CEF_TARGET_OUT_DIR}")
COPY_FILES(nexora "${CEF_RESOURCE_FILES}" "${CEF_RESOURCE_DIR}" "${CEF_TARGET_OUT_DIR}")

SET_LPAC_ACLS(nexora)

if(CMAKE_GENERATOR MATCHES "Visual Studio")
  set_target_properties(nexora PROPERTIES
    VS_DEBUGGER_COMMAND "$<TARGET_FILE_DIR:nexora>/nexora.exe"
  )
endif()

add_custom_command(TARGET nexora POST_BUILD
  COMMAND "${CMAKE_COMMAND}" -E copy_directory
    "${CMAKE_SOURCE_DIR}/dist"
    "$<TARGET_FILE_DIR:nexora>/web"
  COMMAND "${CMAKE_COMMAND}" -E copy_if_different
    "${CMAKE_SOURCE_DIR}/nexora-browser.ico"
    "$<TARGET_FILE_DIR:nexora>/nexora-browser.ico"
  VERBATIM
)
