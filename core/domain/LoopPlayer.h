#pragma once

// Plays one built-in sample at a note's pitch, looping between loopStart and loopEnd while the voice lives.
//
// Every pass through the loop has its own 5 ms fade-in at loopStart and 5 ms fade-out before loopEnd.
// When one pass enters its last 5 ms, a second read head starts the next pass at loopStart, so the two
// overlap and crossfade (equal power): no click at the seam.

#include <ivandaw/fx/Sample.h>

namespace ap {

using ivandaw::fx::Sample;

// A sample the host owns. The memory must outlive every voice that plays it.
struct SampleData {
    const float* left = nullptr;
    const float* right = nullptr; // nullptr = mono, left is used for both sides
    int frames = 0;
    double rate = 0.0;     // the data's sample rate
    int rootNote = 60;     // the MIDI note the sample plays as recorded
    double loopStart = 0.0; // seconds
    double loopEnd = 0.0;   // seconds; <= loopStart means the whole sample

    bool valid() const { return left != nullptr && frames > 1 && rate > 0.0; }
};

class LoopPlayer {
public:
    static constexpr double kFadeSeconds = 0.005;

    // Starts at loopStart with the 5 ms fade-in. `sample` may be nullptr (silence).
    void start(const SampleData* sample, int note, double engineRate);
    void stop();
    Sample next();
    bool active() const { return heads_[0].on || heads_[1].on; }

    // For tests: the playback rate in source frames per output frame.
    double step() const { return step_; }

private:
    struct Head {
        double pos = 0.0;
        bool on = false;
        bool spawned = false; // already started the next pass
    };

    float gain(double pos) const;
    Sample read(double pos) const;

    const SampleData* sample_ = nullptr;
    Head heads_[2];
    double step_ = 1.0;
    double loopStart_ = 0.0; // source frames
    double loopEnd_ = 0.0;
    double fade_ = 1.0;
};

} // namespace ap
