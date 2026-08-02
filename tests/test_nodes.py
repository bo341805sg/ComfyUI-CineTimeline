from __future__ import annotations
import importlib.util, json, sys, types, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]; PACKAGE = "cinetimeline_nodes_test"
package = types.ModuleType(PACKAGE); package.__path__ = [str(ROOT)]; sys.modules[PACKAGE] = package
def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path); module = importlib.util.module_from_spec(spec); sys.modules[name] = module; spec.loader.exec_module(module); return module
load(f"{PACKAGE}.core", ROOT / "core.py"); nodes = load(f"{PACKAGE}.nodes", ROOT / "nodes.py")

class FakeImages:
    def __init__(self, values): self.values = list(values); self.shape = (len(values), 1, 1, 1)
    def __getitem__(self, indices): return FakeImages([self.values[i] for i in indices])

class TimelineNodeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls): cls.source = (ROOT / "examples" / "multi_reference_timeline.json").read_text(encoding="utf-8")
    def test_expected_nodes_registered(self): self.assertEqual(len(nodes.NODE_CLASS_MAPPINGS), 7)
    def test_editor_and_ltx_adapter(self):
        timeline, normalized, summary = nodes.CineTimelineEditor().build(self.source); self.assertIn("2 shot(s)", summary); self.assertEqual(json.loads(normalized)["schema"], "cine_timeline"); plan, refs, _, prompt, frames, fps = nodes.CineTimelineLTXAdapter().adapt(timeline, "SHOT_002", 0); self.assertEqual((frames, fps, len(refs)), (96, 24.0, 4)); self.assertIn("close-up", prompt); self.assertEqual(plan["shot_id"], "SHOT_002")
    def test_image_batch_reordered_by_priority(self):
        timeline, _, _ = nodes.CineTimelineEditor().build(self.source); plan, *_ = nodes.CineTimelineLTXAdapter().adapt(timeline, "SHOT_002", 0); selected, guide_json, count = nodes.CineTimelineLTXImageBatch().select(FakeImages(["A", "B", "SCENE", "BOARD"]), plan); self.assertEqual(count, 4); self.assertEqual(selected.values, ["A", "B", "BOARD", "SCENE"]); self.assertEqual(json.loads(guide_json)[2]["reference_id"], "SHOT_002_STORYBOARD")
    def test_out_of_range_image_index_rejected(self):
        timeline, _, _ = nodes.CineTimelineEditor().build(self.source); plan, *_ = nodes.CineTimelineLTXAdapter().adapt(timeline, "SHOT_002", 0)
        with self.assertRaises(ValueError): nodes.CineTimelineLTXImageBatch().select(FakeImages(["A"]), plan)
    def test_output_node_returns_ui_and_result(self):
        output = nodes.CineTimelineTestOutput().display("timeline ok")
        self.assertEqual(output["ui"]["text"], ["timeline ok"])
        self.assertEqual(output["result"], ("timeline ok",))
    def test_ltx_guide_slot_exposes_timeline_controls(self):
        timeline, _, _ = nodes.CineTimelineEditor().build(self.source)
        plan, *_ = nodes.CineTimelineLTXAdapter().adapt(timeline, "SHOT_002", 0)
        reference_id, reference_type, start, end, strength, image_index, _ = (
            nodes.CineTimelineLTXGuideSlot().select(plan, 2)
        )
        self.assertEqual(reference_id, "SHOT_002_STORYBOARD")
        self.assertEqual(reference_type, "storyboard")
        self.assertEqual((start, end, strength, image_index), (0, 96, 0.7, 3))

    def test_example_workflow_links_are_consistent(self):
        workflow = json.loads((ROOT / "examples" / "CineTimeline-multi-reference-example.json").read_text(encoding="utf-8"))
        by_id = {node["id"]: node for node in workflow["nodes"]}
        for link_id, source_id, source_slot, target_id, target_slot, _kind in workflow["links"]:
            self.assertIn(link_id, by_id[source_id]["outputs"][source_slot]["links"])
            self.assertEqual(by_id[target_id]["inputs"][target_slot]["link"], link_id)

if __name__ == "__main__": unittest.main()
