#!/usr/bin/env python3
# transcribe.py — free local speech-to-text with WORD-level timestamps using
# faster-whisper. Used to (a) find the best moments and (b) build word-by-word
# captions. Decodes the media directly (audio or video) via ffmpeg/PyAV.
#
# Usage: python transcribe.py <media_path> <out.json> [model] [lang]
#   model: tiny.en | base.en | small.en | medium.en | large-v3  (default base.en)
#   lang : force a language code (e.g. en) or "auto" (default auto)
# Output JSON: {"language","duration","words":[{start,end,word}],
#               "segments":[{start,end,text}]}
import sys, json
from faster_whisper import WhisperModel


def main():
    media = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else "transcript.json"
    model_size = sys.argv[3] if len(sys.argv) > 3 else "base.en"
    lang = sys.argv[4] if len(sys.argv) > 4 else "auto"

    # int8 on CPU = the fast, free path; downloads the model once and caches it.
    model = WhisperModel(model_size, device="cpu", compute_type="int8")
    segments, info = model.transcribe(
        media,
        language=None if lang == "auto" else lang,
        word_timestamps=True,
        vad_filter=True,                       # skip long silences = faster + cleaner
        vad_parameters={"min_silence_duration_ms": 500},
        beam_size=1,                           # greedy = faster, fine for captions
    )

    words, sents = [], []
    for seg in segments:
        sents.append({"start": round(seg.start, 3), "end": round(seg.end, 3), "text": seg.text.strip()})
        for w in (seg.words or []):
            tok = w.word.strip()
            if tok:
                words.append({"start": round(w.start, 3), "end": round(w.end, 3), "word": tok})
        # progress to stderr so the orchestrator can show life on long files
        print(f"… {seg.end:7.1f}s  {seg.text.strip()[:60]}", file=sys.stderr)

    data = {"language": info.language, "duration": round(info.duration, 2), "words": words, "segments": sents}
    with open(out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    print(json.dumps({"ok": True, "language": info.language, "duration": data["duration"], "words": len(words), "segments": len(sents)}))


if __name__ == "__main__":
    main()
