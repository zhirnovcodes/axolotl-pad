// C ABI over ap::Engine for the IvanDAW web build: a standalone wasm the AudioWorklet instantiates.
// Every index is a params.json index; values are plain (min..max).

#include "Engine.h"

#include <cstdint>
#include <cstdlib>
#include <new>

#define AP_EXPORT extern "C" __attribute__((used, visibility("default")))

namespace {

struct Instance {
    ap::Engine engine;
    ap::OutBuffer out;
    Instance(double rate, std::uint32_t seed) : engine(rate, seed) {}
};

} // namespace

AP_EXPORT void* ap_alloc(int bytes) { return bytes > 0 ? std::malloc(static_cast<std::size_t>(bytes)) : nullptr; }

AP_EXPORT void ap_free(void* p) { std::free(p); }

AP_EXPORT Instance* ap_create(double rate, std::uint32_t seed) {
    if (!(rate > 0)) {
        return nullptr;
    }
    void* memory = std::malloc(sizeof(Instance));
    return memory != nullptr ? new (memory) Instance(rate, seed) : nullptr;
}

AP_EXPORT void ap_destroy(Instance* i) {
    if (i != nullptr) {
        i->~Instance();
        std::free(i);
    }
}

AP_EXPORT void ap_set_param(Instance* i, int index, double value) {
    if (i != nullptr) {
        i->engine.setParam(index, value);
    }
}

AP_EXPORT double ap_param(Instance* i, int index) { return i != nullptr ? i->engine.param(index) : 0.0; }

// Returns 1 when accepted (a permutation of 0 delay, 1 reverb, 2 filter).
AP_EXPORT int ap_set_fx_order(Instance* i, int osc, int a, int b, int c) {
    return (i != nullptr && i->engine.setFxOrder(osc, a, b, c)) ? 1 : 0;
}

// The caller allocates left / right with ap_alloc and keeps them alive while the engine lives.
// right may be 0 for a mono sample. Times are in seconds; crossfade <= 0 means the default. Returns 1 when accepted.
AP_EXPORT int ap_set_sample(Instance* i, int index, const float* left, const float* right, int frames, double rate,
                            int rootNote, double loopStart, double loopEnd, double crossfade) {
    if (i == nullptr) {
        return 0;
    }
    ap::SampleData data;
    data.left = left;
    data.right = right;
    data.frames = frames;
    data.rate = rate;
    data.rootNote = rootNote;
    data.loopStart = loopStart;
    data.loopEnd = loopEnd;
    data.crossfade = crossfade;
    return i->engine.setSample(index, data) ? 1 : 0;
}

AP_EXPORT void ap_transport(Instance* i, int playing, double bpm, double beat, int num, int den, int frame) {
    if (i == nullptr) {
        return;
    }
    ap::Transport t;
    t.playing = playing != 0;
    t.bpm = bpm;
    t.beat = beat;
    t.numerator = num;
    t.denominator = den;
    i->engine.transport(t, frame);
}

AP_EXPORT void ap_midi(Instance* i, int frame, int status, int d1, int d2) {
    if (i != nullptr) {
        i->engine.midi(frame, static_cast<std::uint8_t>(status), static_cast<std::uint8_t>(d1),
                       static_cast<std::uint8_t>(d2));
    }
}

AP_EXPORT void ap_all_off(Instance* i, int frame) {
    if (i != nullptr) {
        i->engine.allOff(frame, i->out);
    }
}

// Clears left / right, then renders `frames` frames into them.
AP_EXPORT void ap_process(Instance* i, int frames, float* left, float* right) {
    if (i == nullptr || frames <= 0) {
        return;
    }
    for (int k = 0; k < frames; ++k) {
        if (left != nullptr) {
            left[k] = 0.0f;
        }
        if (right != nullptr) {
            right[k] = 0.0f;
        }
    }
    i->out.clear();
    i->engine.process(frames, left, right, i->out);
}

AP_EXPORT int ap_active_voices(Instance* i) { return i != nullptr ? i->engine.activeVoices() : 0; }

// An instrument emits no events; these keep the ABI the same shape as every IvanDAW plugin.
AP_EXPORT int ap_out_count(Instance* i) { return i != nullptr ? i->out.size() : 0; }
AP_EXPORT int ap_out_frame(Instance* i, int k) { return i != nullptr ? i->out[k].frame : 0; }
AP_EXPORT int ap_out_kind(Instance* i, int k) { return i != nullptr ? static_cast<int>(i->out[k].kind) : 0; }
AP_EXPORT int ap_out_bytes(Instance* i, int k) {
    if (i == nullptr) {
        return 0;
    }
    const ap::OutEvent& e = i->out[k];
    return e.b0 | (e.b1 << 8) | (e.b2 << 16);
}
AP_EXPORT int ap_out_slot(Instance* i, int k) { return i != nullptr ? i->out[k].slot : 0; }
AP_EXPORT float ap_out_value(Instance* i, int k) { return i != nullptr ? i->out[k].value : 0.0f; }
