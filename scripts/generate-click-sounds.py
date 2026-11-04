#!/usr/bin/env python3
"""Generate the click1-click5 sound packs from code (numpy + stdlib wave only).

Every sample is synthesized here: no recordings or third-party audio are used.
Output keeps the original filenames and WAV format (16-bit PCM, same channels/rate).
Deterministic: a fixed seed per file, so re-running gives byte-identical files.

Usage: python3 scripts/generate-click-sounds.py
"""
import os
import wave

import numpy as np

OUT = os.path.join(os.path.dirname(__file__), "..", "frontend", "static", "sounds")

# pack: (channels, rate, frame counts per file, synth)
def env(n, rate, attack_ms, decay_ms):
    t = np.arange(n) / rate
    a = np.clip(t / (attack_ms / 1000), 0, 1)
    return a * np.exp(-t / (decay_ms / 1000))

def noise(n, rng):
    return rng.standard_normal(n)

def lowpass(x, alpha):
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc += alpha * (v - acc)
        y[i] = acc
    return y

def click(n, rate, rng, k):  # short tick, gently low-passed
    t = np.arange(n) / rate
    tone = np.sin(2 * np.pi * (3200 + 300 * k) * t)
    return lowpass((0.6 * tone + 0.4 * noise(n, rng)) * env(n, rate, 0.2, 2.5), 0.45)

def beep(n, rate, rng, k):  # soft sine beep
    t = np.arange(n) / rate
    f = [880.0, 987.77, 1046.5][k % 3]
    return np.sin(2 * np.pi * f * t) * env(n, rate, 3, 35) * np.clip((n - np.arange(n)) / (0.01 * rate), 0, 1)

def pop(n, rate, rng, k):  # pitch-dropping pop
    t = np.arange(n) / rate
    f = (900 + 120 * k) * np.exp(-t * 60) + 180
    phase = 2 * np.pi * np.cumsum(f) / rate
    return np.sin(phase) * env(n, rate, 0.5, 8)

def thock(n, rate, rng, k):  # muffled key thock: filtered noise + low body
    t = np.arange(n) / rate
    body = np.sin(2 * np.pi * (220 + 25 * k) * t) * env(n, rate, 0.5, 18)
    tap = lowpass(noise(n, rng), 0.25) * env(n, rate, 0.2, 6)
    return 0.6 * body + 1.2 * tap

def typewriter(n, rate, rng, k):  # metallic strike + mechanical rattle
    t = np.arange(n) / rate
    strike = noise(n, rng) * env(n, rate, 0.1, 4)
    ring = sum(np.sin(2 * np.pi * f * t) / (i + 1) for i, f in enumerate([1850 + 60 * k, 2930, 4410]))
    ring = ring * env(n, rate, 0.5, 30)
    tail_start = int(0.045 * rate)
    tail = np.zeros(n)
    m = n - tail_start
    if m > 0:
        tail[tail_start:] = lowpass(noise(m, rng), 0.4) * env(m, rate, 0.5, 15) * 0.5
    return lowpass(strike + 0.35 * ring + tail, 0.5)

PACKS = {
    "click1": (2, 48000, [897, 896, 896], click),
    "click2": (1, 44100, [5072, 5072, 5072], beep),
    "click3": (2, 44100, [1715, 1715, 1715], pop),
    "click4": (2, 44100, [6998, 7246, 7712, 7246, 7348, 9075], thock),
    "click5": (2, 44100, [10112, 11520, 11264, 13312, 14160, 10256], typewriter),
}

# Loudness targets: RMS (full scale = 1.0) of the old file each one replaces,
# measured once from main. Only these numbers are kept; no old audio is used.
TARGET_RMS = {
    "click1": [0.03384, 0.03956, 0.03863],
    "click2": [0.15173, 0.15179, 0.15193],
    "click3": [0.09078, 0.11619, 0.09415],
    "click4": [0.01824, 0.01612, 0.02222, 0.01814, 0.0141, 0.01274],
    "click5": [0.01552, 0.01398, 0.01469, 0.01257, 0.0124, 0.01678],
}
MAX_PEAK = 0.98  # hard ceiling: never clip
TRIM = {"click4", "click5"}  # packs whose near-silent tails are trimmed
MAX_TAIL_S = 0.213
SILENCE = 10 ** (-60 / 20)  # -60 dB below the file's peak counts as silent

def trim_tail(data, rate):
    peak = np.max(np.abs(data)) or 1
    loud = np.nonzero(np.abs(data) > peak * SILENCE)[0]
    end = min(len(data), (loud[-1] + 1) if len(loud) else len(data), int(MAX_TAIL_S * rate))
    data = data[:end].copy()
    fade = min(end, int(0.005 * rate))
    data[end - fade:] *= np.linspace(1, 0, fade)
    return data

def level(data, target_rms):
    data = data * (target_rms / (np.sqrt(np.mean(data ** 2)) or 1))
    peak = np.max(np.abs(data))
    if peak > MAX_PEAK:
        data = data * (MAX_PEAK / peak)
    return data

def write(path, data, channels, rate):
    pcm = (data * 32767).astype("<i2")
    if channels == 2:
        pcm = np.column_stack([pcm, pcm]).ravel()
    with wave.open(path, "wb") as w:
        w.setnchannels(channels)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm.tobytes())

def main():
    for p, (ch, rate, lens, synth) in PACKS.items():
        for k, n in enumerate(lens):
            rng = np.random.default_rng(1000 * int(p[5:]) + k)
            path = os.path.join(OUT, p, f"{k + 1}.wav")
            data = synth(n, rate, rng, k)
            if p in TRIM:
                data = trim_tail(data, rate)
            data = level(data, TARGET_RMS[p][k])
            write(path, data, ch, rate)
            print("wrote", os.path.relpath(path))

if __name__ == "__main__":
    main()
