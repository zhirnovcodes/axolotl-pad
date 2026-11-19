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
    # JUCE (VST3 / AU / Standalone) arrives in 1.0.0, in this branch. See docs/plan.md.
endif()
