import unittest
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from transcribe_local import normalize_times


class TranscriptionTimestampTests(unittest.TestCase):
    def test_clamps_whisper_segment_that_extends_past_audio_duration(self):
        self.assertEqual(normalize_times(0.0, 7.0, 4.48), (0.0, 4.48))

    def test_clamps_negative_start_and_keeps_end_after_start(self):
        self.assertEqual(normalize_times(-2.0, 1.25, 4.0), (0.0, 1.25))
        self.assertEqual(normalize_times(3.2, 2.0, 4.0), (3.2, 3.2))


if __name__ == '__main__':
    unittest.main()
