from __future__ import annotations
import importlib.util, json, sys, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("cinetimeline_core_test", ROOT / "core.py")
core = importlib.util.module_from_spec(spec); sys.modules[spec.name] = core; spec.loader.exec_module(core)

class TimelineCoreTests(unittest.TestCase):
    def setUp(self): self.source = json.loads((ROOT / "examples" / "multi_reference_timeline.json").read_text(encoding="utf-8"))
    def test_example_normalizes(self):
        timeline = core.normalize_timeline(self.source); self.assertEqual(timeline["version"], "1.0"); self.assertEqual(len(timeline["shots"]), 2); self.assertEqual(len(timeline["references"]), 4)
    def test_shot_selection_by_id_and_frame(self):
        timeline = core.normalize_timeline(self.source); self.assertEqual(core.find_shot(timeline, "SHOT_002", 0)["start_frame"], 96); self.assertEqual(core.find_shot(timeline, "", 100)["shot_id"], "SHOT_002")
    def test_active_references(self):
        timeline = core.normalize_timeline(self.source); refs = core.active_references(timeline, 96, 192); self.assertEqual({r["reference_id"] for r in refs}, {"CHAR_A", "CHAR_B", "PLATFORM_SCENE", "SHOT_002_STORYBOARD"})
    def test_ltx_local_ranges(self):
        timeline = core.normalize_timeline(self.source); plan = core.build_ltx_plan(timeline, core.find_shot(timeline, "SHOT_002")); storyboard = next(r for r in plan["references"] if r["reference_id"] == "SHOT_002_STORYBOARD"); self.assertEqual(plan["total_frames"], 96); self.assertEqual((storyboard["local_start_frame"], storyboard["local_end_frame"]), (0, 96))
    def test_overlapping_shots_are_rejected(self):
        self.source["shots"][1]["start_frame"] = 80
        with self.assertRaises(core.TimelineValidationError): core.normalize_timeline(self.source)
    def test_negative_image_index_is_rejected(self):
        self.source["references"][0]["image_index"] = -1
        with self.assertRaises(core.TimelineValidationError): core.normalize_timeline(self.source)

if __name__ == "__main__": unittest.main()
