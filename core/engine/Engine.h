#pragma once

// Axolotl Pad engine: the only class the hosts call.
//
// note on -> Voice (x8): per oscillator LoopPlayer (note x octave + detune Hz) -> AmpEnv x vol x velocity -> pan
//         -> sum per oscillator -> OscBus (Unison -> Chain[order] -> gate)
//         -> osc mix -> master gain -> soft guard -> out
// Three global LFOs modulate one mapped parameter each, at control rate.

#include "AmpEnv.h"
#include "ChainStage.h"
#include "Lfo.h"
#include "LoopPlayer.h"
#include "OscBus.h"
#include "OscMix.h"
#include "ParamsJson.h"

#include <cstdint>

namespace ap {

struct Transport {
    bool playing = false;
    double bpm = 120;
    double beat = 0; // beats from project start at the frame this is applied
    int numerator = 4;
    int denominator = 4;
};

// What the engine sends out. An instrument leaves it empty; kept so every IvanDAW plugin has one shape.
struct OutEvent {
    int frame;
    enum Kind : std::uint8_t { Midi, Control } kind;
    std::uint8_t b0, b1, b2;
    int slot;
    float value;
};

class OutBuffer {
public:
    static constexpr int kCapacity = 512;
    bool push(const OutEvent& e) {
        if (size_ >= kCapacity) {
            return false;
        }
        events_[size_++] = e;
        return true;
    }
    int size() const { return size_; }
    const OutEvent& operator[](int i) const { return events_[i]; }
    void clear() { size_ = 0; }

private:
    OutEvent events_[kCapacity] = {};
    int size_ = 0;
};

class Engine {
public:
    static constexpr int kVoices = 8;
    static constexpr int kOscs = 2;
    static constexpr int kLfos = 3;
    static constexpr int kMaxSamples = 16;
    static constexpr int kControlFrames = 32; // LFOs and parameters are resolved every 32 frames
    static constexpr int kMaxEvents = 256;
    static constexpr float kMasterGain = 0.6f;

    // Allocates every delay line and reverb tank. Never construct on the audio thread.
    Engine(double sampleRate, std::uint32_t seed);

    // index = position in params.json, value = plain (min..max). Out of range index: ignored.
    void setParam(int index, double value);
    double param(int index) const;

    // Effects order for osc 0 or 1: a permutation of 0 delay, 1 reverb, 2 filter. Anything else is ignored.
    // Not a parameter, so no automation and no LFO reaches it.
    bool setFxOrder(int osc, int a, int b, int c);
    int fxOrder(int osc, int position) const;

    // Registers built-in sample `index`. The engine keeps the pointers, not a copy.
    bool setSample(int index, const SampleData& data);

    // Applied at `frame` of the next process() call. Call in frame order.
    void transport(const Transport& t, int frame);
    void midi(int frame, std::uint8_t status, std::uint8_t d1, std::uint8_t d2);

    // Adds `frames` frames into left / right (the host clears them first). Either may be nullptr.
    void process(int frames, float* left, float* right, OutBuffer& out);

    // Releases every voice at `frame` of the next process() call.
    void allOff(int frame, OutBuffer& out);

    // Seconds of sound after the last note off, at the current settings.
    double tailSeconds() const;

    int activeVoices() const;
    double beat() const { return beat_; }

private:
    struct Voice {
        int note = -1;
        float velocity = 0.0f;
        std::uint64_t age = 0;
        bool held = false;      // key down
        bool sustained = false; // key up while the pedal is down
        int pendingNote = -1;   // stolen: plays this note once the 5 ms fade ends
        float pendingVelocity = 0.0f;
        AmpEnv env[kOscs];
        LoopPlayer player[kOscs];

        bool active() const { return !env[0].idle() || !env[1].idle() || pendingNote >= 0; }
        bool releasing() const { return !held && !sustained; }
    };

    enum class EventKind : std::uint8_t { Midi, Transport, AllOff };
    struct Event {
        int frame = 0;
        EventKind kind = EventKind::Midi;
        std::uint8_t status = 0, d1 = 0, d2 = 0;
        Transport transport;
    };

    void push(const Event& e);
    bool handle(const Event& e); // false: drop the rest of the queue (CC 120 / 123)
    void noteOn(int note, int velocity);
    void noteOff(int note);
    void startVoice(Voice& voice, int note, float velocity);
    void startPlayer(Voice& voice, int osc);
    void releaseAll();
    void controlTick();
    void renderFrame(float* left, float* right);
    const SampleData* sampleFor(int osc) const;

    float normalized(int index) const;

    double sampleRate_;
    float dt_;
    Voice voices_[kVoices];
    std::uint64_t ageCounter_ = 0;
    bool sustainPedal_ = false;

    OscBus bus0_;
    OscBus bus1_;
    OscBus* buses_[kOscs] = {&bus0_, &bus1_};
    SampleData samples_[kMaxSamples] = {};
    int oscSample_[kOscs] = {0, 0};     // the sample each oscillator plays now
    int pendingSample_[kOscs] = {0, 0}; // swapped in at the next reset

    Lfo lfo_[kLfos];
    float lfoOut_[kLfos] = {0.5f, 0.5f, 0.5f};

    double base_[param::count] = {};    // plain values the host set
    float effective_[param::count] = {}; // normalized, after LFO modulation
    float smoothed_[param::count] = {};  // normalized, glided toward effective_
    bool smoothedReady_ = false;
    int lfoTargets_[param::count] = {};
    int lfoTargetCount_ = 0;
    float smoothK_ = 1.0f;

    // Resolved per control tick, read per frame.
    float attack_[kOscs] = {};
    float release_[kOscs] = {};
    float voiceGainL_[kOscs] = {};
    float voiceGainR_[kOscs] = {};
    int octave_[kOscs] = {0, 0};          // osc N oct
    float detuneHz_[kOscs] = {0.0f, 0.0f}; // osc N detune, Hz added to each voice's note frequency
    MixGains mix_{};

    Event events_[kMaxEvents] = {};
    int eventCount_ = 0;
    int tickLeft_ = 0;

    double bpm_ = 120.0;
    double beat_ = 0.0;
    bool playing_ = false;
};

} // namespace ap
