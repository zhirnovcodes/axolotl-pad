#pragma once

// Attack / sustain / release amplitude envelope for one oscillator of one voice. Sustain is always 1:
// a pad holds while the key is down. Attack and release are linear in level and read every frame,
// so a knob move while a note sounds takes effect at once.

#include <cstdint>

namespace ap {

class AmpEnv {
public:
    // Every stolen voice fades out this fast before it plays its new note.
    static constexpr float kKillSeconds = 0.005f;

    // From the current level, so a retrigger never jumps.
    void start() {
        stage_ = Stage::Attack;
        fast_ = false;
    }

    void release() {
        if (stage_ == Stage::Idle || stage_ == Stage::Release) {
            return;
        }
        stage_ = Stage::Release;
        releaseFrom_ = level_;
    }

    // Fade out in kKillSeconds, whatever the release knob says.
    void kill() {
        if (stage_ == Stage::Idle) {
            return;
        }
        if (stage_ != Stage::Release) {
            releaseFrom_ = level_;
        }
        stage_ = Stage::Release;
        fast_ = true;
    }

    float next(float attackSeconds, float releaseSeconds, float dt) {
        switch (stage_) {
        case Stage::Idle:
            level_ = 0.0f;
            break;
        case Stage::Attack:
            level_ += dt / (attackSeconds > 0.0f ? attackSeconds : dt);
            if (level_ >= 1.0f) {
                level_ = 1.0f;
                stage_ = Stage::Sustain;
            }
            break;
        case Stage::Sustain:
            level_ = 1.0f;
            break;
        case Stage::Release: {
            const float seconds = fast_ ? kKillSeconds : releaseSeconds;
            level_ -= releaseFrom_ * dt / (seconds > 0.0f ? seconds : dt);
            if (level_ <= 0.0f) {
                level_ = 0.0f;
                stage_ = Stage::Idle;
                fast_ = false;
            }
            break;
        }
        }
        return level_;
    }

    bool idle() const { return stage_ == Stage::Idle; }
    bool releasing() const { return stage_ == Stage::Release; }
    float level() const { return level_; }

private:
    enum class Stage : std::uint8_t { Idle, Attack, Sustain, Release };

    Stage stage_ = Stage::Idle;
    float level_ = 0.0f;
    float releaseFrom_ = 0.0f;
    bool fast_ = false;
};

} // namespace ap
