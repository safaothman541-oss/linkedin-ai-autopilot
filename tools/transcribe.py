#!/usr/bin/env python3
# transcribe.py — get WORD-LEVEL timestamps from the narration so captions sync perfectly.
# Usage: python3 transcribe.py <input.wav> <output.json>
# Writes {"words":[{"text","start","end"}, ...]}. On any failure writes {"words":[]} so the
# video falls back to estimated timing (never crashes the pipeline).
import sys, json

out_path = sys.argv[2] if len(sys.argv) > 2 else "words.json"

def write(words):
    try:
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump({"words": words}, f)
    except Exception:
        pass

try:
    wav = sys.argv[1]
    from faster_whisper import WhisperModel
    # base.en is a good speed/accuracy balance for clean TTS audio.
    model = WhisperModel("base.en", device="cpu", compute_type="int8")
    segments, _info = model.transcribe(wav, word_timestamps=True, beam_size=1)
    words = []
    for seg in segments:
        for w in (seg.words or []):
            t = (w.word or "").strip()
            if t:
                words.append({
                    "text": t,
                    "start": round(float(w.start), 3),
                    "end": round(float(w.end), 3),
                })
    write(words)
    print("transcribed %d words" % len(words))
except Exception as e:
    write([])
    print("transcribe failed (using estimated timing): %s" % e)
