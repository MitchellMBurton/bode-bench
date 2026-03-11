#!/usr/bin/env python3
"""
probe_audio.py
Probes an audio file using FFmpeg and prints key metadata.
Useful for checking sample rate, duration, codec, channels
before loading into the console.

Usage:
  python probe_audio.py path/to/audio.flac
"""

import json
import subprocess
import sys
from pathlib import Path


def probe(path: Path) -> dict:
    cmd = [
        "ffprobe",
        "-v", "quiet",
        "-print_format", "json",
        "-show_streams",
        "-show_format",
        str(path),
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        return json.loads(result.stdout)
    except FileNotFoundError:
        print("ERROR: ffprobe not found. Install FFmpeg.", file=sys.stderr)
        sys.exit(1)
    except subprocess.CalledProcessError as e:
        print(f"ERROR: ffprobe failed: {e.stderr}", file=sys.stderr)
        sys.exit(1)


def main():
    if len(sys.argv) < 2:
        print("Usage: python probe_audio.py <audio_file>", file=sys.stderr)
        sys.exit(1)

    path = Path(sys.argv[1])
    if not path.exists():
        print(f"ERROR: File not found: {path}", file=sys.stderr)
        sys.exit(1)

    data = probe(path)
    fmt = data.get("format", {})
    streams = data.get("streams", [])

    print(f"\nFile:      {path}")
    print(f"Format:    {fmt.get('format_long_name', 'unknown')}")
    print(f"Duration:  {float(fmt.get('duration', 0)):.3f}s")
    print(f"Bit rate:  {int(fmt.get('bit_rate', 0)) // 1000} kbps")

    for s in streams:
        if s.get("codec_type") == "audio":
            print(f"\nAudio stream:")
            print(f"  Codec:       {s.get('codec_long_name', s.get('codec_name', 'unknown'))}")
            print(f"  Sample rate: {s.get('sample_rate', '?')} Hz")
            print(f"  Channels:    {s.get('channels', '?')}")
            print(f"  Layout:      {s.get('channel_layout', '?')}")
            print(f"  Bit depth:   {s.get('bits_per_raw_sample', '?')}")


if __name__ == "__main__":
    main()
