#!/usr/bin/env python3
"""
parse_scores.py
Parses Suite No. 1 Prelude from MusicXML using music21,
exports note events as JSON to data/processed/suite1_prelude.json.

Schema: { version, metadata, events[] }
  events[]: { pitch, pitchName, onset_s, duration_s, measure, beat }

Usage:
  cd scripts && python parse_scores.py [path/to/suite1_prelude.xml]

If no file is given it looks for data/raw/suite1_prelude.xml relative
to the project root.
"""

import json
import os
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
DEFAULT_INPUT = PROJECT_ROOT / "data" / "raw" / "suite1_prelude.xml"
OUTPUT_PATH = PROJECT_ROOT / "data" / "processed" / "suite1_prelude.json"
PUBLIC_OUTPUT = PROJECT_ROOT / "app" / "public" / "data" / "processed" / "suite1_prelude.json"


def midi_to_name(midi: int) -> str:
    names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    octave = (midi // 12) - 1
    name = names[midi % 12]
    return f"{name}{octave}"


def parse_score(xml_path: Path, tempo_bpm: float = 72.0) -> dict:
    """Parse MusicXML and return the processed score dict."""
    try:
        import music21
        from music21 import converter, tempo as m21tempo
    except ImportError:
        print("ERROR: music21 not installed. Run: pip install music21", file=sys.stderr)
        sys.exit(1)

    print(f"Parsing: {xml_path}")
    score = converter.parse(str(xml_path))

    # Extract tempo if present
    tempos = score.flat.getElementsByClass(m21tempo.MetronomeMark)
    if tempos:
        tempo_bpm = float(tempos[0].number)
        print(f"  Found tempo: {tempo_bpm} BPM")
    else:
        print(f"  No tempo marking found, using {tempo_bpm} BPM")

    # seconds per quarter note
    spq = 60.0 / tempo_bpm

    events = []
    flat_notes = score.flat.notes

    for element in flat_notes:
        # Handle both Note and Chord
        pitches = []
        if hasattr(element, "pitch"):
            pitches = [element.pitch]
        elif hasattr(element, "pitches"):
            pitches = list(element.pitches)

        for pitch in pitches:
            midi = pitch.midi
            onset_q = float(element.offset)  # in quarter notes from start
            duration_q = float(element.duration.quarterLength)
            onset_s = onset_q * spq
            duration_s = max(0.05, duration_q * spq)

            # Measure and beat
            measure_num = 1
            beat = 1.0
            if element.measureNumber is not None:
                measure_num = int(element.measureNumber)
            if hasattr(element, "beat") and element.beat is not None:
                beat = float(element.beat)

            events.append({
                "pitch": midi,
                "pitchName": midi_to_name(midi),
                "onset_s": round(onset_s, 4),
                "duration_s": round(duration_s, 4),
                "measure": measure_num,
                "beat": round(beat, 3),
            })

    events.sort(key=lambda e: e["onset_s"])

    duration_s = max((e["onset_s"] + e["duration_s"] for e in events), default=0.0)

    result = {
        "version": 1,
        "metadata": {
            "collectionTitle": "Cello Suite No. 1",
            "suite": 1,
            "movement": "Prelude",
            "key": "G major",
            "tempoMarking": "Unmeasured",
            "timeSignature": "4/4",
            "estimatedDurationS": round(duration_s, 1),
            "composer": "J.S. Bach",
            "instrument": "Cello solo",
        },
        "events": events,
    }

    print(f"  Extracted {len(events)} note events, duration ~{duration_s:.1f}s")
    return result


def generate_stub() -> dict:
    """
    Generate a minimal stub score for testing when no MusicXML is available.
    Contains the opening arpeggio pattern of the Prelude.
    """
    # G major open-string arpeggio pattern (simplified, not performance-aligned)
    # MIDI: G2=43, D3=50, G3=55, B3=59, D4=62, G4=67
    arpeggio = [43, 50, 55, 59, 62, 67]
    events = []
    tempo_bpm = 72.0
    duration_q = 0.5  # eighth notes
    spq = 60.0 / tempo_bpm

    measure = 1
    beat = 1.0
    for i in range(80):  # 80 notes ≈ first few measures
        onset_s = i * duration_q * spq
        pitch = arpeggio[i % len(arpeggio)]
        events.append({
            "pitch": pitch,
            "pitchName": midi_to_name(pitch),
            "onset_s": round(onset_s, 4),
            "duration_s": round(duration_q * spq, 4),
            "measure": measure,
            "beat": round(beat, 3),
        })
        beat += 0.5
        if beat > 4.0:
            beat = 1.0
            measure += 1

    return {
        "version": 1,
        "metadata": {
            "collectionTitle": "Cello Suite No. 1",
            "suite": 1,
            "movement": "Prelude",
            "key": "G major",
            "tempoMarking": "Unmeasured",
            "timeSignature": "4/4",
            "estimatedDurationS": 156.0,
            "composer": "J.S. Bach",
            "instrument": "Cello solo",
        },
        "events": events,
    }


def main():
    xml_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_INPUT

    if xml_path.exists():
        result = parse_score(xml_path)
    else:
        print(f"No MusicXML found at {xml_path}")
        print("Generating stub score for development...")
        result = generate_stub()

    # Write to data/processed/
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)
    print(f"Written: {OUTPUT_PATH}")

    # Also copy to app/public/ so Vite can serve it
    PUBLIC_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with open(PUBLIC_OUTPUT, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)
    print(f"Written: {PUBLIC_OUTPUT}")


if __name__ == "__main__":
    main()
