cmake_minimum_required(VERSION 3.25)

# macOS: one universal build for Apple Silicon and Intel, Big Sur and later. Must be set before project().
# Other platforms ignore these.
set(CMAKE_OSX_ARCHITECTURES "arm64;x86_64" CACHE STRING "macOS architectures")
set(CMAKE_OSX_DEPLOYMENT_TARGET "11.0" CACHE STRING "Minimum macOS version")

# VERSION matches apps/web/src/manifest.ts. Bump both together.
project(AxolotlPad VERSION 0.0.1 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# The core does not throw or use RTTI. JUCE does, so these flags stay on the core only.
function(ap_core_flags target)
    if(MSVC)
        target_compile_options(${target} PRIVATE /GR- /EHs-c- /W4)
        target_compile_definitions(${target} PRIVATE _HAS_EXCEPTIONS=0 _USE_MATH_DEFINES)
    else()
        target_compile_options(${target} PRIVATE -fno-exceptions -fno-rtti -Wall -Wextra)
    endif()
endfunction()

# Shared effects: Delay, Reverb, Filter, Unison.
include(FetchContent)
FetchContent_Declare(ivandaw_engine_core
    GIT_REPOSITORY https://github.com/zhirnovcodes/ivan-daw-engine-core.git
    GIT_TAG v0.1.0
    GIT_SHALLOW TRUE)
FetchContent_MakeAvailable(ivandaw_engine_core)

# params.json is the one parameter list. CMake writes it out as a C++ header at configure time
# (ids as an enum, ranges and defaults as a table), so the core can never disagree with it.
# Editing params.json re-runs configure.
set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS ${CMAKE_CURRENT_SOURCE_DIR}/params.json)
file(READ ${CMAKE_CURRENT_SOURCE_DIR}/params.json AP_PARAMS_JSON)
string(JSON ap_param_count LENGTH "${AP_PARAMS_JSON}" params)
math(EXPR ap_param_last "${ap_param_count} - 1")
set(ap_param_enum "")
set(ap_param_rows "")
foreach(index RANGE ${ap_param_last})
    string(JSON param_id GET "${AP_PARAMS_JSON}" params ${index} id)
    string(JSON param_kind GET "${AP_PARAMS_JSON}" params ${index} kind)
    string(JSON param_min GET "${AP_PARAMS_JSON}" params ${index} min)
    string(JSON param_max GET "${AP_PARAMS_JSON}" params ${index} max)
    string(JSON param_default GET "${AP_PARAMS_JSON}" params ${index} default)
    string(JSON param_lfo ERROR_VARIABLE param_lfo_error GET "${AP_PARAMS_JSON}" params ${index} lfo)
    if(param_lfo_error OR NOT param_lfo)
        set(param_lfo false)
    else()
        set(param_lfo true)
    endif()
    if(param_kind STREQUAL "float")
        set(param_kind_cpp Float)
    elseif(param_kind STREQUAL "int")
        set(param_kind_cpp Int)
    elseif(param_kind STREQUAL "boolean")
        set(param_kind_cpp Boolean)
    elseif(param_kind STREQUAL "choice")
        set(param_kind_cpp Choice)
    elseif(param_kind STREQUAL "trigger")
        set(param_kind_cpp Trigger)
    else()
        message(FATAL_ERROR "params.json: ${param_id} has unknown kind ${param_kind}")
    endif()
    string(APPEND ap_param_enum "    ${param_id} = ${index},\n")
    string(APPEND ap_param_rows
        "    {\"${param_id}\", ParamKind::${param_kind_cpp}, ${param_min}, ${param_max}, ${param_default}, ${param_lfo}},\n")
endforeach()
file(CONFIGURE OUTPUT ${CMAKE_CURRENT_BINARY_DIR}/generated/ParamsJson.h CONTENT
"#pragma once
// Written by CMake from params.json. Do not edit.

#include <cstdint>

namespace ap {

enum class ParamKind : std::uint8_t { Float, Int, Boolean, Choice, Trigger };

struct ParamSpec {
    const char* id;
    ParamKind kind;
    double min;
    double max;
    double def;
    bool lfo; // an LFO may be mapped to it
};

namespace param {
// Index of each parameter in params.json, which is also its C ABI and Engine::setParam index.
enum Id : int {
${ap_param_enum}    count = ${ap_param_count},
};
} // namespace param

inline constexpr ParamSpec kParams[param::count] = {
${ap_param_rows}};

} // namespace ap
" @ONLY)

add_library(ap_engine STATIC
    core/domain/Lfo.cpp
    core/domain/LoopPlayer.cpp
    core/engine/Engine.cpp
)
target_include_directories(ap_engine PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/core/domain
    ${CMAKE_CURRENT_SOURCE_DIR}/core/engine
    ${CMAKE_CURRENT_BINARY_DIR}/generated
)
target_link_libraries(ap_engine PUBLIC ivandaw::engine_core)
ap_core_flags(ap_engine)

if(EMSCRIPTEN)
    # Standalone module for the AudioWorklet: instantiated directly, no Emscripten JS glue.
    add_executable(axolotl-pad hosts/web/boundary/api.cpp)
    target_link_libraries(axolotl-pad PRIVATE ap_engine)
    ap_core_flags(axolotl-pad)
    set_target_properties(axolotl-pad PROPERTIES SUFFIX ".wasm")
    target_link_options(axolotl-pad PRIVATE
        -O2
        --no-entry
        -sSTANDALONE_WASM
        -sALLOW_MEMORY_GROWTH
        -sFILESYSTEM=0
        -sEXPORTED_FUNCTIONS=_ap_alloc,_ap_free,_ap_create,_ap_destroy,_ap_set_param,_ap_param,_ap_set_fx_order,_ap_set_sample,_ap_transport,_ap_midi,_ap_all_off,_ap_process,_ap_active_voices,_ap_out_count,_ap_out_frame,_ap_out_kind,_ap_out_bytes,_ap_out_slot,_ap_out_value
    )
else()
    add_executable(ap_tests
        tests/main.cpp
        tests/domain_tests.cpp
        tests/chain_tests.cpp
        tests/engine_tests.cpp
    )
    target_link_libraries(ap_tests PRIVATE ap_engine)
    ap_core_flags(ap_tests)

    # The desktop plugin (VST3 / AU / Standalone) is built on macOS and Windows only. Linux CI builds the
    # core tests and the wasm, and has no WebView libraries for JUCE.
    if(APPLE OR WIN32)
        set(ap_plugin_default ON)
    else()
        set(ap_plugin_default OFF)
    endif()
    option(AP_PLUGIN "Build the JUCE plugin (VST3, AU, Standalone)" ${ap_plugin_default})
endif()

if(NOT EMSCRIPTEN AND AP_PLUGIN)
    set(JUCE_BUILD_EXTRAS OFF CACHE BOOL "" FORCE)
    set(JUCE_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
    # A local checkout in third_party/JUCE wins. A clean clone (a CI machine) downloads the same commit.
    set(AP_JUCE_DIR ${CMAKE_CURRENT_SOURCE_DIR}/third_party/JUCE)
    if(EXISTS ${AP_JUCE_DIR}/CMakeLists.txt)
        add_subdirectory(${AP_JUCE_DIR} ${CMAKE_BINARY_DIR}/_juce EXCLUDE_FROM_ALL)
    else()
        FetchContent_Declare(juce
            GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
            GIT_TAG ea77444750de45e036e0279bb0291144bf8e3688 # 8.0.16-security, same as Beatality
            GIT_SHALLOW FALSE
            EXCLUDE_FROM_ALL)
        FetchContent_MakeAvailable(juce)
    endif()

    juce_add_plugin(AxolotlPad
        COMPANY_NAME "zhirnovcodes"
        BUNDLE_ID com.ivancodes.axolotl-pad
        PLUGIN_MANUFACTURER_CODE Ivdw
        PLUGIN_CODE Axp1
        FORMATS AU VST3 Standalone
        AU_MAIN_TYPE kAudioUnitType_MusicDevice
        HARDENED_RUNTIME_ENABLED TRUE
        PRODUCT_NAME "Axolotl Pad"
        VERSION ${PROJECT_VERSION}
        IS_SYNTH TRUE
        NEEDS_MIDI_INPUT TRUE
        NEEDS_MIDI_OUTPUT FALSE
        IS_MIDI_EFFECT FALSE
        EDITOR_WANTS_KEYBOARD_FOCUS TRUE
        COPY_PLUGIN_AFTER_BUILD FALSE
        NEEDS_WEB_BROWSER TRUE
        NEEDS_WEBVIEW2 TRUE
        NEEDS_CURL FALSE
        VST3_CATEGORIES Instrument Synth
    )
    target_sources(AxolotlPad PRIVATE
        hosts/plugin/PluginProcessor.cpp
        hosts/plugin/State.cpp
    )

    # Built into the plugin binary: the parameter list and the built-in samples. No install step.
    file(READ ${CMAKE_CURRENT_SOURCE_DIR}/samples/samples.json AP_SAMPLES_JSON)
    string(JSON ap_sample_count LENGTH "${AP_SAMPLES_JSON}" samples)
    math(EXPR ap_sample_last "${ap_sample_count} - 1")
    set(ap_sample_files "")
    foreach(index RANGE ${ap_sample_last})
        string(JSON sample_file GET "${AP_SAMPLES_JSON}" samples ${index} file)
        list(APPEND ap_sample_files samples/${sample_file})
    endforeach()
    set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS ${CMAKE_CURRENT_SOURCE_DIR}/samples/samples.json)
    juce_add_binary_data(AxolotlPadData
        HEADER_NAME AxolotlPadData.h
        NAMESPACE AxolotlPadData
        SOURCES
            params.json
            samples/samples.json
            ${ap_sample_files}
    )

    # The window: the web skin (apps/web/src/ui) and the built-in presets (presets/) bundled by Vite into one skin.js,
    # served by the editor's web view.
    # Needs Node and `pnpm install` once; the bundle rebuilds when a skin file changes.
    find_program(AP_NODE node REQUIRED)
    set(ap_vite ${CMAKE_CURRENT_SOURCE_DIR}/apps/web/node_modules/vite/bin/vite.js)
    if(NOT EXISTS ${ap_vite})
        message(FATAL_ERROR "The plugin window needs the web skin's tools. Run `pnpm install` in the repo root first.")
    endif()
    file(GLOB_RECURSE ap_ui_sources CONFIGURE_DEPENDS
        ${CMAKE_CURRENT_SOURCE_DIR}/apps/web/src/*.ts
        ${CMAKE_CURRENT_SOURCE_DIR}/apps/web/src/*.css
        ${CMAKE_CURRENT_SOURCE_DIR}/apps/web/src/ui/assets/*
        ${CMAKE_CURRENT_SOURCE_DIR}/presets/*.axolotl) # the built-in presets, bundled into skin.js
    set(ap_ui_dir ${CMAKE_CURRENT_BINARY_DIR}/ui)
    add_custom_command(
        OUTPUT ${ap_ui_dir}/skin.js
        COMMAND ${AP_NODE} ${ap_vite} build --config vite.vst.config.ts --outDir ${ap_ui_dir} --logLevel warn
        WORKING_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}/apps/web
        DEPENDS ${ap_ui_sources} ${CMAKE_CURRENT_SOURCE_DIR}/apps/web/vite.vst.config.ts
                ${CMAKE_CURRENT_SOURCE_DIR}/params.json ${CMAKE_CURRENT_SOURCE_DIR}/samples/samples.json
        COMMENT "Bundling the skin for the plugin window"
        VERBATIM)
    juce_add_binary_data(AxolotlPadUi
        HEADER_NAME AxolotlPadUi.h
        NAMESPACE AxolotlPadUi
        SOURCES
            hosts/plugin/ui/index.html
            ${ap_ui_dir}/skin.js
    )
    target_sources(AxolotlPad PRIVATE hosts/plugin/PluginEditor.cpp)

    target_compile_definitions(AxolotlPad PUBLIC
        JUCE_USE_WIN_WEBVIEW2_WITH_STATIC_LINKING=1
        JUCE_USE_CURL=0
        JUCE_VST3_CAN_REPLACE_VST2=0
    )
    target_link_libraries(AxolotlPad
        PRIVATE
            ap_engine
            AxolotlPadData
            AxolotlPadUi
            juce::juce_audio_utils
            juce::juce_audio_formats
            juce::juce_gui_extra
        PUBLIC
            juce::juce_recommended_config_flags
            juce::juce_recommended_warning_flags
    )

    # Plugin tests without a DAW: the processor plays notes, the state is the web build's JSON.
    juce_add_console_app(ap_plugin_tests PRODUCT_NAME "ap_plugin_tests")
    target_sources(ap_plugin_tests PRIVATE
        tests/plugin/plugin_tests.cpp
        hosts/plugin/PluginProcessor.cpp
        hosts/plugin/State.cpp)
    target_include_directories(ap_plugin_tests PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/hosts/plugin)
    target_compile_definitions(ap_plugin_tests PRIVATE
        JucePlugin_Name="Axolotl Pad"
        JUCE_USE_CURL=0
        JUCE_WEB_BROWSER=0)
    target_link_libraries(ap_plugin_tests
        PRIVATE
            ap_engine
            AxolotlPadData
            juce::juce_audio_utils
            juce::juce_audio_formats
        PUBLIC
            juce::juce_recommended_config_flags)
endif()
