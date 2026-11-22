#include "LoopPlayer.h"

#include <algorithm>
#include <cmath>

namespace ap {

void LoopPlayer::start(const SampleData* sample, int note, double engineRate) {
    heads_[0] = {};
    heads_[1] = {};
    sample_ = (sample != nullptr && sample->valid() && engineRate > 0.0) ? sample : nullptr;
    if (sample_ == nullptr) {
        return;
    }
    const double last = static_cast<double>(sample_->frames - 1);
    loopStart_ = std::clamp(sample_->loopStart * sample_->rate, 0.0, last - 1.0);
    loopEnd_ = sample_->loopEnd > sample_->loopStart ? std::clamp(sample_->loopEnd * sample_->rate, loopStart_ + 1.0, last)
                                                     : last;
    const double crossfade = sample_->crossfade > 0.0 ? sample_->crossfade : kDefaultCrossfadeSeconds;
    fade_ = std::max(1.0, std::min(crossfade * sample_->rate, (loopEnd_ - loopStart_) * 0.5));
    startFade_ = std::max(1.0, std::min(kStartFadeSeconds * sample_->rate, fade_));
    noteStep_ = std::pow(2.0, (note - sample_->rootNote) / 12.0) * sample_->rate / engineRate;
    step_ = noteStep_;
    heads_[0].pos = loopStart_;
    heads_[0].on = true;
    heads_[0].fadeIn = startFade_;
}

void LoopPlayer::stop() {
    heads_[0] = {};
    heads_[1] = {};
}

float LoopPlayer::gain(const Head& head) const {
    // sin of a 0..1 ramp: the fade-in at loopStart and the fade-out at loopEnd sum to equal power.
    const double in = (head.pos - loopStart_) / head.fadeIn;
    const double out = (loopEnd_ - head.pos) / fade_;
    const double x = std::clamp(std::min(in, out), 0.0, 1.0);
    return static_cast<float>(std::sin(x * 1.57079632679489661923));
}

Sample LoopPlayer::read(double pos) const {
    const int last = sample_->frames - 1;
    const int i = std::clamp(static_cast<int>(pos), 0, last);
    const int j = std::min(i + 1, last);
    const float t = static_cast<float>(pos - static_cast<double>(i));
    const float* l = sample_->left;
    const float* r = sample_->right != nullptr ? sample_->right : sample_->left;
    return {l[i] + (l[j] - l[i]) * t, r[i] + (r[j] - r[i]) * t};
}

Sample LoopPlayer::next() {
    Sample out{};
    if (sample_ == nullptr) {
        return out;
    }
    for (const Head& head : heads_) {
        if (head.on) {
            const float g = gain(head);
            const Sample s = read(head.pos);
            out.l += s.l * g;
            out.r += s.r * g;
        }
    }
    // Advance and retire first, then start the next pass, so a new head is not advanced twice.
    for (Head& head : heads_) {
        if (head.on) {
            head.pos += step_;
            if (head.pos >= loopEnd_) {
                head.on = false;
            }
        }
    }
    const double seam = loopEnd_ - fade_;
    for (int h = 0; h < 2; ++h) {
        Head& head = heads_[h];
        Head& other = heads_[1 - h];
        if (head.on && !head.spawned && head.pos >= seam && !other.on) {
            // The next pass starts as far past loopStart as this one is past the seam, so the fades line up.
            other.pos = loopStart_ + (head.pos - seam);
            other.on = true;
            other.spawned = false;
            other.fadeIn = fade_;
            head.spawned = true;
        }
    }
    return out;
}

} // namespace ap
