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

add_executable(nexora WIN32
  native/main.cpp
  native/app.cpp
  native/app.h
)
target_compile_features(nexora PRIVATE cxx_std_20)
target_include_directories(nexora PRIVATE "${CEF_ROOT}" "${CEF_ROOT}/include")
SET_EXECUTABLE_TARGET_PROPERTIES(nexora)
configure_file(
  "${CEF_ROOT}/tests/cefsimple/win/cefsimple.exe.manifest"
  "${CMAKE_CURRENT_BINARY_DIR}/nexora.exe.manifest"
  COPYONLY
)
configure_file(
  "${CEF_ROOT}/tests/cefsimple/win/compatibility.manifest"
  "${CMAKE_CURRENT_BINARY_DIR}/compatibility.manifest"
  COPYONLY
)
ADD_WINDOWS_MANIFEST("${CMAKE_CURRENT_BINARY_DIR}" nexora "exe")
add_dependencies(nexora libcef_dll_wrapper)
target_link_libraries(nexora PRIVATE libcef_lib libcef_dll_wrapper ${CEF_STANDARD_LIBS})

COPY_FILES(nexora "${CEF_BINARY_FILES}" "${CEF_BINARY_DIR}" "${CEF_TARGET_OUT_DIR}")
COPY_FILES(nexora "${CEF_RESOURCE_FILES}" "${CEF_RESOURCE_DIR}" "${CEF_TARGET_OUT_DIR}")

add_custom_command(TARGET nexora POST_BUILD
  COMMAND "${CMAKE_COMMAND}" -E copy_directory
    "${CMAKE_SOURCE_DIR}/dist"
    "$<TARGET_FILE_DIR:nexora>/web"
  VERBATIM
)
