#pragma once

// One oscillator's bus: the sum of its voices -> Unison -> Chain -> gate.
//
// The gate fades the bus in and out over 5 ms. Turning the oscillator on or off, changing its sample or its
// effect order "resets effects": the gate closes, Unison and the chain are reset at silence, then it reopens.

#include "ChainStage.h"

#include <ivandaw/fx.h>

namespace ap {

class OscBus {
public:
    static constexpr float kGateSeconds = 0.005f;

    ChainParams fx;
    ivandaw::fx::UnisonParams unison; // voices 0 = Unison bypassed

    explicit OscBus(double sampleRate) : unison_(sampleRate), chain_(sampleRate, fx) {
        unison.type = ivandaw::fx::UnisonType::Detune;
        unison.voices = 0;
    }

    void setOn(bool on) {
        if (on != on_) {
            on_ = on;
            resetPending_ = true;
        }
    }
    bool on() const { return on_; }

    void requestReset() { resetPending_ = true; }

    // Applied with a reset, at silence.
    void setOrder(const int order[kEffectCount]) {
        if (!isPermutation(order)) {
            return;
        }
        for (int i = 0; i < kEffectCount; ++i) {
            pendingOrder_[i] = order[i];
        }
        hasPendingOrder_ = true;
        resetPending_ = true;
    }
    // The order the UI shows: the pending one if a change is waiting for silence.
    int order(int position) const { return hasPendingOrder_ ? pendingOrder_[position] : chain_.order(position); }

    // Off and fully faded out: the voices may skip this oscillator.
    bool silent() const { return !on_ && gate_ == 0.0f && !resetPending_; }

    // True once, right after a reset happened (the engine swaps samples then).
    bool takeJustReset() {
        const bool was = justReset_;
        justReset_ = false;
        return was;
    }

    Sample process(Sample in, float dt) {
        const float target = (on_ && !resetPending_) ? 1.0f : 0.0f;
        const float step = dt / kGateSeconds;
        if (gate_ < target) {
            gate_ = gate_ + step < target ? gate_ + step : target;
        } else if (gate_ > target) {
            gate_ = gate_ - step > target ? gate_ - step : target;
        }
        if (gate_ == 0.0f && resetPending_) {
            unison_.Reset();
            chain_.Reset();
            if (hasPendingOrder_) {
                chain_.setOrder(pendingOrder_);
                hasPendingOrder_ = false;
            }
            resetPending_ = false;
            justReset_ = true;
        }
        if (gate_ == 0.0f) {
            return {};
        }
        Sample s = in;
        if (unison.voices > 0) {
            s = unison_.Apply(unison, s, dt);
        }
        s = chain_.Apply(s, dt);
        return {s.l * gate_, s.r * gate_};
    }

private:
    ivandaw::fx::Unison unison_;
    Chain chain_;
    float gate_ = 1.0f;
    bool on_ = true;
    bool resetPending_ = false;
    bool justReset_ = false;
    int pendingOrder_[kEffectCount] = {};
    bool hasPendingOrder_ = false;
};

} // namespace ap
