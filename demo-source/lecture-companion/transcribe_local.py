#!/usr/bin/env python3
"""Transcribe audio locally using faster-whisper.

This is the fallback when GROQ_API_KEY is not set. For production / mobile
deployments, prefer transcribe_groq.py (much faster, no local model download).

Usage: python transcribe_local.py <audio_file>
Outputs JSON to stdout:
  { "language": "ar", "duration": 12.5, "segments": [...], "provider": "local" }
On error: { "error": "..." }

First run downloads the Whisper model (~500 MB for "small", ~3 GB for "large").
Subsequent runs use the cached model.
"""
import json
import os
import sys
from pathlib import Path

# Default model size. Smaller = faster but less accurate.
# Options: tiny, base, small, medium, large-v3
MODEL_SIZE = os.environ.get("WHISPER_MODEL_SIZE", "small")


def fail(message):
    print(json.dumps({"error": message}, ensure_ascii=False))
    sys.exit(1)


def main():
    if len(sys.argv) < 2:
        fail("استخدام: transcribe_local.py <audio_file>")

    src = Path(sys.argv[1])
    if not src.exists() or not src.is_file():
        fail(f"الملف غير موجود: {src}")

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        fail("faster-whisper مش متثبت. شغّل: pip install -r requirements.txt")

    try:
        # Use int8 quantization on CPU — works on most laptops without GPU.
        # On a machine with a GPU, switch to "cuda" + "float16" for ~5x speedup.
        model = WhisperModel(MODEL_SIZE, device="cpu", compute_type="int8")
    except Exception as e:
        fail(f"تعذر تحميل نموذج Whisper: {e}. أول تشغيل بينزّل النموذج تلقائياً.")

    try:
        segments_iter, info = model.transcribe(str(src), language=None, vad_filter=True)
        segments = []
        for seg in segments_iter:
            text = seg.text.strip()
            if text:
                segments.append({
                    "start": round(seg.start, 2),
                    "end": round(seg.end, 2),
                    "text": text
                })
    except Exception as e:
        fail(f"تعذر تفريغ التسجيل: {e}")

    if not segments:
        fail("لم يعثر Whisper على كلام واضح في التسجيل.")

    result = {
        "language": info.language if info else "unknown",
        "duration": round(info.duration if info else 0, 2),
        "segments": segments,
        "provider": "local"
    }
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        fail(str(e))
